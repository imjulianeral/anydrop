import {
  Message,
  MessageAvatar,
  MessageBubble,
  MessageBubbleContent,
  MessageContent,
  MessageScroller,
} from "#/components/agents/message.tsx";
import { FilePreview } from "#/components/file-preview.tsx";
import type { Transfer } from "#/lib/api.ts";
import { initials } from "#/lib/media.ts";

interface ChatThreadProps {
  selfId: string;
  selfName: string;
  peerName: string;
  transfers: Transfer[];
}

export function ChatThread({
  selfId,
  selfName,
  peerName,
  transfers,
}: ChatThreadProps) {
  return (
    <MessageScroller
      className="min-h-0 flex-1"
      contentClassName="flex flex-col gap-3 px-6 py-6"
      followOutput
      label="Chat"
    >
      {transfers.map((transfer) => {
        const mine = transfer.sender_id === selfId;
        const name = mine ? selfName : peerName;
        return (
          <Message
            key={transfer.id}
            animateIn
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
            </MessageContent>
          </Message>
        );
      })}
    </MessageScroller>
  );
}
