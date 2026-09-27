interface AttemptHandlers<R> {
  /** Handles a failure. Without it, the error is rethrown after `onSettled`. */
  readonly onError?: (error: unknown) => R;
  /** Runs after the task, whether it succeeded or failed. */
  readonly onSettled?: () => void;
}

/**
 * `try`/`catch`/`finally` as a function. React Compiler cannot yet compile
 * components or hooks that use `finally`, `try` without `catch`, `throw`
 * inside `try`, or conditionals inside `try`, so their handlers run that
 * control flow here instead.
 */
export async function attempt<T, R = never>(
  task: () => Promise<T>,
  { onError, onSettled }: AttemptHandlers<R> = {}
): Promise<T | R> {
  try {
    return await task();
  } catch (error) {
    if (!onError) {
      throw error;
    }
    return onError(error);
  } finally {
    onSettled?.();
  }
}
