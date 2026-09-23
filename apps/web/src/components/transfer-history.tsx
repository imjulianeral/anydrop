import { useEffect, useRef, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { ExpiryCountdown } from "#/components/expiry-countdown.tsx";
import { FilePreview } from "#/components/file-preview.tsx";
import { ActionSwapCascadeButton } from "#/components/motion/action-swap-cascade.tsx";
import type { ActionSwapItem } from "#/components/motion/action-swap-cascade.tsx";
import { Button } from "#/components/motion/button/index.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { NotificationStack } from "#/components/motion/notification-stack.tsx";
import {
  Check,
  Copy,
  Download,
  Eye,
  FileIcon,
  MessageSquare,
} from "#/components/rune-icons.tsx";
import { SecretContent } from "#/components/secret-content.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { ApiError, getTransfer } from "#/lib/api.ts";
import type { Peer, Transfer } from "#/lib/api.ts";
import { itemExpired } from "#/lib/expiry.ts";
import { toast } from "#/lib/toast.ts";
import { transferPreview } from "#/lib/transfer-preview.ts";

export function TransferHistory({
  transfers,
  loading,
  selfId,
  peerName,
  messageId,
  visible = false,
  participants,
  compact = false,
}: {
  transfers: Transfer[];
  loading: boolean;
  selfId: string;
  peerName: string;
  messageId?: string;
  visible?: boolean;
  participants?: Peer[];
  compact?: boolean;
}) {
  const { token } = useAppSession();
  const [open, setOpen] = useState(Boolean(messageId));
  const [liveById, setLiveById] = useState<Record<string, Transfer>>({});
  const [goneIds, setGoneIds] = useState<ReadonlySet<string>>(new Set());
  const stackRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const newest = transfers.map(
    (_, index) => transfers[transfers.length - 1 - index]
  );
  const fileKey = transfers
    .filter((transfer) => transfer.kind === "file")
    .map((transfer) => transfer.id)
    .join("\n");

  useEffect(() => {
    if (!visible || fileKey === "") {
      return;
    }
    let cancelled = false;
    for (const id of fileKey.split("\n")) {
      void getTransfer(token, id)
        .then((result) => {
          if (cancelled) {
            return;
          }
          setLiveById((current) => ({
            ...current,
            [id]: {
              ...current[id],
              ...result.transfer,
              download:
                result.transfer.download ??
                (result.download
                  ? { url: result.download.url }
                  : current[id]?.download),
            },
          }));
          setGoneIds((current) => {
            if (!current.has(id)) {
              return current;
            }
            const next = new Set(current);
            next.delete(id);
            return next;
          });
        })
        .catch((error: unknown) => {
          if (
            cancelled ||
            !(error instanceof ApiError) ||
            error.status !== 404
          ) {
            return;
          }
          setGoneIds((current) => new Set(current).add(id));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [fileKey, token, visible]);

  const shown = (transfer: Transfer): Transfer => {
    const live = liveById[transfer.id];
    const merged = live
      ? {
          ...transfer,
          ...live,
          secret: live.secret ?? transfer.secret,
          download_count: Math.max(
            transfer.download_count ?? 0,
            live.download_count ?? 0
          ),
        }
      : transfer;
    return goneIds.has(transfer.id) ? { ...merged, status: "expired" } : merged;
  };
  const expiryPending = (transfer: Transfer) =>
    transfer.kind === "file" &&
    liveById[transfer.id] === undefined &&
    !goneIds.has(transfer.id) &&
    itemExpired(transfer);

  useEffect(() => {
    if (visible && !loading) {
      stackRef.current?.scrollIntoView({ block: "nearest" });
      stackRef.current?.focus({ preventScroll: true });
    }
  }, [visible, loading]);

  const focusMessage = () => {
    if (!messageId) {
      return;
    }
    const target = document.querySelector<HTMLElement>(
      `#${CSS.escape(`transfer-${messageId}`)}`
    );
    if (target && listRef.current?.contains(target)) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "center" });
    }
  };

  return (
    <>
      {visible && compact ? (
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => setOpen(true)}
        >
          {loading
            ? "Loading shared items…"
            : `Shared items · ${transfers.length}`}
        </Button>
      ) : null}
      {visible && !compact ? (
        <section
          ref={stackRef}
          tabIndex={-1}
          aria-label={`Shared with ${peerName}`}
          className="outline-none"
        >
          {loading ? (
            <Loader label="Loading shared items" variant="dots" />
          ) : (
            <NotificationStack
              className="mx-auto max-w-sm"
              collapsedLabel={`Shared with ${peerName}`}
              expandedLabel="Open shared items"
              maxVisible={3}
              emptyLabel="Nothing shared yet"
              defaultExpanded
              onViewAll={() => setOpen(true)}
              classNames={{
                description: "line-clamp-2 break-all",
                content: "[&>span:first-child]:flex-wrap",
                title: "truncate",
                count: "bg-primary text-primary-foreground dark:bg-primary",
                stack: "max-h-[min(22rem,55dvh)] overflow-y-auto",
              }}
              items={newest.map((transfer) => {
                const Icon =
                  transfer.kind === "file" ? FileIcon : MessageSquare;
                const item = shown(transfer);
                return {
                  id: transfer.id,
                  title: (
                    <span className="flex items-center gap-2">
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">
                        {transferLabel(
                          transfer,
                          selfId,
                          peerName,
                          participants
                        )}
                      </span>
                    </span>
                  ),
                  description: transferPreview(transfer),
                  trailing: (
                    <span className="flex flex-col items-end gap-1">
                      <TransferUsage transfer={item} />
                      <TransferExpiry
                        transfer={item}
                        expired={itemExpired(item)}
                        hold={expiryPending(transfer)}
                      />
                    </span>
                  ),
                };
              })}
            />
          )}
        </section>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        onOpenChangeComplete={(isOpen) => {
          if (isOpen) {
            focusMessage();
          }
        }}
      >
        <DialogContent className="max-h-[85dvh] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Shared with {peerName}</DialogTitle>
            <DialogDescription>
              Save anything you need before its time runs out.
            </DialogDescription>
          </DialogHeader>
          <div
            ref={listRef}
            className="flex min-h-0 flex-col gap-5 overflow-y-auto p-1"
          >
            {loading ? (
              <Loader label="Loading shared items" variant="dots" />
            ) : null}
            {!loading && transfers.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Nothing shared yet. Send text or a file to get started.
              </p>
            ) : null}
            {newest.map((transfer) => {
              const item = shown(transfer);
              return (
                <article
                  key={transfer.id}
                  id={`transfer-${transfer.id}`}
                  tabIndex={-1}
                  className="border-border flex flex-col gap-3 border-b pb-5 last:border-0 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <p>
                      {transferLabel(transfer, selfId, peerName, participants)}
                    </p>
                    <TransferUsage transfer={item} />
                  </div>
                  <TransferContent
                    transfer={item}
                    selfId={selfId}
                    holdExpiry={expiryPending(transfer)}
                  />
                </article>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function transferLabel(
  transfer: Transfer,
  selfId: string,
  peerName: string,
  participants?: Peer[]
) {
  if (!participants) {
    return transfer.sender_id === selfId ? "You sent" : `From ${peerName}`;
  }
  const otherId =
    transfer.sender_id === selfId ? transfer.recipient_id : transfer.sender_id;
  const name =
    participants.find((member) => member.id === otherId)?.display_name ??
    "Former participant";
  return transfer.sender_id === selfId ? `You sent to ${name}` : `From ${name}`;
}

function TransferExpiry({
  transfer,
  expired,
  hold,
}: {
  transfer: Transfer;
  expired: boolean;
  hold: boolean;
}) {
  if (hold || transfer.expires_at === "") {
    return null;
  }
  return (
    <ExpiryCountdown
      createdAt={transfer.created_at}
      expiresAt={transfer.expires_at}
      expired={expired}
    />
  );
}

function TransferUsage({ transfer }: { transfer: Transfer }) {
  const count = transfer.download_count ?? 0;
  const isFile = transfer.kind === "file";
  const Icon = isFile ? Download : Eye;
  const noun = isFile ? "download" : "view";
  const limit = transfer.max_downloads;
  const label =
    limit == null
      ? `${count} ${noun}${count === 1 ? "" : "s"}, no limit`
      : `${count} of ${limit} ${noun}s`;

  return (
    <span
      className="text-muted-foreground inline-flex shrink-0 items-center gap-1 tabular-nums"
      title={label}
    >
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        <Icon className="size-3.5" />
        {count}/{limit ?? "∞"}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function TransferContent({
  transfer,
  selfId,
  holdExpiry = false,
}: {
  transfer: Transfer;
  selfId: string;
  holdExpiry?: boolean;
}) {
  const { token } = useAppSession();
  const [opened, setOpened] = useState<Transfer | null>(null);
  const [busy, setBusy] = useState(false);
  const opening = useRef(false);
  const item = opened ? { ...transfer, body: opened.body } : transfer;
  const expired = holdExpiry
    ? false
    : itemExpired({
        ...item,
        download_count: Math.max(
          item.download_count ?? 0,
          opened?.download_count ?? 0
        ),
      });
  if (
    item.kind === "text" &&
    item.max_downloads &&
    item.sender_id !== selfId &&
    item.body === undefined
  ) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (opening.current) {
              return;
            }
            opening.current = true;
            setBusy(true);
            try {
              const result = await getTransfer(token, item.id);
              setOpened(result.transfer);
            } catch (error) {
              toast.add({
                title: "Could not open message",
                description: error instanceof Error ? error.message : undefined,
                type: "error",
              });
            } finally {
              opening.current = false;
              setBusy(false);
            }
          }}
        >
          {busy ? "Opening…" : "Open message"}
        </Button>
        <p className="text-muted-foreground text-xs">
          Opening this message counts toward its limit.
        </p>
        <TransferExpiry transfer={item} expired={expired} hold={holdExpiry} />
      </div>
    );
  }
  return (
    <>
      {item.secret ? (
        <>
          <SecretContent key={item.id} item={item} viewerId={selfId} />
          <TransferExpiry transfer={item} expired={expired} hold={holdExpiry} />
        </>
      ) : null}
      {!item.secret && item.kind === "file" ? (
        <FilePreview
          filename={item.filename}
          contentType={item.content_type}
          byteSize={item.byte_size}
          downloadUrl={item.download?.url}
          status={item.status}
          showDownload={!expired}
        >
          <TransferExpiry transfer={item} expired={expired} hold={holdExpiry} />
        </FilePreview>
      ) : null}
      {!item.secret && item.kind === "text" ? (
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
              {item.body}
            </p>
            <TransferExpiry
              transfer={item}
              expired={expired}
              hold={holdExpiry}
            />
          </div>
          <CopySharedTextButton text={item.body ?? ""} />
        </div>
      ) : null}
    </>
  );
}

const COPY_ITEMS: ActionSwapItem[] = [
  {
    id: "copy",
    label: "Copy",
    icon: <Copy className="size-4" />,
    ariaLabel: "Copy",
  },
  {
    id: "copied",
    label: "Copied",
    icon: <Check className="size-4" />,
    ariaLabel: "Copied",
  },
];

function CopySharedTextButton({ text }: { text: string }) {
  const [value, setValue] = useState("copy");
  const timeoutRef = useRef(0);

  useEffect(
    () => () => {
      clearTimeout(timeoutRef.current);
    },
    []
  );

  return (
    <ActionSwapCascadeButton
      className="shrink-0"
      cycle={false}
      items={COPY_ITEMS}
      size="sm"
      value={value}
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setValue("copied");
          clearTimeout(timeoutRef.current);
          timeoutRef.current = window.setTimeout(() => {
            setValue("copy");
          }, 2000);
        } catch {
          toast.add({
            title: "Could not copy text",
            type: "error",
          });
        }
      }}
    />
  );
}
