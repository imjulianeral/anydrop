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

import { useAccountSession } from "#/components/account-session.tsx";
import { useAppSession } from "#/components/app-session.tsx";
import {
  cancelDeviceClaim,
  listAccountDevices,
  mergeClaim,
  pendingClaims,
  removeSavedDevice,
  renameSavedDevice,
  requestDeviceClaim,
  saveCurrentDevice,
} from "#/lib/account-devices.ts";
import type {
  CurrentDeviceStatus,
  SavedDevice,
} from "#/lib/account-devices.ts";
import type { DeviceClaim, Peer } from "#/lib/api.ts";
import { attempt } from "#/lib/attempt.ts";
import { island } from "#/lib/island.ts";

interface AccountDevicesValue {
  /** False for guests: every saved-device action needs an account. */
  signedIn: boolean;
  loading: boolean;
  error: string | null;
  devices: SavedDevice[];
  /** Save requests this account sent that are still waiting for an answer. */
  outgoing: DeviceClaim[];
  /** Whether this browser's device is saved to the signed-in account. */
  current: CurrentDeviceStatus | null;
  refresh: () => Promise<void>;
  saveThisDevice: (name: string) => Promise<void>;
  askToSave: (peer: Peer, name: string) => Promise<void>;
  cancelRequest: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const AccountDevicesContext = createContext<AccountDevicesValue | null>(null);

const NO_DEVICES: SavedDevice[] = [];
const NO_CLAIMS: DeviceClaim[] = [];

export function useAccountDevices() {
  const value = useContext(AccountDevicesContext);
  if (!value) {
    throw new Error(
      "useAccountDevices must be used within AccountDevicesProvider"
    );
  }
  return value;
}

/**
 * Saved devices for the signed-in account. Recognition happens here: once
 * someone signs in, the server says whether this browser's device is already
 * theirs. Nothing is saved automatically, so signing in on a friend's device
 * leaves it alone.
 */
export function AccountDevicesProvider({ children }: { children: ReactNode }) {
  const { session, refresh: refreshAccount } = useAccountSession();
  const { token, self, subscribeToEvents } = useAppSession();
  const userId = session?.user?.id ?? null;
  const [devices, setDevices] = useState<SavedDevice[]>([]);
  const [outgoing, setOutgoing] = useState<DeviceClaim[]>([]);
  const [current, setCurrent] = useState<CurrentDeviceStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Which account the state above belongs to, so a sign-out or account
  // switch never shows the previous person's devices.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const version = useRef(0);

  const refresh = useCallback(async () => {
    version.current += 1;
    const requested = version.current;
    if (!userId) {
      return;
    }
    await attempt(
      async () => {
        const data = await listAccountDevices(token);
        if (requested !== version.current) {
          return;
        }
        setDevices(data.devices);
        setOutgoing(pendingClaims(data.claims));
        setCurrent(data.current?.status ?? null);
        setLoadError(null);
        setLoadedFor(userId);
      },
      {
        onError: (caught) => {
          if (requested === version.current) {
            setLoadError(
              caught instanceof Error
                ? caught.message
                : "Could not load your devices."
            );
            setLoadedFor(userId);
          }
        },
      }
    );
  }, [userId, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      subscribeToEvents((payload) => {
        if (!userId) {
          return;
        }
        if (
          payload.type === "peers_changed" ||
          payload.type === "self_updated"
        ) {
          void refresh();
          return;
        }
        if (payload.type !== "device_claim_updated" || !payload.claim) {
          return;
        }
        const claim = payload.claim as DeviceClaim;
        if (claim.requested_by?.id !== self.id) {
          return;
        }
        setOutgoing((items) => mergeClaim(items, claim));
        if (claim.status === "accepted") {
          island.notice({
            title: "Device saved",
            description: `${claim.name} is now saved to your account.`,
            kind: "success",
          });
          void refresh();
        }
        if (claim.status === "declined") {
          island.notice({
            title: "Request declined",
            description: `${claim.target.display_name} was not saved to your account.`,
            kind: "error",
          });
        }
      }),
    [subscribeToEvents, userId, self.id, refresh]
  );

  // Every account change needs a fresh CSRF token from the account session.
  const csrf = useCallback(async () => {
    const latest = await refreshAccount();
    if (!latest.user) {
      throw new Error("Sign in to save devices.");
    }
    return latest.csrf_token;
  }, [refreshAccount]);

  const saveThisDevice = useCallback(
    async (name: string) => {
      await saveCurrentDevice(await csrf(), token, name);
      await refresh();
    },
    [csrf, token, refresh]
  );

  const askToSave = useCallback(
    async (peer: Peer, name: string) => {
      const { claim } = await requestDeviceClaim(
        await csrf(),
        token,
        peer.id,
        name
      );
      setOutgoing((items) => mergeClaim(items, claim));
    },
    [csrf, token]
  );

  const cancelRequest = useCallback(
    async (id: string) => {
      const { claim } = await cancelDeviceClaim(await csrf(), id);
      setOutgoing((items) => mergeClaim(items, claim));
    },
    [csrf]
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      await renameSavedDevice(await csrf(), id, name);
      await refresh();
    },
    [csrf, refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      await removeSavedDevice(await csrf(), id);
      await refresh();
    },
    [csrf, refresh]
  );

  const fresh = userId !== null && loadedFor === userId;

  const value = useMemo(
    () => ({
      signedIn: userId !== null,
      loading: userId !== null && !fresh,
      error: fresh ? loadError : null,
      devices: fresh ? devices : NO_DEVICES,
      outgoing: fresh ? outgoing : NO_CLAIMS,
      current: fresh ? current : null,
      refresh,
      saveThisDevice,
      askToSave,
      cancelRequest,
      rename,
      remove,
    }),
    [
      userId,
      fresh,
      loadError,
      devices,
      outgoing,
      current,
      refresh,
      saveThisDevice,
      askToSave,
      cancelRequest,
      rename,
      remove,
    ]
  );

  return (
    <AccountDevicesContext.Provider value={value}>
      {children}
    </AccountDevicesContext.Provider>
  );
}
