import { Paperclip } from "lucide-react";
import { useRef, useState } from "react";

import { PromptInput } from "#/components/agents/prompt-input.tsx";
import { Button } from "#/components/motion/button/index.tsx";
import { toast } from "#/components/toast-host.tsx";
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
  const [isDragging, setIsDragging] = useState(false);
  const [text, setText] = useState("");

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
          className={cn(
            "rounded-3xl border border-dashed px-6 py-10 text-center",
            isDragging ? "border-foreground/40 bg-muted/60" : "border-border"
          )}
          disabled={disabled || sending}
          type="button"
          onClick={openFilePicker}
        >
          <p className="font-medium">Drop files here</p>
          <p className="text-muted-foreground text-sm">or click to browse</p>
        </button>
      ) : null}
      <PromptInput
        disabled={disabled}
        value={text}
        onValueChange={setText}
        leadingAction={
          variant === "inline" ? (
            <Button
              aria-label="Attach files"
              disabled={disabled || sending}
              size="icon"
              type="button"
              variant="ghost"
              onClick={openFilePicker}
            >
              <Paperclip />
            </Button>
          ) : undefined
        }
        loading={sending}
        maxLength={maxTextBytes}
        maxRows={6}
        minRows={1}
        placeholder={variant === "drop" ? "Leave a message" : "Say something"}
        onSubmit={(body) => {
          onSendText(body)
            .then(() => {
              setText("");
            })
            .catch(reportError);
        }}
      />
      {progress === null ? null : (
        <div className="bg-muted h-1 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full origin-left transition-transform"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
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
