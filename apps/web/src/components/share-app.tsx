import { Link } from "@tanstack/react-router";
import { ArrowLeft, MessageSquare, Radio } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { ChatComposer } from "#/components/chat-composer.tsx";
import { ChatThread } from "#/components/chat-thread.tsx";
import { EmptyState } from "#/components/empty-state.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { PeerTile } from "#/components/peer-tile.tsx";
import { SelfCard } from "#/components/self-card.tsx";
import {
  createFileTransfer,
  createTextTransfer,
  listTransfers,
  type Peer,
  type Transfer,
} from "#/lib/api.ts";
import { maxFileBytes } from "#/lib/config.ts";
import { toast } from "#/lib/toast.ts";
import {
  involvesPeer,
  mergeTransfers,
  readTransfer,
} from "#/lib/transfer-events.ts";
import { uploadFile } from "#/lib/upload.ts";
import { cn } from "#/lib/utils.ts";

interface ShareAppProps {
  peerId?: string;
  peerName?: string;
  messageId?: string;
  onSelectPeer: (peer: Peer) => void;
}

export function ShareApp({
  peerId,
  peerName,
  messageId,
  onSelectPeer,
}: ShareAppProps) {
  const { token, self, peers, connected, joinRoom, subscribeToEvents } =
    useAppSession();
  const selected = peerId
    ? (peers.find((peer) => peer.id === peerId) ?? {
        id: peerId,
        display_name: peerName ?? "Device",
      })
    : null;
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [loadedPeerId, setLoadedPeerId] = useState<string | null>(null);
  const selectedId = selected?.id ?? null;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  useEffect(() => {
    setTransfers([]);
    if (!selectedId) {
      setLoadingThread(false);
      setLoadedPeerId(null);
      return;
    }
    let cancelled = false;
    const unsubscribe = subscribeToEvents((payload) => {
      if (
        payload.type !== "text_received" &&
        payload.type !== "transfer_offered"
      ) {
        return;
      }
      const incoming = readTransfer(payload);
      if (!incoming || !involvesPeer(incoming, self.id, selectedId)) {
        return;
      }
      setTransfers((current) => mergeTransfers(current, [incoming]));
    });
    setLoadingThread(true);
    const load = async () => {
      try {
        const payload = await listTransfers(token, selectedId);
        if (!cancelled) {
          setTransfers((current) => mergeTransfers(payload.transfers, current));
        }
      } catch (error) {
        if (!cancelled) {
          toast.add({
            title: "Could not load messages",
            description: error instanceof Error ? error.message : undefined,
            type: "error",
          });
        }
      } finally {
        if (!cancelled) {
          setLoadedPeerId(selectedId);
          setLoadingThread(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [selectedId, self.id, subscribeToEvents, token]);

  const appendTransfer = (next: Transfer) => {
    if (
      !selectedRef.current ||
      !involvesPeer(next, self.id, selectedRef.current)
    ) {
      return;
    }
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
        const completed = await uploadFile(
          token,
          created.transfer.id,
          created.upload,
          file,
          setProgress
        );
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
      <aside
        className={cn(
          "border-border/70 w-full shrink-0 flex-col border-r md:flex md:w-80",
          selected ? "hidden" : "flex"
        )}
      >
        <SelfCard
          key={`${self.display_name}-${self.room_code ?? ""}`}
          connected={connected}
          device={self}
          token={token}
          onJoinRoom={joinRoom}
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
                onSelect={onSelectPeer}
              />
            ))
          )}
        </div>
      </aside>

      <section
        className={cn(
          "min-w-0 flex-1 flex-col md:flex",
          selected ? "flex" : "hidden"
        )}
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
            <header className="border-border/70 flex items-center gap-3 border-b px-6 py-4">
              <Link
                to="/"
                search={(previous) => ({
                  ...previous,
                  peer: undefined,
                  peerName: undefined,
                  message: undefined,
                })}
                aria-label="Back to devices"
                className="flex size-8 items-center justify-center rounded-full outline-offset-2 md:hidden"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
              </Link>
              <h2 className="font-heading text-lg">{selected.display_name}</h2>
            </header>
            {loadingThread || loadedPeerId !== selectedId ? (
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
                key={selected.id}
                focusedMessageId={messageId}
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
