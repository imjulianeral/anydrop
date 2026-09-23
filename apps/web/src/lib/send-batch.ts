export interface SendTask {
  id: string;
  label: string;
  send: () => Promise<void>;
}

export async function sendBatch(
  tasks: SendTask[],
  completed: Set<string>,
  signal?: AbortSignal
) {
  const failures: string[] = [];
  for (const task of tasks) {
    if (signal?.aborted) {
      break;
    }
    if (completed.has(task.id)) {
      continue;
    }
    try {
      // Encrypt one copy at a time to bound memory and temporary disk use.
      // oxlint-disable-next-line eslint/no-await-in-loop
      await task.send();
      completed.add(task.id);
    } catch (error) {
      failures.push(
        `${task.label}: ${error instanceof Error ? error.message : "Could not send"}`
      );
    }
  }
  if (completed.size !== tasks.length) {
    const detail = signal?.aborted ? "Cancelled." : failures.join("; ");
    throw new Error(
      `${completed.size} of ${tasks.length} deliveries completed. ${detail} Retry to send only the remaining copies.`
    );
  }
}
