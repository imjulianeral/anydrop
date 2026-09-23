import { useCallback, useEffect, useRef, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { listGroups } from "#/lib/api.ts";
import type { DeviceGroup } from "#/lib/api.ts";

export function useGroups() {
  const { token, connected, subscribeToEvents } = useAppSession();
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);

  const refresh = useCallback(async () => {
    version.current += 1;
    const request = version.current;
    try {
      const result = await listGroups(token);
      if (request === version.current) {
        setGroups(result.groups);
        setError(null);
      }
    } catch (caughtError) {
      if (request === version.current) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load groups"
        );
      }
    } finally {
      if (request === version.current) {
        setLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeToEvents((event) => {
      if (event.type === "groups_updated") {
        void refresh();
      }
    });
    const timer = globalThis.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => {
      version.current += 1;
      globalThis.clearInterval(timer);
      unsubscribe();
    };
  }, [connected, refresh, subscribeToEvents]);

  return { groups, loading, error, refresh };
}
