import { MessageSquare, Radio } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { ChatComposer } from "#/components/chat-composer.tsx";
import { ChatThread } from "#/components/chat-thread.tsx";
import { EmptyState } from "#/components/empty-state.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { PeerTile } from "#/components/peer-tile.tsx";
import { SelfCard } from "#/components/self-card.tsx";
import { toast } from "#/lib/toast.ts";
import {
  completeTransfer,
  createFileTransfer,
  createTextTransfer,
  listTransfers,
  type Peer,
  type Transfer,
} from "#/lib/api.ts";
import { connectRoom } from "#/lib/cable.ts";
import { maxFileBytes } from "#/lib/config.ts";
import { uploadFile } from "#/lib/upload.ts";

const mergePeers = (current: Peer[], incoming: Peer[]): Peer[] => {
  const next = new Map(current.map((peer) => [peer.id, peer]));
  for (const peer of incoming) {
    next.set(peer.id, peer);
  }
  return [...next.values()];
};

const readTransfer = (payload: Record<string, unknown>): Transfer | null => {
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

const involvesPeer = (transfer: Transfer, selfId: string, peerId: string) =>
  (transfer.sender_id === selfId && transfer.recipient_id === peerId) ||
  (transfer.sender_id === peerId && transfer.recipient_id === selfId);

export function ShareApp() {
  const { token, self, peers, setPeers, rename, joinRoom } = useAppSession();
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState<Peer | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    return connectRoom(token, {
      onConnect: () => {
        setConnected(true);
      },
      onDisconnect: () => {
        setConnected(false);
      },
      onEvent: (payload) => {
        const { type } = payload;
        if (type === "peer_joined" || type === "peer_updated") {
          const peer = payload as unknown as Peer;
          if (!peer.id || peer.id === self.id) {
            return;
          }
          setPeers((current) => mergePeers(current, [peer]));
        }
        if (type === "peer_left" && typeof payload.id === "string") {
          setPeers((current) =>
            current.filter((peer) => peer.id !== payload.id)
          );
        }
        if (type === "text_received" || type === "transfer_offered") {
          const incoming = readTransfer(payload);
          const peer = selectedRef.current;
          if (!incoming || !peer) {
            return;
          }
          if (!involvesPeer(incoming, self.id, peer.id)) {
            return;
          }
          setTransfers((current) =>
            current.some((item) => item.id === incoming.id)
              ? current
              : [...current, incoming]
          );
        }
      },
    });
  }, [self, setPeers, token]);

  const selectedId = selected?.id ?? null;

  useEffect(() => {
    if (!selectedId) {
      setTransfers([]);
      setLoadingThread(false);
      return;
    }
    let cancelled = false;
    setLoadingThread(true);
    const load = async () => {
      try {
        const payload = await listTransfers(token, selectedId);
        if (!cancelled) {
          setTransfers(payload.transfers);
        }
      } catch (error) {
        if (!cancelled) {
          setTransfers([]);
          toast.add({
            title: "Could not load messages",
            description: error instanceof Error ? error.message : undefined,
            type: "error",
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingThread(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedId, token]);

  const appendTransfer = (next: Transfer) => {
    setTransfers((current) =>
      current.some((item) => item.id === next.id) ? current : [...current, next]
    );
  };

  const sendText = async (body: string) => {
    if (!selected) {
      return;
    }
    setSending(true);
    try {
      const created = await createTextTransfer(token, {
        recipientId: selected.id,
        body,
      });
      appendTransfer(created.transfer);
    } catch (error) {
      toast.add({
        title: "Could not send",
        description: error instanceof Error ? error.message : undefined,
        type: "error",
      });
    } finally {
      setSending(false);
    }
  };

  const sendFiles = async (files: File[]) => {
    if (!selected) {
      return;
    }
    const allowed = files.filter((file) => file.size <= maxFileBytes);
    if (allowed.length === 0) {
      return;
    }
    setSending(true);
    try {
      /* Sequential so the progress bar tracks one file at a time. */
      /* oxlint-disable eslint/no-await-in-loop */
      for (const file of allowed) {
        setProgress(0);
        const created = await createFileTransfer(token, {
          recipientId: selected.id,
          filename: file.name,
          byteSize: file.size,
          contentType: file.type || "application/octet-stream",
        });
        await uploadFile(
          created.upload.url,
          file,
          created.upload.headers,
          setProgress
        );
        const completed = await completeTransfer(token, created.transfer.id);
        appendTransfer(completed.transfer);
      }
      /* oxlint-enable eslint/no-await-in-loop */
    } catch (error) {
      toast.add({
        title: "Upload failed",
        description: error instanceof Error ? error.message : undefined,
        type: "error",
      });
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="border-border/70 flex w-80 shrink-0 flex-col border-r">
        <SelfCard
          key={`${self.display_name}-${self.room_code ?? ""}`}
          connected={connected}
          device={self}
          token={token}
          onJoinRoom={joinRoom}
          onRename={rename}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          {peers.length === 0 ? (
            <EmptyState
              className="p-6"
              description="Open this page on another device on the same network, or join a room."
              icon={<Radio />}
              title="No other devices yet"
            />
          ) : (
            peers.map((peer) => (
              <PeerTile
                key={peer.id}
                peer={peer}
                selected={selected?.id === peer.id}
                onSelect={setSelected}
              />
            ))
          )}
        </div>
      </aside>

      <section
        className="flex min-w-0 flex-1 flex-col"
        onDragOver={(event) => {
          if (!selected) {
            return;
          }
          event.preventDefault();
        }}
        onDrop={(event) => {
          if (!selected || sending) {
            return;
          }
          event.preventDefault();
          const files = [...event.dataTransfer.files];
          if (files.length > 0) {
            void sendFiles(files);
          }
        }}
      >
        {selected ? (
          <>
            <header className="border-border/70 flex items-center border-b px-6 py-4">
              <h2 className="font-heading text-lg">{selected.display_name}</h2>
            </header>
            {loadingThread ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader label="Loading messages" variant="dots" />
              </div>
            ) : transfers.length === 0 ? (
              <EmptyState
                className="flex-1"
                description="Send a file or a message. History lasts 24 hours."
                icon={<MessageSquare />}
                title="No messages yet"
              />
            ) : (
              <ChatThread
                peerName={selected.display_name}
                selfId={self.id}
                selfName={self.display_name}
                transfers={transfers}
              />
            )}
            <ChatComposer
              progress={progress}
              sending={sending}
              onSendFiles={sendFiles}
              onSendText={sendText}
            />
          </>
        ) : (
          <EmptyState
            className="flex-1"
            description="Nearby devices show up on the left. Chats stay here for 24 hours."
            icon={<MessageSquare />}
            title="Select a device to start sharing"
          />
        )}
      </section>
    </div>
  );
}
