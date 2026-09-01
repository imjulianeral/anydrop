import { Paperclip } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { toast } from "#/components/ui/toast.tsx";
import { maxFileBytes, maxTextBytes } from "#/lib/config.ts";
import { cn } from "#/lib/utils.ts";

const reportError = (error: unknown) => {
  toast.add({
    description: error instanceof Error ? error.message : undefined,
    title: "Could not send",
    type: "error",
  });
};

interface ChatComposerProps {
  sending: boolean;
  progress: number | null;
  disabled?: boolean;
  variant?: "inline" | "drop";
  onSendText: (body: string) => Promise<void>;
  onSendFiles: (files: File[]) => Promise<void>;
}

export function ChatComposer({
  sending,
  progress,
  disabled = false,
  variant = "inline",
  onSendText,
  onSendFiles,
}: ChatComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const handleFiles = (fileList: FileList | null) => {
    if (disabled || sending || !fileList || fileList.length === 0) {
      return;
    }
    const files = [...fileList].filter((file) => file.size <= maxFileBytes);
    if (files.length === 0) {
      return;
    }
    void onSendFiles(files);
  };

  const sendText = async () => {
    const body = text.trim();
    if (disabled || sending || body === "") {
      return;
    }
    await onSendText(body);
    setText("");
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        variant === "inline" ? "border-border/70 border-t px-6 py-4" : null
      )}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) {
          setIsDragging(true);
        }
      }}
      onDragLeave={() => {
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      {variant === "drop" ? (
        <button
          className={
            isDragging
              ? "border-foreground/40 bg-muted/60 rounded-3xl border border-dashed px-6 py-10 text-center"
              : "border-border rounded-3xl border border-dashed px-6 py-10 text-center"
          }
          disabled={disabled || sending}
          type="button"
          onClick={openFilePicker}
        >
          <p className="font-medium">Drop files here</p>
          <p className="text-muted-foreground text-sm">or click to browse</p>
        </button>
      ) : null}
      <div className="flex items-end gap-2">
        {variant === "inline" ? (
          <Button
            disabled={disabled || sending}
            size="icon"
            type="button"
            variant="ghost"
            onClick={openFilePicker}
          >
            <Paperclip />
            <span className="sr-only">Attach files</span>
          </Button>
        ) : null}
        <Textarea
          disabled={disabled || sending}
          maxLength={maxTextBytes}
          placeholder="Say something"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendText().catch(reportError);
            }
          }}
        />
        <Button
          disabled={disabled || sending || text.trim() === ""}
          onClick={() => {
            sendText().catch(reportError);
          }}
        >
          Send
        </Button>
      </div>
      {progress === null ? null : (
        <Progress value={Math.round(progress * 100)} />
      )}
      <input
        ref={inputRef}
        className="sr-only"
        disabled={disabled || sending}
        multiple
        type="file"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
