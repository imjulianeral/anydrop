import { useRef, useState } from "react";

import { ExpirationOptions } from "#/components/expiration-options.tsx";
import { AttachmentUpload } from "#/components/motion/attachment-upload.tsx";
import type {
  AttachmentUploadItem,
  AttachmentUploadKind,
} from "#/components/motion/attachment-upload.tsx";
import { Button } from "#/components/motion/button/base.tsx";
import { StatefulButton } from "#/components/motion/button/stateful.tsx";
import type { ButtonState } from "#/components/motion/button/stateful.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { attempt } from "#/lib/attempt.ts";
import { maxFileBytes } from "#/lib/config.ts";
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
  const [attachments, setAttachments] = useState<AttachmentUploadItem[]>(() =>
    files.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      name: file.name,
      kind: attachmentKind(file.type),
      size: file.size,
      file,
    }))
  );
  const [sent, setSent] = useState(false);
  const sendingClick = useRef(false);
  const selectedFiles = attachments.flatMap((item) =>
    item.file ? [item.file] : []
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !sending) {
          onClose();
        }
      }}
    >
      <DialogContent
        surface="background"
        className="max-h-[calc(100dvh-2rem)] min-w-0 grid-cols-[minmax(0,1fr)] overflow-x-hidden overflow-y-auto"
      >
        <DialogHeader className="min-w-0">
          <DialogTitle>
            Share {selectedFiles.length === 1 ? "a file" : "files"}
          </DialogTitle>
          <DialogDescription className="break-all">
            {selectedFiles.length > 0
              ? selectedFiles.map((file) => file.name).join(", ")
              : "Choose files to share with this device or group."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-w-full min-w-0" inert={sending}>
          <AttachmentUpload
            className="max-w-full min-w-0"
            value={attachments}
            onValueChange={setAttachments}
            maxFiles={Number.MAX_SAFE_INTEGER}
            maxFileSize={maxFileBytes}
            disabled={sending}
            title="Choose or drop files"
            description="Add files to share"
            attachmentsLabel="Selected files"
            classNames={{ dropzone: "min-h-36 rounded-2xl" }}
            onFilesRejected={(rejected, reason) => {
              toast.add({
                title:
                  reason === "too-large" ? "File too large" : "Too many files",
                description: rejected.map((file) => file.name).join(", "),
                type: "error",
              });
            }}
          />
        </div>
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
          <output aria-live="polite" className="text-muted-foreground text-sm">
            {phase} · {Math.round((progress ?? 0) * 100)}%
          </output>
        ) : null}
        <StatefulButton
          type="button"
          className="max-w-full min-w-0"
          state={sendState(sending, sent)}
          loadingText="Sending…"
          successText="Sent"
          disabled={selectedFiles.length === 0}
          onClick={async () => {
            if (sending || sendingClick.current) {
              return;
            }
            sendingClick.current = true;
            setSent(false);
            await attempt(
              async () => {
                const didSend = await onSend(selectedFiles, expiration);
                setSent(didSend);
              },
              {
                onError: (error) => {
                  setSent(false);
                  toast.add({
                    title: "Could not send files",
                    description:
                      error instanceof Error ? error.message : undefined,
                    type: "error",
                  });
                },
                onSettled: () => {
                  sendingClick.current = false;
                },
              }
            );
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

function attachmentKind(type: string): AttachmentUploadKind {
  if (type.startsWith("image/")) {
    return "image";
  }
  if (type.startsWith("audio/")) {
    return "audio";
  }
  return "file";
}

function sendState(sending: boolean, sent: boolean): ButtonState {
  if (sending) {
    return "loading";
  }
  return sent ? "success" : "idle";
}
