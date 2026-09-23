import { useState } from "react";

import { PromptInput } from "#/components/agents/prompt-input.tsx";
import { ExpirationOptions } from "#/components/expiration-options.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { maxTextBytes } from "#/lib/config.ts";
import { defaultExpiration } from "#/lib/expiration-options.ts";
import type { ExpirationOptions as ExpirationSettings } from "#/lib/expiration-options.ts";
import { toast } from "#/lib/toast.ts";

export function TextComposer({
  open,
  onOpenChange,
  peerName,
  sending,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  peerName: string;
  sending: boolean;
  onSend: (body: string, expiration?: ExpirationSettings) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [expiration, setExpiration] = useState(defaultExpiration);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (sending) {
          return;
        }
        if (!nextOpen) {
          setExpiration(defaultExpiration);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send text to {peerName}</DialogTitle>
          <DialogDescription>
            A thought, a link, or something worth passing on.
          </DialogDescription>
        </DialogHeader>
        <ExpirationOptions
          value={expiration}
          onChange={setExpiration}
          disabled={sending}
          kind="text"
        />
        <PromptInput
          aria-label="Text to share"
          value={text}
          onValueChange={setText}
          placeholder="Write something…"
          loading={sending}
          disabled={sending}
          minRows={3}
          maxRows={8}
          maxLength={maxTextBytes}
          onSubmit={async (body) => {
            if (new TextEncoder().encode(body).length > maxTextBytes) {
              toast.add({
                title: "This text is too long",
                description: "Shorten your message and try again.",
                type: "error",
              });
              return;
            }
            try {
              const sent = await onSend(body, expiration);
              if (!sent) {
                return;
              }
              setExpiration(defaultExpiration);
              setText("");
            } catch (error) {
              toast.add({
                title: "Could not send",
                description: error instanceof Error ? error.message : undefined,
                type: "error",
              });
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
