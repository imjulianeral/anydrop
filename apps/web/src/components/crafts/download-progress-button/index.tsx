import { Check, Download, LoaderCircle, Upload } from "lucide";
import { Square } from "lucide-react";
import { MorphIcon } from "morphicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type { FileTransfer } from "#/lib/file-transfers.ts";
import { formatBytes } from "#/lib/media.ts";
import { cn } from "#/lib/utils.ts";

const spring = { type: "spring" as const, stiffness: 260, damping: 30 };
const fade = { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const };

export function FileTransferProgressButton({
  transfer,
}: {
  transfer: FileTransfer;
}) {
  const reduce = useReducedMotion();
  const running = transfer.status === "running";
  const expanded = running && transfer.progress !== null;
  const complete = transfer.status === "done";
  const failed = transfer.status === "failed";
  const percent =
    transfer.progress === null ? null : Math.round(transfer.progress * 100);
  const directionLabel =
    transfer.direction === "upload" ? "Upload" : "Download";
  const DirectionIcon = transfer.direction === "upload" ? Upload : Download;
  const Icon = complete
    ? Check
    : running && !reduce
      ? LoaderCircle
      : DirectionIcon;
  const label = {
    running: transfer.phase,
    handoff: transfer.phase,
    done: `${directionLabel}ed`,
    failed: `${directionLabel} failed`,
    cancelled: "Cancelled",
  }[transfer.status];
  const speed = transfer.speedBytesPerSecond;
  const size = transfer.totalBytes;
  const transferred =
    transfer.progress !== null && size !== null
      ? formatBytes(transfer.progress * size)
      : null;
  const sizeLabel =
    transferred && size !== null
      ? `${transferred} / ${formatBytes(size)}`
      : null;

  return (
    <motion.div
      role="status"
      aria-label={`${directionLabel}: ${transfer.name}, ${label}${percent === null || !running ? "" : `, ${percent}%`}`}
      aria-live={running ? "off" : "polite"}
      initial={false}
      animate={{
        width: expanded ? 300 : 170,
        height: expanded ? 84 : 48,
        borderRadius: expanded ? 16 : 24,
      }}
      transition={reduce ? { duration: 0 } : spring}
      className={cn(
        "relative flex max-w-full items-center overflow-hidden font-medium shadow-lg select-none",
        complete && "bg-emerald-500 text-white",
        failed && "bg-destructive text-background",
        !complete && !failed && "bg-muted text-foreground"
      )}
    >
      <motion.span
        aria-hidden="true"
        className="absolute top-3.5 left-4 z-10 flex size-5 items-center"
        transition={reduce ? { duration: 0 } : spring}
      >
        <MorphIcon
          icon={Icon}
          className={cn(
            "size-5 shrink-0",
            running && !reduce && "animate-spin"
          )}
          spring="smooth"
          reducedMotion={reduce ? "always" : "never"}
        />
      </motion.span>

      <div className="absolute inset-0 flex flex-col justify-center">
        <div className="flex h-5 items-center gap-2 pr-4 pl-12">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={label}
              className="min-w-0 flex-1 truncate text-sm leading-5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={reduce ? { duration: 0 } : fade}
            >
              {label}
            </motion.span>
          </AnimatePresence>
          {expanded ? (
            <span className="text-sm font-semibold tabular-nums">
              {percent}%
            </span>
          ) : null}
        </div>
        {expanded ? (
          <>
            <div
              role="progressbar"
              aria-label={`${directionLabel} progress for ${transfer.name}`}
              aria-valuenow={percent ?? undefined}
              aria-valuemin={0}
              aria-valuemax={100}
              className="bg-foreground/10 relative mx-4 mt-1.5 h-2 overflow-hidden rounded-full"
            >
              <motion.span
                className="bg-primary block h-full w-full origin-left rounded-full"
                initial={false}
                animate={{ scaleX: transfer.progress ?? 0 }}
                transition={reduce ? { duration: 0 } : { duration: 0.2 }}
              />
            </div>
            <div className="text-foreground/60 mx-4 mt-1.5 flex items-center justify-between gap-2 text-[11px] leading-4 tabular-nums">
              <span className="min-w-0 truncate" title={transfer.name}>
                {transfer.name}
              </span>
              {sizeLabel ? <span className="shrink-0">{sizeLabel}</span> : null}
              {speed && speed > 0 ? (
                <span className="shrink-0">{formatBytes(speed)}/s</span>
              ) : null}
              {transfer.onCancel ? (
                <button
                  type="button"
                  aria-label={`Cancel ${transfer.direction} of ${transfer.name}`}
                  title="Cancel"
                  className="hover:bg-foreground/15 hover:text-foreground flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors"
                  onClick={transfer.onCancel}
                >
                  <Square aria-hidden="true" className="size-3.5" />
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </motion.div>
  );
}
