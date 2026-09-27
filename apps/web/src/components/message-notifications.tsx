import { Link } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { InvitationNotice } from "#/components/invitation-notice.tsx";
import {
  DynamicIsland,
  DynamicIslandView,
} from "#/components/motion/dynamic-island.tsx";
import {
  Check,
  MessageSquare,
  Paperclip,
  X,
} from "#/components/rune-icons.tsx";
import type { Transfer } from "#/lib/api.ts";
import { ISLAND_NOTICE_EVENT, ISLAND_SENT_EVENT } from "#/lib/island.ts";
import type { IslandNotice, IslandSentNotice } from "#/lib/island.ts";
import { readTransfer } from "#/lib/transfer-events.ts";
import { transferPreview } from "#/lib/transfer-preview.ts";

interface MessageNotification {
  transfer: Transfer;
  peerName: string;
  source: "incoming" | "sent";
}

const SENT_NOTICE_MS = 5000;

export function MessageNotifications() {
  const { self, peers, invitations, subscribeToEvents } = useAppSession();
  const [notice, setNotice] = useState<IslandNotice | null>(null);
  const [notifications, setNotifications] = useState<MessageNotification[]>([]);
  // The island opens for each new notification until the person collapses it.
  const [collapsedId, setCollapsedId] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  const [notification] = notifications;
  const invitation = invitations.find(
    (item) => item.status === "pending" && item.recipient.id === self.id
  );

  useEffect(() => {
    const onNotice = (event: Event) =>
      setNotice((event as CustomEvent<IslandNotice>).detail);
    globalThis.addEventListener(ISLAND_NOTICE_EVENT, onNotice);
    return () => globalThis.removeEventListener(ISLAND_NOTICE_EVENT, onNotice);
  }, []);

  useEffect(() => {
    if (!notice || notice.kind === "error") {
      return;
    }
    const timer = globalThis.setTimeout(() => setNotice(null), 7000);
    return () => globalThis.clearTimeout(timer);
  }, [notice]);

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
    if (
      !notification ||
      notification.source !== "sent" ||
      notice ||
      invitation
    ) {
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
  }, [notification, notice, invitation]);

  const dismiss = (id: string) => {
    setNotifications((current) =>
      current.filter((item) => item.transfer.id !== id)
    );
  };

  if (notice || invitation) {
    return (
      <InvitationNotice
        invitation={invitation}
        notice={notice}
        onDismiss={() => setNotice(null)}
      />
    );
  }

  if (!notification) {
    return null;
  }

  const { transfer, peerName, source } = notification;
  const preview = transferPreview(transfer);
  const sent = source === "sent";
  const expanded = collapsedId !== transfer.id;
  const peerId = sent
    ? (transfer.recipient_id ?? undefined)
    : transfer.sender_id;
  const title = sent ? `Sent to ${peerName}` : peerName;
  const openLabel = sent
    ? `Sent to ${peerName}: ${preview}`
    : `Open message from ${peerName}: ${preview}`;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[10000] flex justify-center px-3">
      <DynamicIsland
        className="pointer-events-auto"
        view={expanded ? transfer.id : null}
        compact={
          <Link
            to="/"
            search={(previous) => ({
              ...previous,
              peer: peerId,
              peerName,
              message: transfer.id,
            })}
            resetScroll={false}
            className="flex items-center gap-2 rounded-full outline-offset-4"
            aria-label={openLabel}
            onClick={() => dismiss(transfer.id)}
          >
            {sent ? (
              <Check className="size-4" />
            ) : (
              <MessageSquare className="size-4" />
            )}
            <span>{sent ? "Sent" : `${notifications.length} new`}</span>
          </Link>
        }
      >
        <DynamicIslandView
          id={transfer.id}
          className="w-[min(24rem,calc(100vw-1.5rem))] gap-3 px-4 py-3"
        >
          <Link
            to="/"
            search={(previous) => ({
              ...previous,
              peer: peerId,
              peerName,
              message: transfer.id,
            })}
            resetScroll={false}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-offset-4"
            aria-label={openLabel}
            onClick={() => dismiss(transfer.id)}
          >
            <NoticeIcon
              sent={sent}
              kind={transfer.kind}
              className="size-5 shrink-0"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{title}</span>
              <span className="line-clamp-2 text-xs opacity-80">{preview}</span>
              {notifications.length > 1 && (
                <span className="text-xs opacity-60">
                  {notifications.length - 1} more notifications
                </span>
              )}
            </span>
          </Link>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-full outline-offset-2"
            aria-label={
              sent
                ? "Collapse sent notification"
                : "Collapse message notifications"
            }
            onClick={() => setCollapsedId(transfer.id)}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </DynamicIslandView>
      </DynamicIsland>
    </div>
  );
}

function NoticeIcon({
  sent,
  kind,
  className,
}: {
  sent: boolean;
  kind: Transfer["kind"];
  className: string;
}) {
  if (sent) {
    return <Check aria-hidden="true" className={className} />;
  }
  if (kind === "file") {
    return <Paperclip aria-hidden="true" className={className} />;
  }
  return <MessageSquare aria-hidden="true" className={className} />;
}
