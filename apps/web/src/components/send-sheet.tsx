import { useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { toast } from "#/components/ui/toast.tsx";
import type { Peer } from "#/lib/api.ts";
import { maxFileBytes, maxTextBytes } from "#/lib/config.ts";

const reportError = (error: unknown) => {
  toast.add({
    description: error instanceof Error ? error.message : undefined,
    title: "Could not send",
    type: "error",
  });
};

interface SendSheetProps {
  peer: Peer | null;
  sending: boolean;
  progress: number | null;
  onClose: () => void;
  onSendText: (body: string) => Promise<void>;
  onSendFiles: (files: File[]) => Promise<void>;
}

export function SendSheet({
  peer,
  sending,
  progress,
  onClose,
  onSendText,
  onSendFiles,
}: SendSheetProps) {
  const [text, setText] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }
    const files = [...fileList].filter((file) => file.size <= maxFileBytes);
    if (files.length === 0) {
      return;
    }
    void onSendFiles(files);
  };

  return (
    <Sheet
      open={peer !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Send to {peer?.display_name}</SheetTitle>
          <SheetDescription>
            Drop files or write a short message. Transfers expire after 24
            hours.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-6">
          <button
            className={
              isDragging
                ? "border-foreground/40 bg-muted/60 rounded-3xl border border-dashed px-6 py-10 text-center"
                : "border-border rounded-3xl border border-dashed px-6 py-10 text-center"
            }
            onClick={() => {
              const input =
                document.querySelector<HTMLInputElement>("#file-input");
              input?.click();
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => {
              setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              handleFiles(event.dataTransfer.files);
            }}
            type="button"
          >
            <p className="font-medium">Drop files here</p>
            <p className="text-muted-foreground text-sm">or click to browse</p>
            <input
              id="file-input"
              className="sr-only"
              type="file"
              multiple
              onChange={(event) => {
                handleFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </button>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="message">Message</FieldLabel>
              <Textarea
                id="message"
                value={text}
                maxLength={maxTextBytes}
                placeholder="Say something"
                onChange={(event) => {
                  setText(event.target.value);
                }}
              />
            </Field>
          </FieldGroup>

          {progress === null ? null : (
            <Progress value={Math.round(progress * 100)} />
          )}
        </div>
        <SheetFooter>
          <Button
            disabled={sending || text.trim() === ""}
            onClick={() => {
              const body = text.trim();
              if (body === "") {
                return;
              }
              const send = async () => {
                await onSendText(body);
                setText("");
              };
              send().catch(reportError);
            }}
          >
            Send message
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
