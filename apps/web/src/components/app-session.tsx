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
import {
  answerInvitation,
  ApiError,
  createSession,
  listInvitations,
  listPeers,
} from "#/lib/api.ts";
import type { DeviceInvitation, Peer } from "#/lib/api.ts";
import { connectRoom } from "#/lib/cable.ts";
import { loadDeviceKeyPair } from "#/lib/device-crypto.ts";
import {
  generateSessionToken,
  loadLocalDevice,
  saveLocalDevice,
} from "#/lib/device.ts";
import { activeInvitations, mergeInvitation } from "#/lib/invitations.ts";
import { island } from "#/lib/island.ts";

type CableEventHandler = (payload: Record<string, unknown>) => void;

interface AppSession {
  token: string;
  self: Peer;
  peers: Peer[];
  connected: boolean;
  invitations: DeviceInvitation[];
  respondToInvitation: (
    id: string,
    action: "accept" | "decline" | "disconnect"
  ) => Promise<void>;
  setPeers: (updater: Peer[] | ((current: Peer[]) => Peer[])) => void;
  subscribeToEvents: (handler: CableEventHandler) => () => void;
}

const mergePeers = (current: Peer[], incoming: Peer[]): Peer[] => {
  const next = new Map(current.map((peer) => [peer.id, peer]));
  for (const peer of incoming) {
    next.set(peer.id, peer);
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
  const [invitations, setInvitations] = useState<DeviceInvitation[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [identityLost, setIdentityLost] = useState(false);
  const bootSession = useRef<ReturnType<typeof createSession> | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const listenersRef = useRef(new Set<CableEventHandler>());
  const refreshVersion = useRef(0);
  useEffect(() => {
    selfIdRef.current = self?.id ?? null;
  }, [self?.id]);

  const applySession = useCallback(
    (device: Peer, nextPeers: Peer[], sessionToken: string) => {
      setSelf(device);
      setPeers(nextPeers.filter((peer) => peer.id !== device.id));
      saveLocalDevice({
        sessionToken,
        id: device.id,
        displayName: device.display_name,
        deviceKind: device.device_kind,
      });
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        bootSession.current ??= (async () => {
          const keys = await loadDeviceKeyPair();
          return createSession({
            sessionToken: local.sessionToken,
            public_key: keys.publicSpki,
            id: local.id,
            displayName: local.displayName,
            deviceKind: local.deviceKind,
          });
        })();
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
    const [deviceList, inviteList] = await Promise.all([
      listPeers(token),
      listInvitations(token),
    ]);
    if (version !== refreshVersion.current) {
      return;
    }
    setPeers(deviceList.peers);
    setInvitations(activeInvitations(inviteList.invitations));
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
        if (type === "invitation_updated" && payload.invitation) {
          const invitation = payload.invitation as DeviceInvitation;
          setInvitations((current) => mergeInvitation(current, invitation));
          refresh();
          if (
            invitation.sender.id === selfIdRef.current &&
            (invitation.status === "accepted" ||
              invitation.status === "declined")
          ) {
            island.notice({
              title:
                invitation.status === "accepted"
                  ? "Invitation accepted"
                  : "Invitation declined",
              description:
                invitation.status === "accepted"
                  ? `${invitation.recipient.display_name} is ready to share.`
                  : `${invitation.recipient.display_name} declined your invitation.`,
              kind: invitation.status === "accepted" ? "success" : "error",
            });
          }
        }
        if (type === "peer_joined" || type === "peer_updated") {
          const peer = payload as unknown as Peer;
          if (peer.id && peer.id !== selfIdRef.current) {
            setPeers((current) => mergePeers(current, [peer]));
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
  }, [token, refreshDevices, invalidateRefresh]);

  const respondToInvitation = useCallback(
    async (id: string, action: "accept" | "decline" | "disconnect") => {
      if (!token) {
        throw new Error("Reconnect before answering this invitation.");
      }
      const { invitation } = await answerInvitation(token, id, action);
      setInvitations((current) => mergeInvitation(current, invitation));
      void refreshDevices().catch(() => {
        // The response succeeded; a later refresh will update presence.
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
            invitations,
            respondToInvitation,
            setPeers,
            subscribeToEvents,
          }
        : null,
    [
      token,
      self,
      peers,
      connected,
      invitations,
      respondToInvitation,
      subscribeToEvents,
    ]
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
