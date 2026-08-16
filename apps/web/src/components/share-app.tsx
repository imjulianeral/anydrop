import { Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PeerTile } from "#/components/peer-tile.tsx";
import { SelfCard } from "#/components/self-card.tsx";
import { SendSheet } from "#/components/send-sheet.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty.tsx";
import { toast } from "#/components/ui/toast.tsx";
import {
  completeTransfer,
  createFileTransfer,
  createSession,
  createTextTransfer,
  resolveAssetUrl,
  updateDevice,
} from "#/lib/api.ts";
import type { Peer } from "#/lib/api.ts";
import { connectRoom } from "#/lib/cable.ts";
import { loadLocalDevice, saveLocalDevice } from "#/lib/device.ts";
import { uploadFile } from "#/lib/upload.ts";

const mergePeers = (current: Peer[], incoming: Peer[]): Peer[] => {
  const next = new Map(current.map((peer) => [peer.id, peer]));
  for (const peer of incoming) {
    next.set(peer.id, peer);
  }
  return [...next.values()];
};

export function ShareApp() {
  const local = useMemo(() => loadLocalDevice(), []);
  const [token, setToken] = useState<string | null>(null);
  const [self, setSelf] = useState<Peer | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState<Peer | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const applySession = useCallback((device: Peer, nextPeers: Peer[]) => {
    setSelf(device);
    setPeers(nextPeers.filter((peer) => peer.id !== device.id));
    saveLocalDevice({
      id: device.id,
      displayName: device.display_name,
      deviceKind: device.device_kind,
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const roomFromUrl = params.get("room");
    let cancelled = false;

    const boot = async () => {
      try {
        const session = await createSession({
          id: local.id,
          displayName: local.displayName,
          deviceKind: local.deviceKind,
        });
        if (cancelled) {
          return;
        }
        setToken(session.token);
        applySession(session.device, session.peers);
        if (roomFromUrl && roomFromUrl !== session.device.room_code) {
          const updated = await updateDevice(session.token, {
            roomCode: roomFromUrl,
          });
          if (!cancelled) {
            applySession(updated.device, updated.peers);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setBootError(
            error instanceof Error
              ? error.message
              : "Could not join the network"
          );
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [applySession, local]);

  useEffect(() => {
    if (!token || !self) {
      return;
    }

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
        if (type === "text_received" && typeof payload.body === "string") {
          toast.add({
            title: "Message received",
            description: payload.body,
            type: "info",
          });
        }
        if (type === "transfer_offered" && typeof payload.id === "string") {
          const filename =
            typeof payload.filename === "string" ? payload.filename : "File";
          const download = payload.download as { url?: string } | undefined;
          if (download?.url) {
            toast.add({
              title: "File incoming",
              description: `${filename} — download started`,
              type: "success",
            });
            globalThis.open(
              resolveAssetUrl(download.url),
              "_blank",
              "noopener"
            );
          }
        }
      },
    });
  }, [self, token]);

  const rename = async (displayName: string) => {
    if (!token) {
      return;
    }
    const updated = await updateDevice(token, { displayName });
    applySession(updated.device, updated.peers);
  };

  const joinRoom = async (roomCode: string | null) => {
    if (!token) {
      return;
    }
    const updated = await updateDevice(token, { roomCode });
    applySession(updated.device, updated.peers);
  };

  const sendText = async (body: string) => {
    if (!token || !selected) {
      return;
    }
    setSending(true);
    try {
      await createTextTransfer(token, { recipientId: selected.id, body });
      toast.add({ title: "Message sent", type: "success" });
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
    if (!token || !selected) {
      return;
    }
    setSending(true);
    try {
      /* Sequential so the progress bar tracks one file at a time. */
      /* oxlint-disable eslint/no-await-in-loop */
      for (const file of files) {
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
        await completeTransfer(token, created.transfer.id);
      }
      /* oxlint-enable eslint/no-await-in-loop */
      toast.add({ title: "File sent", type: "success" });
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

  if (bootError) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Could not connect</EmptyTitle>
            <EmptyDescription>{bootError}</EmptyDescription>
          </EmptyHeader>
          <Button
            onClick={() => {
              globalThis.location.reload();
            }}
          >
            Retry
          </Button>
        </Empty>
      </div>
    );
  }

  if (!self) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Looking for the room</EmptyTitle>
            <EmptyDescription>
              Registering this device on the network.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="relative min-h-svh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,oklch(0.32_0_0),transparent_55%)]" />
      <main className="relative mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-10 px-6 py-10">
        <header className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-xs tracking-[0.28em] uppercase">
              AnyDrop
            </p>
            <h2 className="font-heading text-lg">Nearby devices</h2>
          </div>
        </header>

        <div className="flex flex-col items-start gap-10 lg:flex-row">
          <SelfCard
            key={`${self.display_name}-${self.room_code ?? ""}`}
            connected={connected}
            device={self}
            onJoinRoom={joinRoom}
            onRename={rename}
          />

          <section className="flex min-h-64 flex-1 flex-wrap content-start items-start gap-4">
            {peers.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Radio />
                  </EmptyMedia>
                  <EmptyTitle>No other devices yet</EmptyTitle>
                  <EmptyDescription>
                    Open this page on another device on the same network, or
                    join a room.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              peers.map((peer) => (
                <PeerTile key={peer.id} peer={peer} onSelect={setSelected} />
              ))
            )}
          </section>
        </div>
      </main>

      <SendSheet
        peer={selected}
        sending={sending}
        progress={progress}
        onClose={() => {
          setSelected(null);
        }}
        onSendText={sendText}
        onSendFiles={sendFiles}
      />
    </div>
  );
}
