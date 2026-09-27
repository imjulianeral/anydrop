import { Check, Download, LoaderCircle, Upload } from "lucide";
import { Square } from "lucide-react";
import { MorphIcon } from "morphicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type { FileTransfer } from "#/lib/file-transfers.ts";
import { formatBytes } from "#/lib/media.ts";
import { cn } from "#/lib/utils.ts";

const spring = { type: "spring" as const, stiffness: 260, damping: 30 };
const fade = { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const };

const directionLabels = { upload: "Upload", download: "Download" } as const;

const toneClass: Record<FileTransfer["status"], string> = {
  running: "bg-muted text-foreground",
  handoff: "bg-muted text-foreground",
  done: "bg-emerald-500 text-white",
  failed: "bg-destructive text-background",
  cancelled: "bg-muted text-foreground",
};

function transferIcon(transfer: FileTransfer, spinning: boolean) {
  if (transfer.status === "done") {
    return Check;
  }
  if (spinning) {
    return LoaderCircle;
  }
  return transfer.direction === "upload" ? Upload : Download;
}

function statusLabel(transfer: FileTransfer, directionLabel: string) {
  return {
    running: transfer.phase,
    handoff: transfer.phase,
    done: `${directionLabel}ed`,
    failed: `${directionLabel} failed`,
    cancelled: "Cancelled",
  }[transfer.status];
}

/** What a screen reader hears; the percentage only while it is moving. */
function announcement(
  transfer: FileTransfer,
  directionLabel: string,
  label: string,
  percent: number | null
) {
  const progress =
    percent === null || transfer.status !== "running" ? "" : `, ${percent}%`;
  return `${directionLabel}: ${transfer.name}, ${label}${progress}`;
}

/** "12 MB / 40 MB" once both amounts are known. */
function transferSize(transfer: FileTransfer) {
  const size = transfer.totalBytes;
  if (transfer.progress === null || size === null) {
    return null;
  }
  const transferred = formatBytes(transfer.progress * size);
  return transferred ? `${transferred} / ${formatBytes(size)}` : null;
}

export function FileTransferProgressButton({
  transfer,
}: {
  transfer: FileTransfer;
}) {
  const reduce = useReducedMotion();
  const running = transfer.status === "running";
  const expanded = running && transfer.progress !== null;
  const percent =
    transfer.progress === null ? null : Math.round(transfer.progress * 100);
  const directionLabel = directionLabels[transfer.direction];
  const spinning = running && !reduce;
  const Icon = transferIcon(transfer, spinning);
  const label = statusLabel(transfer, directionLabel);

  return (
    <motion.div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An animated block container; <output> only allows phrasing content.
      role="status"
      aria-label={announcement(transfer, directionLabel, label, percent)}
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
        toneClass[transfer.status]
      )}
    >
      <motion.span
        aria-hidden="true"
        className="absolute top-3.5 left-4 z-10 flex size-5 items-center"
        transition={reduce ? { duration: 0 } : spring}
      >
        <MorphIcon
          icon={Icon}
          className={cn("size-5 shrink-0", spinning && "animate-spin")}
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
          <TransferDetails
            transfer={transfer}
            percent={percent}
            directionLabel={directionLabel}
            reduce={Boolean(reduce)}
          />
        ) : null}
      </div>
    </motion.div>
  );
}

function TransferDetails({
  transfer,
  percent,
  directionLabel,
  reduce,
}: {
  transfer: FileTransfer;
  percent: number | null;
  directionLabel: string;
  reduce: boolean;
}) {
  const sizeLabel = transferSize(transfer);
  const speed = transfer.speedBytesPerSecond;
  return (
    <>
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A styled bar; <progress> cannot be styled like this.
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
            onClick={() => transfer.onCancel?.()}
          >
            <Square aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
      </div>{" "}
    </>
  );
}
