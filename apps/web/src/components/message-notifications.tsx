import { Link } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { useIslandActivity } from "#/components/island-host.tsx";
import { DynamicIslandIcon } from "#/components/motion/dynamic-island.tsx";
import type { DynamicIslandIconTone } from "#/components/motion/dynamic-island.tsx";
import {
  Check,
  MessageSquare,
  Paperclip,
  X,
} from "#/components/rune-icons.tsx";
import type { Transfer } from "#/lib/api.ts";
import { ISLAND_PRIORITY, ISLAND_SENT_EVENT } from "#/lib/island.ts";
import type { IslandActivity, IslandSentNotice } from "#/lib/island.ts";
import { readTransfer } from "#/lib/transfer-events.ts";
import { transferPreview } from "#/lib/transfer-preview.ts";

interface MessageNotification {
  transfer: Transfer;
  peerName: string;
  source: "incoming" | "sent";
}

const SENT_NOTICE_MS = 5000;

/** Puts incoming and just-sent messages on the island. */
export function MessageNotifications() {
  const { self, peers, claims, subscribeToEvents } = useAppSession();
  const [notifications, setNotifications] = useState<MessageNotification[]>([]);
  // The island opens for each new notification until the person collapses it.
  const [collapsedId, setCollapsedId] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  const [notification] = notifications;
  const claim = claims.find(
    (item) => item.status === "pending" && item.target.id === self.id
  );

  const enqueue = useEffectEvent((item: MessageNotification) => {
    if (seen.current.has(item.transfer.id)) {
      return;
    }
    seen.current.add(item.transfer.id);
    setNotifications((current) => [...current, item]);
    setCollapsedId(null);
  });

  useEffect(
    () =>
      subscribeToEvents((payload) => {
        if (
          payload.type !== "text_received" &&
          payload.type !== "transfer_offered"
        ) {
          return;
        }
        const transfer = readTransfer(payload);
        if (
          !transfer ||
          transfer.recipient_id !== self.id ||
          transfer.sender_id === self.id
        ) {
          return;
        }
        enqueue({
          transfer,
          peerName:
            peers.find((peer) => peer.id === transfer.sender_id)
              ?.display_name ?? "Device",
          source: "incoming",
        });
      }),
    [peers, self.id, subscribeToEvents]
  );

  useEffect(() => {
    const onSent = (event: Event) => {
      const sentNotice = (event as CustomEvent<IslandSentNotice>).detail;
      enqueue({
        transfer: sentNotice.transfer,
        peerName: sentNotice.peerName,
        source: "sent",
      });
    };
    globalThis.addEventListener(ISLAND_SENT_EVENT, onSent);
    return () => {
      globalThis.removeEventListener(ISLAND_SENT_EVENT, onSent);
    };
  }, []);

  useEffect(() => {
    // A pending request covers the island; hold "Sent" until it can be seen.
    if (!notification || notification.source !== "sent" || claim) {
      return;
    }
    const { id } = notification.transfer;
    const timeout = window.setTimeout(() => {
      setNotifications((current) =>
        current.filter((item) => item.transfer.id !== id)
      );
    }, SENT_NOTICE_MS);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [notification, claim]);

  const dismiss = (id: string) => {
    setNotifications((current) =>
      current.filter((item) => item.transfer.id !== id)
    );
  };

  useIslandActivity(
    "messages",
    notification
      ? messageActivity({
          notification,
          count: notifications.length,
          expanded: collapsedId !== notification.transfer.id,
          onOpen: dismiss,
          onCollapse: setCollapsedId,
        })
      : null
  );

  return null;
}

function messageActivity({
  notification,
  count,
  expanded,
  onOpen,
  onCollapse,
}: {
  notification: MessageNotification;
  count: number;
  expanded: boolean;
  onOpen: (id: string) => void;
  onCollapse: (id: string) => void;
}): IslandActivity {
  const { transfer, peerName, source } = notification;
  const preview = transferPreview(transfer);
  const sent = source === "sent";
  const peerId = sent
    ? (transfer.recipient_id ?? undefined)
    : transfer.sender_id;
  const title = sent ? `Sent to ${peerName}` : peerName;
  const tone = noticeTone(sent, transfer.kind);
  const openLabel = sent
    ? `Sent to ${peerName}: ${preview}`
    : `Open message from ${peerName}: ${preview}`;

  return {
    id: transfer.id,
    // Collapsed, it steps back behind transfer progress.
    priority: expanded
      ? ISLAND_PRIORITY.message
      : ISLAND_PRIORITY.messageCompact,
    viewClassName: "w-[min(24rem,calc(100vw-1.5rem))] items-start gap-2",
    compact: (
      <Link
        to="/"
        search={(previous) => ({
          ...previous,
          peer: peerId,
          peerName,
          message: transfer.id,
        })}
        resetScroll={false}
        className="flex flex-1 items-center justify-between gap-3 rounded-full pr-2 outline-offset-4"
        aria-label={openLabel}
        onClick={() => onOpen(transfer.id)}
      >
        <DynamicIslandIcon tone={tone} size="sm">
          <NoticeIcon sent={sent} kind={transfer.kind} />
        </DynamicIslandIcon>
        <span className="tabular-nums">{sent ? "Sent" : `${count} new`}</span>
      </Link>
    ),
    view: expanded ? (
      <>
        <Link
          to="/"
          search={(previous) => ({
            ...previous,
            peer: peerId,
            peerName,
            message: transfer.id,
          })}
          resetScroll={false}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-3xl text-left outline-offset-2"
          aria-label={openLabel}
          onClick={() => onOpen(transfer.id)}
        >
          <DynamicIslandIcon tone={tone}>
            <NoticeIcon sent={sent} kind={transfer.kind} />
          </DynamicIslandIcon>
          <span className="flex min-h-10 min-w-0 flex-1 flex-col justify-center py-0.5">
            <span className="truncate text-sm leading-5 font-medium">
              {title}
            </span>
            <span className="text-muted-foreground line-clamp-2 text-xs leading-4">
              {preview}
            </span>
            {count > 1 && (
              <span className="text-2xs text-muted-foreground/70 mt-1">
                {count - 1} more notifications
              </span>
            )}
          </span>
        </Link>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground grid size-10 shrink-0 cursor-pointer place-items-center rounded-full outline-offset-2 transition-colors hover:bg-white/10"
          aria-label={
            sent
              ? "Collapse sent notification"
              : "Collapse message notifications"
          }
          onClick={() => onCollapse(transfer.id)}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </>
    ) : null,
  };
}

function noticeTone(
  sent: boolean,
  kind: Transfer["kind"]
): DynamicIslandIconTone {
  if (sent) {
    return "green";
  }
  return kind === "file" ? "violet" : "blue";
}

function NoticeIcon({ sent, kind }: { sent: boolean; kind: Transfer["kind"] }) {
  if (sent) {
    return <Check aria-hidden="true" />;
  }
  if (kind === "file") {
    return <Paperclip aria-hidden="true" />;
  }
  return <MessageSquare aria-hidden="true" />;
}
