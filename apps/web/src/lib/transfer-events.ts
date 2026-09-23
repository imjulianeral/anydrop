import type { Transfer } from "#/lib/api.ts";
import { parseInstant } from "#/lib/expiry.ts";
import { isSecret } from "#/lib/secret-format.ts";

export const readTransfer = (
  payload: Record<string, unknown>
): Transfer | null => {
  if (typeof payload.id !== "string") {
    return null;
  }
  if (payload.kind !== "file" && payload.kind !== "text") {
    return null;
  }
  if (typeof payload.sender_id !== "string") {
    return null;
  }
  if (
    payload.secret !== null &&
    payload.secret !== undefined &&
    !isSecret(payload.secret)
  ) {
    return null;
  }
  return {
    id: payload.id,
    group_id: readString(payload.group_id) ?? null,
    secret: isSecret(payload.secret) ? payload.secret : undefined,
    sender_id: payload.sender_id,
    recipient_id: readString(payload.recipient_id) ?? null,
    kind: payload.kind,
    filename: readString(payload.filename) ?? null,
    byte_size: typeof payload.byte_size === "number" ? payload.byte_size : null,
    content_type: readString(payload.content_type) ?? null,
    body: readString(payload.body),
    status: readString(payload.status) ?? "delivered",
    download_count: readDownloadCount(payload.download_count),
    max_downloads:
      typeof payload.max_downloads === "number" ? payload.max_downloads : null,
    expires_at: readInstant(payload.expires_at),
    created_at: readInstant(payload.created_at),
    download: readDownload(payload.download),
  };
};

const readDownloadCount = (value: unknown): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;

export const applyTransferUsage = (
  transfers: Transfer[],
  payload: Record<string, unknown>
): Transfer[] => {
  if (payload.type !== "transfer_usage" || typeof payload.id !== "string") {
    return transfers;
  }
  const count = readDownloadCount(payload.download_count);
  return transfers.map((transfer) =>
    transfer.id === payload.id && count > (transfer.download_count ?? 0)
      ? { ...transfer, download_count: count }
      : transfer
  );
};

export const belongsToHistory = (
  transfer: Transfer,
  selfId: string,
  peerId: string | null,
  groupId?: string
): boolean => {
  if (groupId) {
    return (
      transfer.group_id === groupId &&
      (transfer.sender_id === selfId || transfer.recipient_id === selfId)
    );
  }
  if (!peerId || transfer.group_id != null) {
    return false;
  }
  return (
    (transfer.sender_id === selfId && transfer.recipient_id === peerId) ||
    (transfer.sender_id === peerId && transfer.recipient_id === selfId)
  );
};

export const mergeTransfers = (
  history: Transfer[],
  received: Transfer[]
): Transfer[] => {
  const merged = new Map(history.map((transfer) => [transfer.id, transfer]));
  for (const transfer of received) {
    const previous = merged.get(transfer.id);
    if (!previous) {
      merged.set(transfer.id, transfer);
      continue;
    }
    const latest =
      transferStage(transfer) >= transferStage(previous) ? transfer : previous;
    merged.set(transfer.id, {
      ...latest,
      download: latest.download ?? previous.download ?? transfer.download,
      download_count: Math.max(
        transfer.download_count ?? 0,
        previous.download_count ?? 0
      ),
      max_downloads: transfer.max_downloads ?? previous.max_downloads,
      expires_at: laterInstant(transfer.expires_at, previous.expires_at),
      created_at: earlierInstant(transfer.created_at, previous.created_at),
    });
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 does not include toSorted.
  return [...merged.values()].sort((left, right) =>
    left.created_at.localeCompare(right.created_at)
  );
};

const transferStage = (transfer: Transfer): number => {
  if (transfer.status === "pending") {
    return 0;
  }
  return transfer.status === "delivered" ? 2 : 1;
};

const readString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const readInstant = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (parseInstant(trimmed) === null) {
    return "";
  }
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed) || !trimmed.includes("T")
    ? trimmed
    : `${trimmed}Z`;
};

const laterInstant = (left: string, right: string): string => {
  const leftAt = parseInstant(left);
  const rightAt = parseInstant(right);
  if (leftAt === null) {
    return rightAt === null ? left : right;
  }
  if (rightAt === null || leftAt >= rightAt) {
    return left;
  }
  return right;
};

const earlierInstant = (left: string, right: string): string => {
  const leftAt = parseInstant(left);
  const rightAt = parseInstant(right);
  if (leftAt === null) {
    return rightAt === null ? left : right;
  }
  if (rightAt === null || leftAt <= rightAt) {
    return left;
  }
  return right;
};

const readDownload = (value: unknown): Transfer["download"] => {
  if (
    value &&
    typeof value === "object" &&
    "url" in value &&
    typeof value.url === "string"
  ) {
    return { url: value.url };
  }
};
