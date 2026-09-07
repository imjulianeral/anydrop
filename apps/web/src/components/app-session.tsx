import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { EmptyState } from "#/components/empty-state.tsx";
import { Button } from "#/components/motion/button/index.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { createSession, updateDevice, type Peer } from "#/lib/api.ts";
import { connectRoom } from "#/lib/cable.ts";
import { loadLocalDevice, saveLocalDevice } from "#/lib/device.ts";

type CableEventHandler = (payload: Record<string, unknown>) => void;

interface AppSession {
  token: string;
  self: Peer;
  peers: Peer[];
  connected: boolean;
  setPeers: (updater: Peer[] | ((current: Peer[]) => Peer[])) => void;
  joinRoom: (roomCode: string | null) => Promise<void>;
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
  const [bootError, setBootError] = useState<string | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const listenersRef = useRef(new Set<CableEventHandler>());
  selfIdRef.current = self?.id ?? null;

  const applySession = useCallback((device: Peer, nextPeers: Peer[]) => {
    setSelf(device);
    setPeers(nextPeers.filter((peer) => peer.id !== device.id));
    saveLocalDevice({
      id: device.id,
      displayName: device.display_name,
      deviceKind: device.device_kind,
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const roomFromUrl = params.get("room");
    let cancelled = false;

    const boot = async () => {
      try {
        const session = await createSession({
          id: local.id,
          displayName: local.displayName,
          deviceKind: local.deviceKind,
        });
        if (cancelled) {
          return;
        }
        setToken(session.token);
        applySession(session.device, session.peers);
        if (roomFromUrl && roomFromUrl !== session.device.room_code) {
          const updated = await updateDevice(session.token, {
            roomCode: roomFromUrl,
          });
          if (!cancelled) {
            applySession(updated.device, updated.peers);
          }
        }
      } catch (error) {
        if (!cancelled) {
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

  useEffect(() => {
    if (!token) {
      return;
    }
    return connectRoom(token, {
      onConnect: () => {
        setConnected(true);
      },
      onDisconnect: () => {
        setConnected(false);
      },
      onEvent: (payload) => {
        const { type } = payload;
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
  }, [token]);

  const joinRoom = async (roomCode: string | null) => {
    if (!token) {
      return;
    }
    const updated = await updateDevice(token, { roomCode });
    applySession(updated.device, updated.peers);
  };

  if (bootError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          action={
            <Button
              type="button"
              onClick={() => {
                globalThis.location.reload();
              }}
            >
              Retry
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
          title="Looking for the room"
        />
      </div>
    );
  }

  return (
    <AppSessionContext.Provider
      value={{
        token,
        self,
        peers,
        connected,
        setPeers,
        joinRoom,
        subscribeToEvents,
      }}
    >
      {children}
    </AppSessionContext.Provider>
  );
}
