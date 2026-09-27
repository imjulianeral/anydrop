import { useCallback } from "react";
import type { Ref } from "react";

/**
 * Points a callback or object ref at `value`. Keeping the write here lets
 * React Compiler optimize components that forward refs they received as props.
 */
export function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

/** A stable callback ref that forwards the node to both refs. */
export function useComposedRef<T>(
  first: Ref<T> | undefined,
  second: Ref<T> | undefined
) {
  return useCallback(
    (node: T | null) => {
      assignRef(first, node);
      assignRef(second, node);
    },
    [first, second]
  );
}
