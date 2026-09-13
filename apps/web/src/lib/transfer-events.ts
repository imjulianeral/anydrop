import type { Transfer } from "#/lib/api.ts";

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
  const download =
    payload.download && typeof payload.download === "object"
      ? (payload.download as { url?: string })
      : undefined;
  return {
    id: payload.id,
    sender_id: payload.sender_id,
    recipient_id:
      typeof payload.recipient_id === "string" ? payload.recipient_id : null,
    kind: payload.kind,
    filename: typeof payload.filename === "string" ? payload.filename : null,
    byte_size: typeof payload.byte_size === "number" ? payload.byte_size : null,
    content_type:
      typeof payload.content_type === "string" ? payload.content_type : null,
    body: typeof payload.body === "string" ? payload.body : undefined,
    status: typeof payload.status === "string" ? payload.status : "delivered",
    expires_at:
      typeof payload.expires_at === "string"
        ? payload.expires_at
        : new Date().toISOString(),
    created_at:
      typeof payload.created_at === "string"
        ? payload.created_at
        : new Date().toISOString(),
    download:
      typeof download?.url === "string" ? { url: download.url } : undefined,
  };
};

export const involvesPeer = (
  transfer: Transfer,
  selfId: string,
  peerId: string
) =>
  (transfer.sender_id === selfId && transfer.recipient_id === peerId) ||
  (transfer.sender_id === peerId && transfer.recipient_id === selfId);

export const mergeTransfers = (
  history: Transfer[],
  received: Transfer[]
): Transfer[] => {
  const merged = new Map(history.map((transfer) => [transfer.id, transfer]));
  for (const transfer of received) {
    if (!merged.has(transfer.id)) {
      merged.set(transfer.id, transfer);
    }
  }
  return [...merged.values()].sort((left, right) =>
    left.created_at.localeCompare(right.created_at)
  );
};
