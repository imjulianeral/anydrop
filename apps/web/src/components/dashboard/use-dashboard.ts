import { useCallback, useEffect, useRef, useState } from "react";

import { useAccountSession } from "#/components/account-session.tsx";
import { useAppSession } from "#/components/app-session.tsx";
import { attempt } from "#/lib/attempt.ts";
import { applyLiveEvent, getDashboard } from "#/lib/dashboard.ts";
import type { Dashboard, DashboardRange } from "#/lib/dashboard.ts";
import { readShortLinkEvent } from "#/lib/link-events.ts";

// Live events only reach the device that owns a link, so account and team
// views refresh now and then to pick up the other devices.
const REFRESH_MS = 60_000;

export function useDashboard(days: DashboardRange, scope: "me" | "team") {
  const { token, subscribeToEvents } = useAppSession();
  const { session } = useAccountSession();
  const userId = session?.user?.id ?? null;
  const key = `${days}:${scope}:${userId ?? "guest"}`;
  const [data, setData] = useState<Dashboard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Which request the state above answers, so a range or account switch
  // shows as loading until its own numbers arrive.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const version = useRef(0);

  const load = useCallback(async () => {
    version.current += 1;
    const requested = version.current;
    await attempt(
      async () => {
        const next = await getDashboard(token, days, scope);
        if (requested !== version.current) {
          return;
        }
        setData(next);
        setLoadError(null);
        setLoadedKey(key);
      },
      {
        onError: (caught) => {
          if (requested === version.current) {
            setLoadError(
              caught instanceof Error
                ? caught.message
                : "Could not load the dashboard."
            );
            setLoadedKey(key);
          }
        },
      }
    );
  }, [token, days, scope, key]);

  useEffect(() => {
    void load();
    const timer = globalThis.setInterval(() => void load(), REFRESH_MS);
    return () => globalThis.clearInterval(timer);
  }, [load]);

  useEffect(
    () =>
      subscribeToEvents((payload) => {
        const event = readShortLinkEvent(payload);
        if (event) {
          setData((current) =>
            current ? (applyLiveEvent(current, event) ?? current) : current
          );
        }
      }),
    [subscribeToEvents]
  );

  return {
    data,
    error: loadError,
    loading: loadedKey !== key,
  };
}
