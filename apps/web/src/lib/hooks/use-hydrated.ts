import { useSyncExternalStore } from "react";

const unsubscribe = () => {
  // The value never changes after hydration, so there is nothing to clean up.
};
const subscribe = () => unsubscribe;

/**
 * False while rendering on a server or hydrating, true afterwards. Replaces a
 * `mounted` flag set in an effect, which costs an extra render.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
