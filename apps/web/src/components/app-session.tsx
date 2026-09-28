import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { EmptyState } from "#/components/empty-state.tsx";
import { Button } from "#/components/motion/button/index.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { mergeClaim, pendingClaims } from "#/lib/account-devices.ts";
import {
  answerDeviceClaim,
  ApiError,
  createSession,
  listDeviceClaims,
  listPeers,
} from "#/lib/api.ts";
import type { DeviceClaim, Peer } from "#/lib/api.ts";
import { connectRoom } from "#/lib/cable.ts";
import { loadDeviceKeyPair } from "#/lib/device-crypto.ts";
import {
  generateSessionToken,
  loadLocalDevice,
  saveLocalDevice,
} from "#/lib/device.ts";

type CableEventHandler = (payload: Record<string, unknown>) => void;

interface AppSession {
  token: string;
  self: Peer;
  peers: Peer[];
  connected: boolean;
  /** Nearby accounts asking to save this device, waiting for an answer here. */
  claims: DeviceClaim[];
  respondToClaim: (id: string, action: "accept" | "decline") => Promise<void>;
  setPeers: (updater: Peer[] | ((current: Peer[]) => Peer[])) => void;
  subscribeToEvents: (handler: CableEventHandler) => () => void;
}

// Presence events don't say how this device reaches the peer, so keep the
// relation from the last peer list.
const mergePeers = (current: Peer[], incoming: Peer[]): Peer[] => {
  const next = new Map(current.map((peer) => [peer.id, peer]));
  for (const peer of incoming) {
    next.set(peer.id, {
      ...peer,
      relation: peer.relation ?? next.get(peer.id)?.relation,
    });
  }
  return [...next.values()];
};

const AppSessionContext = createContext<AppSession | null>(null);

export function useAppSession(): AppSession {
  const session = useContext(AppSessionContext);
  if (!session) {
    throw new Error("useAppSession must be used within AppSessionProvider");
  }
  return session;
}

interface AppSessionProviderProps {
  children: ReactNode;
}

export function AppSessionProvider({ children }: AppSessionProviderProps) {
  const local = useMemo(() => loadLocalDevice(), []);
  const [token, setToken] = useState<string | null>(null);
  const [self, setSelf] = useState<Peer | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connected, setConnected] = useState(false);
  const [claims, setClaims] = useState<DeviceClaim[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [identityLost, setIdentityLost] = useState(false);
  const bootSession = useRef<ReturnType<typeof createSession> | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const listenersRef = useRef(new Set<CableEventHandler>());
  const refreshVersion = useRef(0);
  const peersRef = useRef<Peer[]>([]);
  useEffect(() => {
    selfIdRef.current = self?.id ?? null;
  }, [self?.id]);
  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  // The server's name wins: a saved device uses the name its owner chose.
  const rememberDevice = useCallback((device: Peer, sessionToken: string) => {
    saveLocalDevice({
      sessionToken,
      id: device.id,
      displayName: device.display_name,
      deviceKind: device.device_kind,
    });
  }, []);

  const applySession = useCallback(
    (device: Peer, nextPeers: Peer[], sessionToken: string) => {
      setSelf(device);
      setPeers(nextPeers.filter((peer) => peer.id !== device.id));
      rememberDevice(device, sessionToken);
    },
    [rememberDevice]
  );

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        if (bootSession.current === null) {
          bootSession.current = (async () => {
            const keys = await loadDeviceKeyPair();
            return createSession({
              sessionToken: local.sessionToken,
              public_key: keys.publicSpki,
              id: local.id,
              displayName: local.displayName,
              deviceKind: local.deviceKind,
            });
          })();
        }
        const session = await bootSession.current;
        if (cancelled) {
          return;
        }
        setToken(session.token);
        applySession(session.device, session.peers, session.token);
      } catch (error) {
        if (!cancelled) {
          setIdentityLost(error instanceof ApiError && error.status === 401);
          setBootError(
            error instanceof Error
              ? error.message
              : "Could not join the network"
          );
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [applySession, local]);

  const subscribeToEvents = useCallback((handler: CableEventHandler) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!token) {
      return;
    }
    refreshVersion.current += 1;
    const version = refreshVersion.current;
    const [deviceList, claimList] = await Promise.all([
      listPeers(token),
      listDeviceClaims(token),
    ]);
    if (version !== refreshVersion.current) {
      return;
    }
    setPeers(deviceList.peers);
    setClaims(pendingClaims(claimList.claims));
  }, [token]);

  const invalidateRefresh = useCallback(() => {
    refreshVersion.current += 1;
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }
    const refresh = () => {
      void refreshDevices().catch(() => {
        // Keep the last snapshot until the connection recovers.
      });
    };
    const disconnect = connectRoom(token, {
      onConnect: () => {
        setConnected(true);
        refresh();
      },
      onDisconnect: () => {
        setConnected(false);
      },
      onEvent: (payload) => {
        const { type } = payload;
        if (type === "device_claim_updated" && payload.claim) {
          const claim = payload.claim as DeviceClaim;
          if (claim.target.id === selfIdRef.current) {
            setClaims((current) => mergeClaim(current, claim));
          }
        }
        if (type === "self_updated" && payload.device) {
          const device = payload.device as Peer;
          setSelf((current) => (current ? { ...current, ...device } : current));
          rememberDevice(device, token);
        }
        if (type === "peers_changed") {
          refresh();
        }
        if (type === "peer_joined" || type === "peer_updated") {
          const peer = payload as unknown as Peer;
          if (peer.id && peer.id !== selfIdRef.current) {
            // A newcomer's relation is unknown until the list is refetched.
            const known = peersRef.current.some((item) => item.id === peer.id);
            setPeers((current) => mergePeers(current, [peer]));
            if (!known) {
              refresh();
            }
          }
        }
        if (type === "peer_left" && typeof payload.id === "string") {
          setPeers((current) =>
            current.filter((peer) => peer.id !== payload.id)
          );
        }
        for (const listener of listenersRef.current) {
          listener(payload);
        }
      },
    });
    const timer = globalThis.setInterval(refresh, 30_000);
    return () => {
      invalidateRefresh();
      globalThis.clearInterval(timer);
      disconnect();
    };
  }, [token, refreshDevices, invalidateRefresh, rememberDevice]);

  const respondToClaim = useCallback(
    async (id: string, action: "accept" | "decline") => {
      if (!token) {
        throw new Error("Reconnect before answering this request.");
      }
      const { claim } = await answerDeviceClaim(token, id, action);
      setClaims((current) => mergeClaim(current, claim));
      void refreshDevices().catch(() => {
        // The answer went through; a later refresh will update presence.
      });
    },
    [token, refreshDevices]
  );

  const session = useMemo(
    () =>
      self && token
        ? {
            token,
            self,
            peers,
            connected,
            claims,
            respondToClaim,
            setPeers,
            subscribeToEvents,
          }
        : null,
    [token, self, peers, connected, claims, respondToClaim, subscribeToEvents]
  );

  if (bootError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          action={
            <Button
              type="button"
              onClick={() => {
                if (identityLost) {
                  saveLocalDevice({
                    ...local,
                    id: crypto.randomUUID(),
                    sessionToken: generateSessionToken(),
                  });
                }
                globalThis.location.reload();
              }}
            >
              {identityLost ? "Create a new device identity" : "Retry"}
            </Button>
          }
          description={bootError}
          title="Could not connect"
        />
      </div>
    );
  }

  if (!self || !token) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          description="Registering this device on the network."
          icon={<Loader label="Connecting" variant="dots" />}
          title="Looking for nearby devices"
        />
      </div>
    );
  }

  return (
    <AppSessionContext.Provider value={session}>
      {children}
    </AppSessionContext.Provider>
  );
}
