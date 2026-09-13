import { Link } from "@tanstack/react-router";
import { MessageSquare, Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import {
  DynamicIsland,
  DynamicIslandView,
} from "#/components/motion/dynamic-island.tsx";
import type { Transfer } from "#/lib/api.ts";
import { readTransfer } from "#/lib/transfer-events.ts";

interface MessageNotification {
  transfer: Transfer;
  senderName: string;
}

export function MessageNotifications() {
  const { self, peers, subscribeToEvents } = useAppSession();
  const [notifications, setNotifications] = useState<MessageNotification[]>([]);
  const [expanded, setExpanded] = useState(false);
  const seen = useRef(new Set<string>());
  const notification = notifications[0];

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
          transfer.sender_id === self.id ||
          seen.current.has(transfer.id)
        ) {
          return;
        }
        seen.current.add(transfer.id);
        setNotifications((current) => [
          ...current,
          {
            transfer,
            senderName:
              peers.find((peer) => peer.id === transfer.sender_id)
                ?.display_name ?? "Device",
          },
        ]);
        setExpanded(true);
      }),
    [peers, self.id, subscribeToEvents]
  );

  useEffect(() => {
    if (!notification) {
      return;
    }
    setExpanded(true);
  }, [notification]);

  const dismiss = (id: string) => {
    setNotifications((current) =>
      current.filter((item) => item.transfer.id !== id)
    );
  };

  if (!notification) {
    return null;
  }

  const { transfer, senderName } = notification;
  const preview =
    transfer.kind === "file"
      ? (transfer.filename ?? "File received")
      : (transfer.body ?? "New message");
  const Icon = transfer.kind === "file" ? Paperclip : MessageSquare;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex justify-center px-3">
      <DynamicIsland
        className="pointer-events-auto"
        view={expanded ? transfer.id : null}
        compact={
          <Link
            to="/"
            search={(previous) => ({
              ...previous,
              peer: transfer.sender_id,
              peerName: senderName,
              message: transfer.id,
            })}
            resetScroll={false}
            className="flex items-center gap-2 rounded-full outline-offset-4"
            aria-label={`Open message from ${senderName}: ${preview}`}
            onClick={() => dismiss(transfer.id)}
          >
            <MessageSquare className="size-4" />
            <span>{notifications.length} new</span>
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
              peer: transfer.sender_id,
              peerName: senderName,
              message: transfer.id,
            })}
            resetScroll={false}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-offset-4"
            aria-label={`Open message from ${senderName}: ${preview}`}
            onClick={() => dismiss(transfer.id)}
          >
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{senderName}</span>
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
            aria-label="Collapse message notifications"
            onClick={() => setExpanded(false)}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </DynamicIslandView>
      </DynamicIsland>
    </div>
  );
}
