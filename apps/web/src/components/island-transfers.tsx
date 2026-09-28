import { motion, useReducedMotion } from "motion/react";

import { DynamicIslandIcon } from "#/components/motion/dynamic-island.tsx";
import type { DynamicIslandIconTone } from "#/components/motion/dynamic-island.tsx";
import {
  AlertCircle,
  ArrowUp,
  Ban,
  Check,
  Download,
  LoaderCircle,
  Square,
} from "#/components/rune-icons.tsx";
import type { RuneIcon } from "#/components/rune-icons.tsx";
import type { FileTransfer } from "#/lib/file-transfers.ts";
import { ISLAND_PRIORITY } from "#/lib/island.ts";
import type { IslandActivity } from "#/lib/island.ts";
import { formatBytes } from "#/lib/media.ts";
import { cn } from "#/lib/utils.ts";

/** Rows beyond this collapse into a "N more" line. */
const MAX_ROWS = 3;

const DIRECTION_LABEL = { upload: "Upload", download: "Download" } as const;

const BAR_TONE: Partial<Record<DynamicIslandIconTone, string>> = {
  blue: "bg-series-blue",
  violet: "bg-series-violet",
};

const RING_TONE: Partial<Record<DynamicIslandIconTone, string>> = {
  blue: "text-series-blue",
  violet: "text-series-violet",
};

interface TransferLook {
  tone: DynamicIslandIconTone;
  Icon: RuneIcon;
  spin: boolean;
}

function transferLook(transfer: FileTransfer): TransferLook {
  if (transfer.status === "done") {
    return { tone: "green", Icon: Check, spin: false };
  }
  if (transfer.status === "failed") {
    return { tone: "red", Icon: AlertCircle, spin: false };
  }
  if (transfer.status === "cancelled") {
    return { tone: "gray", Icon: Ban, spin: false };
  }
  const tone = transfer.direction === "upload" ? "violet" : "blue";
  if (transfer.status === "running" && transfer.progress === null) {
    return { tone, Icon: LoaderCircle, spin: true };
  }
  return {
    tone,
    Icon: transfer.direction === "upload" ? ArrowUp : Download,
    spin: false,
  };
}

/** Whole percent while a transfer is measurably moving, otherwise null. */
function runningPercent(transfer: FileTransfer) {
  if (transfer.status !== "running" || transfer.progress === null) {
    return null;
  }
  return Math.round(transfer.progress * 100);
}

/** "Uploading · 12 MB / 40 MB · 3 MB/s", or the outcome once it ends. */
function transferDetail(transfer: FileTransfer) {
  const direction = DIRECTION_LABEL[transfer.direction];
  if (transfer.status === "done") {
    return `${direction}ed`;
  }
  if (transfer.status === "failed") {
    return `${direction} failed`;
  }
  if (transfer.status === "cancelled") {
    return "Cancelled";
  }
  const parts = [transfer.phase];
  if (transfer.progress !== null && transfer.totalBytes !== null) {
    const sent = formatBytes(transfer.progress * transfer.totalBytes);
    if (sent) {
      parts.push(`${sent} / ${formatBytes(transfer.totalBytes)}`);
    }
  }
  const speed = transfer.speedBytesPerSecond;
  if (transfer.status === "running" && speed && speed > 0) {
    parts.push(`${formatBytes(speed)}/s`);
  }
  return parts.join(" · ");
}

/** The pill's short word for a transfer. */
function compactLabel(transfer: FileTransfer) {
  const percent = runningPercent(transfer);
  if (percent !== null) {
    return `${percent}%`;
  }
  return {
    running: DIRECTION_LABEL[transfer.direction],
    handoff: "Opening",
    done: "Done",
    failed: "Failed",
    cancelled: "Cancelled",
  }[transfer.status];
}

/**
 * The island activity for file transfers: a progress ring in the pill, and a
 * row per transfer when opened.
 */
export function transferIslandActivity({
  transfers,
  expanded,
  onToggle,
}: {
  transfers: readonly FileTransfer[];
  expanded: boolean;
  onToggle: (open: boolean) => void;
}): IslandActivity | null {
  if (transfers.length === 0) {
    return null;
  }
  // The pill follows the first transfer still moving, else the newest.
  const primary =
    transfers.find((item) => item.status === "running") ?? transfers.at(-1);
  if (!primary) {
    return null;
  }
  return {
    id: "file-transfers",
    priority: ISLAND_PRIORITY.transfer,
    viewClassName: "w-[min(24rem,calc(100vw-1.5rem))] flex-col items-stretch",
    view: expanded ? (
      <TransferList transfers={transfers} onCollapse={() => onToggle(false)} />
    ) : null,
    compact: (
      <TransferCompact
        transfer={primary}
        count={transfers.length}
        onExpand={() => onToggle(true)}
      />
    ),
  };
}

function TransferCompact({
  transfer,
  count,
  onExpand,
}: {
  transfer: FileTransfer;
  count: number;
  onExpand: () => void;
}) {
  const look = transferLook(transfer);
  const label = compactLabel(transfer);
  const others = count > 1 ? ` and ${count - 1} more` : "";

  return (
    <button
      type="button"
      aria-expanded={false}
      aria-label={`${DIRECTION_LABEL[transfer.direction]} ${transfer.name}${others}: ${label}. Show details`}
      className="flex flex-1 cursor-pointer items-center justify-between gap-3 rounded-full pr-2 outline-offset-4"
      onClick={onExpand}
    >
      {runningPercent(transfer) === null ? (
        <DynamicIslandIcon tone={look.tone} size="sm">
          <look.Icon className={cn(look.spin && "animate-spin")} />
        </DynamicIslandIcon>
      ) : (
        <ProgressRing transfer={transfer} tone={look.tone} Icon={look.Icon} />
      )}
      <span
        aria-hidden="true"
        className="flex items-center gap-1.5 tabular-nums"
      >
        {label}
        {count > 1 ? (
          <span className="text-muted-foreground">+{count - 1}</span>
        ) : null}
      </span>
    </button>
  );
}

/** 25px ring, concentric with the pill's end like the compact icon badge. */
function ProgressRing({
  transfer,
  tone,
  Icon,
}: {
  transfer: FileTransfer;
  tone: DynamicIslandIconTone;
  Icon: RuneIcon;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid size-[25px] shrink-0 place-items-center",
        RING_TONE[tone]
      )}
    >
      <svg
        viewBox="0 0 25 25"
        className="absolute inset-0 size-full -rotate-90"
      >
        <circle
          cx="12.5"
          cy="12.5"
          r="11"
          fill="none"
          strokeWidth="2.5"
          className="stroke-white/15"
        />
        <circle
          cx="12.5"
          cy="12.5"
          r="11"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - (transfer.progress ?? 0)}
          className="transition-all duration-200 ease-out"
        />
      </svg>
      <Icon className="icon-bold size-3" />
    </span>
  );
}

function TransferList({
  transfers,
  onCollapse,
}: {
  transfers: readonly FileTransfer[];
  onCollapse: () => void;
}) {
  const rows = transfers.slice(0, MAX_ROWS);
  const hidden = transfers.length - rows.length;
  return (
    <>
      {rows.map((transfer) => (
        <TransferRow
          key={transfer.id}
          transfer={transfer}
          onCollapse={onCollapse}
        />
      ))}
      {hidden > 0 ? (
        <p className="text-muted-foreground/70 text-2xs pt-1 pb-1 pl-13">
          {hidden} more {hidden === 1 ? "transfer" : "transfers"}
        </p>
      ) : null}
    </>
  );
}

function TransferRow({
  transfer,
  onCollapse,
}: {
  transfer: FileTransfer;
  onCollapse: () => void;
}) {
  const reduce = useReducedMotion();
  const look = transferLook(transfer);
  const percent = runningPercent(transfer);
  const cancellable = transfer.status === "running" && transfer.onCancel;
  const bar = BAR_TONE[look.tone];

  return (
    <div className="flex w-full items-start gap-2">
      <button
        type="button"
        aria-expanded
        className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-3xl text-left outline-offset-2"
        onClick={onCollapse}
      >
        <DynamicIslandIcon tone={look.tone}>
          <look.Icon className={cn(look.spin && "animate-spin")} />
        </DynamicIslandIcon>
        <span className="flex min-h-10 min-w-0 flex-1 flex-col justify-center py-0.5">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-sm leading-5 font-medium">
              {transfer.name}
            </span>
            {percent === null ? null : (
              // Moving numbers stay out of the island's live announcements.
              <span
                aria-live="off"
                className="text-muted-foreground shrink-0 text-xs tabular-nums"
              >
                {percent}%
              </span>
            )}
          </span>
          <span
            aria-live={transfer.status === "running" ? "off" : undefined}
            className="text-muted-foreground truncate text-xs leading-4 tabular-nums"
          >
            {transferDetail(transfer)}
          </span>
          {percent !== null && bar ? (
            <span
              aria-hidden="true"
              className="mt-2 mb-0.5 block h-1 overflow-hidden rounded-full bg-white/10"
            >
              <motion.span
                className={cn(
                  "block h-full w-full origin-left rounded-full",
                  bar
                )}
                initial={false}
                animate={{ scaleX: transfer.progress ?? 0 }}
                transition={reduce ? { duration: 0 } : { duration: 0.2 }}
              />
            </span>
          ) : null}
        </span>
      </button>
      {cancellable ? (
        <button
          type="button"
          aria-label={`Cancel ${transfer.direction} of ${transfer.name}`}
          className="text-muted-foreground hover:text-foreground grid size-10 shrink-0 cursor-pointer place-items-center rounded-full outline-offset-2 transition-colors hover:bg-white/10"
          onClick={() => transfer.onCancel?.()}
        >
          <Square aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
