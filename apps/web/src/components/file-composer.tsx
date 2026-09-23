import { useRef, useState } from "react";

import { ExpirationOptions } from "#/components/expiration-options.tsx";
import { Button } from "#/components/motion/button/base.tsx";
import { StatefulButton } from "#/components/motion/button/stateful.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { defaultExpiration } from "#/lib/expiration-options.ts";
import type { ExpirationOptions as ExpirationSettings } from "#/lib/expiration-options.ts";
import { toast } from "#/lib/toast.ts";

export function FileComposer({
  files,
  sending,
  onClose,
  onSend,
  onCancel,
  progress,
  phase,
}: {
  files: File[];
  sending: boolean;
  onClose: () => void;
  onSend: (files: File[], expiration?: ExpirationSettings) => Promise<boolean>;
  onCancel: () => void;
  progress: number | null;
  phase: string;
}) {
  const [expiration, setExpiration] = useState(defaultExpiration);
  const [sent, setSent] = useState(false);
  const sendingClick = useRef(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !sending) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Share {files.length === 1 ? "a file" : `${files.length} files`}
          </DialogTitle>
          <DialogDescription className="break-all">
            {files.map((file) => file.name).join(", ")}
          </DialogDescription>
        </DialogHeader>
        <ExpirationOptions
          value={expiration}
          onChange={setExpiration}
          disabled={sending}
          kind="file"
        />
        <p className="text-muted-foreground text-sm">
          Files over 100 MiB need temporary disk space to send and a browser
          with file-save support to receive, such as desktop Chrome or Edge.
        </p>
        {sending ? (
          <output className="text-muted-foreground text-sm">
            {phase} · {Math.round((progress ?? 0) * 100)}%
          </output>
        ) : null}
        <StatefulButton
          type="button"
          state={sending ? "loading" : sent ? "success" : "idle"}
          loadingText="Sending…"
          successText="Sent"
          onClick={async () => {
            if (sending || sendingClick.current) {
              return;
            }
            sendingClick.current = true;
            setSent(false);
            try {
              const didSend = await onSend(files, expiration);
              setSent(didSend);
            } catch (error) {
              setSent(false);
              toast.add({
                title: "Could not send files",
                description: error instanceof Error ? error.message : undefined,
                type: "error",
              });
            } finally {
              sendingClick.current = false;
            }
          }}
        >
          Send files
        </StatefulButton>
        {sending ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
