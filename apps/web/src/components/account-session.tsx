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

import { getAccountSession } from "#/lib/auth.ts";
import type { AccountSession } from "#/lib/auth.ts";

export type GuestTab = "signin" | "signup";

type MenuOpener = (tab?: GuestTab) => void;

/** How the dock's account menu hears from the rest of the app. */
export interface AccountMenuHandlers {
  open: MenuOpener;
  /** The page's first session, once, such as a Google result to show. */
  loaded: (session: AccountSession) => void;
}

interface AccountSessionValue {
  /** Null until the first load finishes. */
  session: AccountSession | null;
  /** The account service could not be reached; guest sharing still works. */
  unavailable: boolean;
  refresh: () => Promise<AccountSession>;
  /** Opens the dock's account menu, optionally on a guest tab. */
  openAccountMenu: MenuOpener;
  /** The account menu registers itself here; returns an unregister. */
  registerAccountMenu: (handlers: AccountMenuHandlers) => () => void;
}

const AccountSessionContext = createContext<AccountSessionValue | null>(null);

export function useAccountSession() {
  const value = useContext(AccountSessionContext);
  if (!value) {
    throw new Error(
      "useAccountSession must be used within AccountSessionProvider"
    );
  }
  return value;
}

export function AccountSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const menu = useRef<AccountMenuHandlers | null>(null);
  // The first session waits here if the menu hasn't mounted yet.
  const undelivered = useRef<AccountSession | null>(null);

  useEffect(() => {
    let active = true;
    getAccountSession()
      .then((current) => {
        if (!active) {
          return;
        }
        setSession(current);
        if (menu.current) {
          menu.current.loaded(current);
        } else {
          undelivered.current = current;
        }
      })
      .catch(() => {
        if (active) {
          setUnavailable(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const current = await getAccountSession();
    setSession(current);
    setUnavailable(false);
    return current;
  }, []);

  const openAccountMenu = useCallback((tab?: GuestTab) => {
    menu.current?.open(tab);
  }, []);

  const registerAccountMenu = useCallback((handlers: AccountMenuHandlers) => {
    menu.current = handlers;
    const pending = undelivered.current;
    if (pending) {
      undelivered.current = null;
      queueMicrotask(() => handlers.loaded(pending));
    }
    return () => {
      if (menu.current === handlers) {
        menu.current = null;
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      unavailable,
      refresh,
      openAccountMenu,
      registerAccountMenu,
    }),
    [session, unavailable, refresh, openAccountMenu, registerAccountMenu]
  );

  return (
    <AccountSessionContext.Provider value={value}>
      {children}
    </AccountSessionContext.Provider>
  );
}
