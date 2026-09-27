export type FileTransferDirection = "upload" | "download";

export interface FileTransfer {
  id: number;
  direction: FileTransferDirection;
  name: string;
  phase: string;
  progress: number | null;
  totalBytes: number | null;
  speedBytesPerSecond: number | null;
  status: "running" | "done" | "failed" | "cancelled" | "handoff";
  onCancel?: () => void;
  updatedAt: number;
}

export interface FileTransferHandle {
  update: (phase: string, progress: number | null, totalBytes?: number) => void;
  done: () => void;
  fail: () => void;
  cancel: () => void;
}

const DONE_HOLD_MS = 2500;
const FAILED_HOLD_MS = 4000;
const HANDOFF_HOLD_MS = 1800;

let nextId = 0;
let transfers: FileTransfer[] = [];
const listeners = new Set<() => void>();

const publish = (next: FileTransfer[]) => {
  transfers = next;
  for (const listener of listeners) {
    listener();
  }
};

const change = (id: number, update: (item: FileTransfer) => FileTransfer) => {
  publish(transfers.map((item) => (item.id === id ? update(item) : item)));
};

const remove = (id: number, delay: number) => {
  globalThis.setTimeout(() => {
    publish(transfers.filter((item) => item.id !== id));
  }, delay);
};

export const subscribeFileTransfers = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getFileTransfers = () => transfers;

export const beginFileTransfer = ({
  direction,
  name,
  totalBytes,
  onCancel,
  phase,
}: {
  direction: FileTransferDirection;
  name: string;
  totalBytes?: number;
  onCancel?: () => void;
  phase?: string;
}): FileTransferHandle => {
  nextId += 1;
  const id = nextId;
  publish([
    ...transfers,
    {
      id,
      direction,
      name,
      phase:
        phase ??
        (direction === "upload" ? "Preparing upload" : "Starting download"),
      progress: null,
      totalBytes: totalBytes ?? null,
      speedBytesPerSecond: null,
      status: "running",
      onCancel,
      updatedAt: Date.now(),
    },
  ]);

  return {
    update: (nextPhase, ratio, bytes) => {
      change(id, (item) => {
        if (item.status !== "running") {
          return item;
        }
        const now = Date.now();
        const progress =
          ratio === null ? null : Math.max(0, Math.min(1, ratio));
        const size = bytes ?? item.totalBytes;
        const elapsed = (now - item.updatedAt) / 1000;
        const delta =
          progress !== null &&
          item.progress !== null &&
          nextPhase === item.phase &&
          size !== null &&
          elapsed > 0
            ? (Math.max(0, progress - item.progress) * size) / elapsed
            : null;
        return {
          ...item,
          phase: nextPhase,
          progress,
          totalBytes: size,
          speedBytesPerSecond: delta,
          updatedAt: now,
        };
      });
    },
    done: () => {
      change(id, (item) => ({
        ...item,
        status: "done",
        progress: 1,
        speedBytesPerSecond: null,
      }));
      remove(id, DONE_HOLD_MS);
    },
    fail: () => {
      change(id, (item) => ({
        ...item,
        status: "failed",
        speedBytesPerSecond: null,
      }));
      remove(id, FAILED_HOLD_MS);
    },
    cancel: () => {
      change(id, (item) => ({
        ...item,
        status: "cancelled",
        speedBytesPerSecond: null,
      }));
      remove(id, HANDOFF_HOLD_MS);
    },
  };
};

export const noteBrowserDownload = (name: string) => {
  nextId += 1;
  const id = nextId;
  publish([
    ...transfers,
    {
      id,
      direction: "download",
      name,
      phase: "Opening download",
      progress: null,
      totalBytes: null,
      speedBytesPerSecond: null,
      status: "handoff",
      updatedAt: Date.now(),
    },
  ]);
  remove(id, HANDOFF_HOLD_MS);
};
