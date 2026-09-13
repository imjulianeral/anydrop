import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

import {
  Message,
  MessageAvatar,
  MessageBubble,
  MessageBubbleContent,
  MessageContent,
  MessageScroller,
} from "#/components/agents/message.tsx";
import { ExpiryCountdown } from "#/components/expiry-countdown.tsx";
import { FilePreview } from "#/components/file-preview.tsx";
import type { Transfer } from "#/lib/api.ts";
import { initials } from "#/lib/media.ts";

interface ChatThreadProps {
  focusedMessageId?: string;
  selfId: string;
  selfName: string;
  peerName: string;
  transfers: Transfer[];
}

export function ChatThread({
  focusedMessageId,
  selfId,
  selfName,
  peerName,
  transfers,
}: ChatThreadProps) {
  const threadRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const hasTarget = transfers.some(
    (transfer) => transfer.id === focusedMessageId
  );

  useEffect(() => {
    if (!focusedMessageId || !hasTarget) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(`message-${focusedMessageId}`);
      if (!target || !threadRef.current?.contains(target)) {
        return;
      }
      target.focus({ preventScroll: true });
      target.scrollIntoView({
        block: "center",
        behavior: reduce ? "instant" : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedMessageId, hasTarget, reduce]);

  return (
    <MessageScroller
      ref={threadRef}
      className="min-h-0 flex-1"
      contentClassName="flex flex-col gap-3 px-6 py-6"
      followOutput={!hasTarget}
      label="Chat"
    >
      {transfers.map((transfer) => {
        const mine = transfer.sender_id === selfId;
        const name = mine ? selfName : peerName;
        return (
          <Message
            key={transfer.id}
            id={`message-${transfer.id}`}
            tabIndex={-1}
            aria-label={`Message from ${name}`}
            className="focus:bg-accent/50 focus:ring-ring focus:ring-offset-background scroll-my-6 rounded-xl focus:ring-2 focus:ring-offset-4 focus:outline-none"
            animateIn={transfer.id !== focusedMessageId}
            from={mine ? "user" : "assistant"}
          >
            <MessageAvatar>{initials(name)}</MessageAvatar>
            <MessageContent>
              <MessageBubble animateIn variant={mine ? "solid" : "soft"}>
                <MessageBubbleContent
                  className={
                    transfer.kind === "file"
                      ? "max-w-sm overflow-hidden p-2"
                      : undefined
                  }
                >
                  {transfer.kind === "text" ? (
                    <p className="whitespace-pre-wrap">{transfer.body ?? ""}</p>
                  ) : (
                    <FilePreview
                      byteSize={transfer.byte_size}
                      contentType={transfer.content_type}
                      downloadUrl={transfer.download?.url}
                      filename={transfer.filename}
                      status={transfer.status}
                    />
                  )}
                </MessageBubbleContent>
              </MessageBubble>
              <ExpiryCountdown
                createdAt={transfer.created_at}
                expiresAt={transfer.expires_at}
              />
            </MessageContent>
          </Message>
        );
      })}
    </MessageScroller>
  );
}
