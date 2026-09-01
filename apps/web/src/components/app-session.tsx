import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { Button } from "#/components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty.tsx";
import { createSession, updateDevice, type Peer } from "#/lib/api.ts";
import { loadLocalDevice, saveLocalDevice } from "#/lib/device.ts";

interface AppSession {
  token: string;
  self: Peer;
  peers: Peer[];
  setPeers: (updater: Peer[] | ((current: Peer[]) => Peer[])) => void;
  rename: (displayName: string) => Promise<void>;
  joinRoom: (roomCode: string | null) => Promise<void>;
}

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
  const [bootError, setBootError] = useState<string | null>(null);

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

  const rename = async (displayName: string) => {
    if (!token) {
      return;
    }
    const updated = await updateDevice(token, { displayName });
    applySession(updated.device, updated.peers);
  };

  const joinRoom = async (roomCode: string | null) => {
    if (!token) {
      return;
    }
    const updated = await updateDevice(token, { roomCode });
    applySession(updated.device, updated.peers);
  };

  if (bootError) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Could not connect</EmptyTitle>
            <EmptyDescription>{bootError}</EmptyDescription>
          </EmptyHeader>
          <Button
            onClick={() => {
              globalThis.location.reload();
            }}
          >
            Retry
          </Button>
        </Empty>
      </div>
    );
  }

  if (!self || !token) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Looking for the room</EmptyTitle>
            <EmptyDescription>
              Registering this device on the network.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <AppSessionContext
      value={{
        token,
        self,
        peers,
        setPeers,
        rename,
        joinRoom,
      }}
    >
      {children}
    </AppSessionContext>
  );
}
