import { useEffect, useEffectEvent, useId, useRef } from "react";

import { Button } from "#/components/motion/button/index.tsx";
import { MorphingModal } from "#/components/motion/morphing-modal.tsx";
import { Ban, FileIcon, MessageSquare } from "#/components/rune-icons.tsx";

export function SendOptions({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (kind: "text" | "file") => void;
}) {
  const titleId = useId();
  const contentRef = useRef<HTMLDialogElement>(null);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.activeElement;
    const content = contentRef.current;
    contentRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key === "Tab") {
        const buttons = [
          ...(contentRef.current?.querySelectorAll<HTMLButtonElement>(
            "button"
          ) ?? []),
        ];
        const index =
          document.activeElement instanceof HTMLButtonElement
            ? buttons.indexOf(document.activeElement)
            : -1;
        event.preventDefault();
        buttons[
          (index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length
        ]?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (
        previous instanceof HTMLElement &&
        (content?.contains(document.activeElement) ||
          document.activeElement === document.body)
      ) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return (
    <MorphingModal
      viewId={open ? "send" : null}
      onClose={onClose}
      placement="bottom"
    >
      <dialog
        open
        ref={contentRef}
        aria-modal="true"
        aria-labelledby={titleId}
        className="static m-0 flex w-full flex-col gap-4 border-0 bg-transparent p-0 text-inherit"
      >
        <h2 id={titleId} className="text-base font-semibold">
          Send
        </h2>
        <div className="flex gap-2">
          <SendOptionRow
            icon={MessageSquare}
            label="Message"
            onClick={() => {
              onClose();
              onChoose("text");
            }}
          />
          <SendOptionRow
            icon={FileIcon}
            label="File"
            onClick={() => {
              onClose();
              onChoose("file");
            }}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          className="bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive w-full"
          onClick={onClose}
        >
          <Ban className="size-4" />
          Cancel
        </Button>
      </dialog>
    </MorphingModal>
  );
}

function SendOptionRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof FileIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="bg-foreground/[0.04] text-foreground hover:bg-foreground/[0.08] hover:text-foreground h-auto flex-1 justify-center rounded-2xl px-4 py-3"
      pressScale={0.98}
      whileHover={{}}
      onClick={onClick}
    >
      <Icon className="size-4" />
      {label}
    </Button>
  );
}
