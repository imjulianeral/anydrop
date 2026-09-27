"use client";
// beui.dev/components/blocks/file-upload

import {
  AlertCircle,
  Check,
  ExternalLink,
  FileImage,
  Link as LinkIcon,
  LoaderCircle,
  Mic,
  Paperclip,
  Pause,
  Play,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Tooltip } from "#/components/motion/tooltip.tsx";
import { EASE_OUT, SPRING_LAYOUT, SPRING_PRESS } from "#/lib/ease.ts";
import { PresenceGate } from "#/lib/presence-gate.tsx";
import { cn } from "#/lib/utils.ts";

export type AttachmentUploadKind = "file" | "link" | "image" | "audio";
export type AttachmentRejectReason = "too-large" | "max-files";
export type AttachmentUploadStatus =
  | "idle"
  | "uploading"
  | "complete"
  | "failed";

export interface AttachmentUploadItem {
  id: string;
  name: string;
  kind: AttachmentUploadKind;
  size?: number;
  href?: string;
  previewUrl?: string;
  currentTime?: number;
  duration?: number;
  status?: AttachmentUploadStatus;
  error?: string;
  file?: File;
}

export interface AttachmentUploadClassNames {
  dropzone?: string;
  list?: string;
  row?: string;
}

export interface AttachmentUploadProps {
  value?: AttachmentUploadItem[];
  defaultValue?: AttachmentUploadItem[];
  onValueChange?: (items: AttachmentUploadItem[]) => void;
  onFilesAdded?: (items: AttachmentUploadItem[], files: File[]) => void;
  onFilesRejected?: (files: File[], reason: AttachmentRejectReason) => void;
  onRemove?: (item: AttachmentUploadItem) => void;
  onRetry?: (item: AttachmentUploadItem) => void;
  playingId?: string;
  onAudioToggle?: (item: AttachmentUploadItem) => void;
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  maxFileSize?: number;
  disabled?: boolean;
  title?: string;
  description?: string;
  attachmentsLabel?: string;
  className?: string;
  classNames?: AttachmentUploadClassNames;
}

const ITEM_TRANSITION = { duration: 0.2, ease: EASE_OUT } as const;
const DEFAULT_MAX_FILE_SIZE = 500 * 1024 * 1024;
const UPLOAD_PROGRESS_MS = 900;
const UPLOAD_COMPLETE_HOLD_MS = 1000;
const REMOVE_PENDING_MS = 420;

const WAVEFORM_BARS = [
  18, 31, 24, 39, 30, 43, 27, 18, 9, 29, 38, 24, 34, 18, 26, 37, 21, 14, 7, 11,
  22, 35, 18, 26, 41, 29, 17, 33,
].map((height, index) => ({ id: `wave-${index}-${height}`, height }));

function useControllableList<T>({
  value,
  defaultValue,
  onValueChange,
}: {
  value?: T[];
  defaultValue?: T[];
  onValueChange?: (items: T[]) => void;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? []);
  const controlled = value !== undefined;
  const items = value ?? internalValue;

  const setItems = useCallback(
    (next: T[]) => {
      if (!controlled) {
        setInternalValue(next);
      }
      onValueChange?.(next);
    },
    [controlled, onValueChange]
  );

  return [items, setItems] as const;
}

function formatBytes(bytes: number | undefined) {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;

  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatDuration(seconds: number | undefined) {
  const safeSeconds = Math.max(0, Math.round(seconds ?? 0));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function formatMaxSize(bytes: number) {
  const megabytes = bytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

function inferKind(file: File): AttachmentUploadKind {
  if (file.type.startsWith("image/")) {
    return "image";
  }
  if (file.type.startsWith("audio/")) {
    return "audio";
  }
  return "file";
}

function AttachmentIcon({ kind }: { kind: AttachmentUploadKind }) {
  if (kind === "link") {
    return <LinkIcon className="size-4" />;
  }
  if (kind === "image") {
    return <FileImage className="size-4" />;
  }
  if (kind === "audio") {
    return <Mic className="size-4" />;
  }
  return <Paperclip className="size-4" />;
}

function imageSource(item: AttachmentUploadItem) {
  if (item.kind !== "image") {
    return;
  }
  return item.previewUrl ?? item.href;
}

type RowActionState = "idle" | "uploading" | "complete" | "failed" | "removing";

function rowActionState(flags: {
  removing: boolean;
  uploading: boolean;
  uploadComplete: boolean;
  failed: boolean;
}): RowActionState {
  if (flags.removing) {
    return "removing";
  }
  if (flags.uploading) {
    return "uploading";
  }
  if (flags.uploadComplete) {
    return "complete";
  }
  return flags.failed ? "failed" : "idle";
}

function rowInitial(reduce: boolean, arrivalIndex: number) {
  if (reduce) {
    return { opacity: 0 };
  }
  return arrivalIndex >= 0
    ? { opacity: 0, y: -16, scale: 0.985 }
    : { opacity: 0, y: 6 };
}

function RowAction({
  label,
  onClick,
  state,
  retryable = false,
  reduce = false,
}: {
  label: string;
  onClick: () => void;
  state: RowActionState;
  retryable?: boolean;
  reduce?: boolean;
}) {
  if (state === "uploading") {
    return <span aria-hidden="true" className="size-9 shrink-0" />;
  }

  if (state === "complete") {
    return (
      <Tooltip content="Upload complete" side="top" delay={100}>
        <motion.output
          aria-live="polite"
          aria-label={`Upload complete for ${label}`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.75 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={ITEM_TRANSITION}
          className="text-success grid size-9 shrink-0 place-items-center rounded-xl"
        >
          <Check className="size-4" />
        </motion.output>
      </Tooltip>
    );
  }

  if (state === "removing") {
    return (
      <Tooltip content="Removing attachment" side="top" delay={100}>
        <output
          aria-live="polite"
          aria-label={`Removing ${label}`}
          className="text-muted-foreground grid size-9 shrink-0 place-items-center rounded-xl"
        >
          <motion.span
            animate={reduce ? undefined : { rotate: 360 }}
            transition={{
              duration: 0.7,
              ease: "linear",
              repeat: Infinity,
            }}
            className="grid place-items-center"
          >
            <LoaderCircle className="size-4" />
          </motion.span>
        </output>
      </Tooltip>
    );
  }

  if (state === "failed") {
    if (!retryable) {
      return (
        <Tooltip content="Upload failed" side="top" delay={100}>
          <output
            aria-live="polite"
            aria-label={`Upload failed for ${label}`}
            className="text-destructive grid size-9 shrink-0 place-items-center rounded-xl"
          >
            <AlertCircle className="size-4" />
          </output>
        </Tooltip>
      );
    }

    return (
      <Tooltip content="Retry upload" side="top" delay={100}>
        <motion.button
          type="button"
          aria-label={`Retry ${label}`}
          onClick={onClick}
          whileTap={reduce ? undefined : { scale: 0.92 }}
          transition={SPRING_PRESS}
          className="text-destructive hover:bg-destructive/10 focus-visible:ring-ring grid size-9 shrink-0 place-items-center rounded-xl transition-colors outline-none focus-visible:ring-2"
        >
          <RotateCcw className="size-4" />
        </motion.button>
      </Tooltip>
    );
  }

  return (
    <Tooltip content="Remove attachment" side="top" delay={100}>
      <motion.button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onClick}
        whileTap={reduce ? undefined : { scale: 0.92 }}
        transition={SPRING_PRESS}
        className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring grid size-9 shrink-0 place-items-center rounded-xl transition-colors outline-none focus-visible:ring-2"
      >
        <X className="size-4" />
      </motion.button>
    </Tooltip>
  );
}

function ImageThumbnail({
  item,
  layoutId,
  onPreview,
  reduce,
}: {
  item: AttachmentUploadItem;
  layoutId?: string;
  onPreview: (item: AttachmentUploadItem) => void;
  reduce: boolean;
}) {
  const src = imageSource(item);

  if (!src) {
    return (
      <span
        aria-hidden="true"
        className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg"
      >
        <FileImage className="size-4" />
      </span>
    );
  }

  return (
    <Tooltip
      side="top"
      delay={160}
      wrapperClassName="shrink-0"
      className="rounded-xl p-1 shadow-xl"
      content={
        <span className="block w-32">
          {/* biome-ignore lint/performance/noImgElement: Blob and remote previews keep this registry component framework-agnostic. */}
          <img
            src={src}
            alt=""
            className="h-20 w-full rounded-lg object-cover"
          />
          <span className="text-muted-foreground block px-1 pt-1 pb-0.5 text-center text-[10px] font-medium">
            Click to preview
          </span>
        </span>
      }
    >
      <motion.button
        type="button"
        aria-label={`Preview ${item.name}`}
        onClick={(event) => {
          event.currentTarget.blur();
          onPreview(item);
        }}
        whileTap={reduce ? undefined : { scale: 0.94 }}
        transition={SPRING_PRESS}
        className="group/image bg-muted ring-border/70 focus-visible:ring-ring relative size-9 shrink-0 overflow-hidden rounded-[10px] ring-1 outline-none focus-visible:ring-2"
      >
        {/* biome-ignore lint/performance/noImgElement: Motion layout requires the image element and portable blob URLs. */}
        <motion.img
          layoutId={layoutId}
          src={src}
          alt=""
          className="size-full object-cover"
          transition={{ layout: SPRING_LAYOUT }}
        />
      </motion.button>
    </Tooltip>
  );
}

function ImagePreviewDialog({
  item,
  layoutId,
  onClose,
  reduce,
}: {
  item: AttachmentUploadItem | null;
  layoutId?: string;
  onClose: () => void;
  reduce: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!item) {
      return;
    }

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [item, onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  const src = item ? imageSource(item) : undefined;
  const content =
    item && src ? (
      // The wrapper carries no box: both children are `fixed` and resolve
      // against the viewport themselves. The scrim spans the viewport edges but
      // paints a colour, and the layer that centres the image is inset off every
      // edge. `PresenceGate` releases interaction in the same commit that starts
      // the exit. See tests/fixed-overlay-edge-sampling.test.tsx.
      <PresenceGate>
        {({ isPresent, gate }) => (
          <div
            inert={!isPresent}
            className="pointer-events-none fixed top-0 left-0 z-[10000] size-0"
          >
            <motion.button
              type="button"
              aria-label="Close image preview"
              tabIndex={-1}
              className="pointer-events-auto fixed inset-0 size-full cursor-default bg-black/45 backdrop-blur-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: reduce ? 0.1 : 0.2, ease: EASE_OUT }}
              {...gate}
              onClick={onClose}
            />

            <div className="fixed inset-4 flex items-center justify-center sm:inset-8">
              <motion.div
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A native <dialog> stays hidden unless opened imperatively; Motion drives this preview.
                role="dialog"
                aria-modal="true"
                aria-label={`Preview of ${item.name}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={ITEM_TRANSITION}
                {...gate}
                className="pointer-events-auto relative"
              >
                {/* biome-ignore lint/performance/noImgElement: Motion layout requires the image element and portable blob URLs. */}
                <motion.img
                  layoutId={reduce ? undefined : layoutId}
                  src={src}
                  alt={item.name}
                  className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
                  transition={{ layout: SPRING_LAYOUT }}
                />
                <motion.button
                  ref={closeRef}
                  type="button"
                  aria-label="Close image preview"
                  onClick={onClose}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? undefined : { opacity: 0, scale: 0.8 }}
                  whileTap={reduce ? undefined : { scale: 0.92 }}
                  transition={SPRING_PRESS}
                  className="bg-background text-foreground ring-border/70 hover:bg-muted focus-visible:ring-ring absolute -top-3 -right-3 grid size-9 place-items-center rounded-full shadow-xl ring-1 transition-colors outline-none focus-visible:ring-2"
                >
                  <X className="size-4" />
                </motion.button>
              </motion.div>
            </div>
          </div>
        )}
      </PresenceGate>
    ) : null;

  return createPortal(
    reduce ? content : <AnimatePresence>{content}</AnimatePresence>,
    document.body
  );
}

function playbackProgress(item: AttachmentUploadItem) {
  if (!item.duration || item.duration <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, (item.currentTime ?? 0) / item.duration));
}

/** Rows that just arrived cascade in, one after another. */
function rowTransition(reduce: boolean, arrivalIndex: number) {
  if (reduce || arrivalIndex < 0) {
    return ITEM_TRANSITION;
  }
  const delay = Math.min(arrivalIndex, 5) * 0.055;
  return {
    ...SPRING_LAYOUT,
    delay,
    opacity: { duration: 0.16, ease: EASE_OUT, delay },
  };
}

function AudioControls({
  item,
  playing,
  reduce,
  onToggle,
}: {
  item: AttachmentUploadItem;
  playing: boolean;
  reduce: boolean;
  onToggle: (item: AttachmentUploadItem) => void;
}) {
  const progress = playbackProgress(item);
  return (
    <>
      <span className="text-muted-foreground w-9 shrink-0 text-xs tabular-nums">
        {formatDuration(item.currentTime)}
      </span>
      <span
        aria-hidden="true"
        className="flex h-11 min-w-0 flex-1 items-center gap-[3px] overflow-hidden"
      >
        {WAVEFORM_BARS.map((bar, index) => (
          <motion.span
            key={bar.id}
            className={cn(
              "h-(--bar-height) w-[3px] shrink-0 rounded-full",
              index / WAVEFORM_BARS.length <= progress
                ? "bg-foreground"
                : "bg-muted-foreground/35"
            )}
            style={{ "--bar-height": `${bar.height}px` }}
            animate={
              reduce || !playing ? undefined : { scaleY: [0.72, 1, 0.78] }
            }
            transition={{
              duration: 0.55,
              ease: EASE_OUT,
              repeat: Infinity,
              delay: index * 0.018,
            }}
          />
        ))}
      </span>
      <span className="text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums">
        {formatDuration(item.duration)}
      </span>
      <motion.button
        type="button"
        aria-label={`${playing ? "Pause" : "Play"} ${item.name}`}
        onClick={() => onToggle(item)}
        whileTap={{ scale: 0.94 }}
        transition={SPRING_PRESS}
        className="bg-foreground text-background focus-visible:ring-ring focus-visible:ring-offset-background grid size-9 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={playing ? "pause" : "play"}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
            transition={ITEM_TRANSITION}
          >
            {playing ? (
              <Pause className="size-4 fill-current" />
            ) : (
              <Play className="size-4 translate-x-px fill-current" />
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </>
  );
}

function FileDetails({
  item,
  failed,
}: {
  item: AttachmentUploadItem;
  failed: boolean;
}) {
  const size = formatBytes(item.size);
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="text-foreground block truncate text-sm font-medium">
          {item.name}
        </span>
        {failed ? (
          <span className="text-destructive block truncate text-[11px]">
            {item.error ?? "Upload failed"}
          </span>
        ) : null}
      </span>
      <span className="text-muted-foreground shrink-0 text-xs">
        {item.kind === "link" ? "Web" : size}
      </span>
      {item.kind === "link" && item.href ? (
        <a
          href={item.href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`Open ${item.name}`}
          className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring grid size-8 shrink-0 place-items-center rounded-lg transition-colors outline-none focus-visible:ring-2"
        >
          <ExternalLink className="size-4" />
        </a>
      ) : null}
    </>
  );
}

function AttachmentRow({
  item,
  playing,
  uploading,
  uploadComplete,
  failed,
  removing,
  arrivalIndex,
  imageLayoutId,
  onAudioToggle,
  onImagePreview,
  onRemove,
  onRetry,
  reduce,
  className,
}: {
  item: AttachmentUploadItem;
  playing: boolean;
  uploading: boolean;
  uploadComplete: boolean;
  failed: boolean;
  removing: boolean;
  arrivalIndex: number;
  imageLayoutId?: string;
  onAudioToggle?: (item: AttachmentUploadItem) => void;
  onImagePreview: (item: AttachmentUploadItem) => void;
  onRemove: (item: AttachmentUploadItem) => void;
  onRetry?: (item: AttachmentUploadItem) => void;
  reduce: boolean;
  className?: string;
}) {
  const actionState = rowActionState({
    removing,
    uploading,
    uploadComplete,
    failed,
  });
  const showUploadProgress = uploading || uploadComplete;
  const uploadProgress = (
    <motion.span
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An animated fill behind the row; <progress> cannot render it.
      role="progressbar"
      aria-label={`Uploading ${item.name}`}
      className="bg-success/20 pointer-events-none absolute inset-0 -z-10 origin-left"
      initial={{ opacity: 1, scaleX: 0 }}
      animate={{ opacity: 1, scaleX: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{
        duration: reduce ? 0.1 : UPLOAD_PROGRESS_MS / 1000,
        ease: EASE_OUT,
      }}
    />
  );
  const visibleUploadProgress = showUploadProgress ? uploadProgress : null;

  return (
    <motion.li
      layout={!reduce}
      initial={rowInitial(reduce, arrivalIndex)}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? undefined : { opacity: 0, y: -4 }}
      transition={rowTransition(reduce, arrivalIndex)}
      className={cn(
        "bg-muted/70 flex min-h-14 max-w-full min-w-0 items-center gap-1 rounded-2xl p-1",
        className
      )}
    >
      <div className="bg-background relative isolate flex min-w-0 flex-1 items-center gap-3 self-stretch overflow-hidden rounded-xl px-2 py-1">
        {failed ? (
          <span
            aria-hidden="true"
            className="bg-destructive/10 pointer-events-none absolute inset-0 -z-10"
          />
        ) : null}

        {item.kind === "image" ? (
          <ImageThumbnail
            item={item}
            layoutId={imageLayoutId}
            onPreview={onImagePreview}
            reduce={reduce}
          />
        ) : (
          <span
            aria-hidden="true"
            className="text-muted-foreground grid size-7 shrink-0 place-items-center"
          >
            <AttachmentIcon kind={item.kind} />
          </span>
        )}

        {item.kind === "audio" && onAudioToggle ? (
          <AudioControls
            item={item}
            playing={playing}
            reduce={reduce}
            onToggle={onAudioToggle}
          />
        ) : (
          <FileDetails item={item} failed={failed} />
        )}

        {reduce ? (
          visibleUploadProgress
        ) : (
          <AnimatePresence>{visibleUploadProgress}</AnimatePresence>
        )}
      </div>

      <RowAction
        label={item.name}
        onClick={() => {
          if (actionState === "failed") {
            onRetry?.(item);
            return;
          }
          onRemove(item);
        }}
        state={actionState}
        retryable={onRetry !== undefined}
        reduce={reduce}
      />
    </motion.li>
  );
}

function DropzoneIcon({
  dragging,
  reduce,
}: {
  dragging: boolean;
  reduce: boolean;
}) {
  return (
    <motion.span
      aria-hidden="true"
      animate={
        reduce
          ? undefined
          : {
              y: dragging ? -4 : 0,
              scale: dragging ? 1.08 : 1,
            }
      }
      transition={ITEM_TRANSITION}
      className="bg-muted text-foreground group-hover:bg-muted/80 group-data-[dragging=true]:bg-foreground group-data-[dragging=true]:text-background mb-3 grid size-11 place-items-center rounded-2xl transition-colors duration-200"
    >
      <Upload className="size-[18px]" />
    </motion.span>
  );
}

function DropzoneText({
  maxReached,
  title,
  description,
  count,
  maxFiles,
  maxFileSize,
}: {
  maxReached: boolean;
  title: string;
  description: string | undefined;
  count: number;
  maxFiles: number;
  maxFileSize: number;
}) {
  if (maxReached) {
    return (
      <>
        <span className="text-foreground text-sm font-semibold tracking-[-0.01em]">
          Attachment limit reached
        </span>
        <span className="text-muted-foreground mt-1 text-xs leading-5">
          {`${count} of ${maxFiles} attachments added`}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="text-foreground text-sm font-semibold tracking-[-0.01em]">
        {title}
      </span>
      <span className="text-muted-foreground mt-1 text-xs leading-5">
        {description ?? `Maximum ${formatMaxSize(maxFileSize)} file size`}
      </span>
    </>
  );
}

export function AttachmentUpload({
  value,
  defaultValue,
  onValueChange,
  onFilesAdded,
  onFilesRejected,
  onRemove,
  onRetry,
  playingId,
  onAudioToggle,
  accept,
  multiple = true,
  maxFiles = 12,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  disabled = false,
  title = "Drag and drop or browse files",
  description,
  attachmentsLabel = "Attachments",
  className,
  classNames,
}: AttachmentUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const ownedUrlsRef = useRef(new Set<string>());
  const lifecycleTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const reduce = useReducedMotion() ?? false;
  const [dragging, setDragging] = useState(false);
  const [previewItem, setPreviewItem] = useState<AttachmentUploadItem | null>(
    null
  );
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(
    () => new Set()
  );
  const [uploadCompleteIds, setUploadCompleteIds] = useState<Set<string>>(
    () => new Set()
  );
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set());
  const [items, setItems] = useControllableList({
    value,
    defaultValue,
    onValueChange,
  });
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const activeUrls = new Set(
      items.flatMap((item) => [item.previewUrl, item.href])
    );
    for (const url of ownedUrlsRef.current) {
      if (!activeUrls.has(url)) {
        URL.revokeObjectURL(url);
        ownedUrlsRef.current.delete(url);
      }
    }
  }, [items]);

  useEffect(
    () => () => {
      for (const url of ownedUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      ownedUrlsRef.current.clear();
      for (const timer of lifecycleTimersRef.current) {
        clearTimeout(timer);
      }
      lifecycleTimersRef.current.clear();
    },
    []
  );

  const maxReached = items.length >= maxFiles;
  const blocked = disabled || maxReached;
  const scheduleLifecycle = useCallback((task: () => void, delay: number) => {
    const timer = setTimeout(() => {
      lifecycleTimersRef.current.delete(timer);
      task();
    }, delay);
    lifecycleTimersRef.current.add(timer);
  }, []);

  const addFiles = useCallback(
    (incomingFiles: File[]) => {
      if (disabled || incomingFiles.length === 0) {
        return;
      }

      const availableSlots = Math.max(0, maxFiles - items.length);
      if (availableSlots === 0) {
        onFilesRejected?.(incomingFiles, "max-files");
        return;
      }

      const selectedFiles = incomingFiles.slice(
        0,
        multiple ? availableSlots : Math.min(1, availableSlots)
      );
      const oversized = selectedFiles.filter((file) => file.size > maxFileSize);
      const accepted = selectedFiles.filter((file) => file.size <= maxFileSize);

      if (oversized.length > 0) {
        onFilesRejected?.(oversized, "too-large");
      }
      if (incomingFiles.length > selectedFiles.length) {
        onFilesRejected?.(
          incomingFiles.slice(selectedFiles.length),
          "max-files"
        );
      }

      const added = accepted.map((file, index) => {
        const kind = inferKind(file);
        const objectUrl = URL.createObjectURL(file);
        ownedUrlsRef.current.add(objectUrl);

        return {
          id: `${Date.now()}-${index}-${file.name}`,
          name: file.name,
          kind,
          size: file.size,
          previewUrl: kind === "image" ? objectUrl : undefined,
          href: objectUrl,
          currentTime: kind === "audio" ? 0 : undefined,
          duration: kind === "audio" ? 0 : undefined,
          file,
        };
      });

      if (added.length === 0) {
        return;
      }
      setItems([...items, ...added]);
      if (value === undefined) {
        const addedIds = added.map((item) => item.id);
        setUploadingIds((current) => new Set([...current, ...addedIds]));
        scheduleLifecycle(
          () => {
            setUploadingIds((current) => {
              const next = new Set(current);
              for (const id of addedIds) {
                next.delete(id);
              }
              return next;
            });
            setUploadCompleteIds(
              (current) => new Set([...current, ...addedIds])
            );
            scheduleLifecycle(() => {
              setUploadCompleteIds((current) => {
                const next = new Set(current);
                for (const id of addedIds) {
                  next.delete(id);
                }
                return next;
              });
            }, UPLOAD_COMPLETE_HOLD_MS);
          },
          reduce ? 140 : UPLOAD_PROGRESS_MS
        );
      }
      onFilesAdded?.(added, accepted);
    },
    [
      disabled,
      items,
      maxFileSize,
      maxFiles,
      multiple,
      onFilesAdded,
      onFilesRejected,
      reduce,
      scheduleLifecycle,
      setItems,
      value,
    ]
  );

  const finalizeRemove = useCallback(
    (item: AttachmentUploadItem) => {
      const ownedUrl = [item.previewUrl, item.href].find(
        (url): url is string =>
          url !== undefined && ownedUrlsRef.current.has(url)
      );
      if (ownedUrl) {
        URL.revokeObjectURL(ownedUrl);
        ownedUrlsRef.current.delete(ownedUrl);
      }
      setPreviewItem((current) => (current?.id === item.id ? null : current));
      setUploadingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      setUploadCompleteIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      setItems(itemsRef.current.filter((entry) => entry.id !== item.id));
      onRemove?.(item);
    },
    [onRemove, setItems]
  );

  const requestRemove = useCallback(
    (item: AttachmentUploadItem) => {
      if (removingIds.has(item.id)) {
        return;
      }

      setRemovingIds((current) => new Set(current).add(item.id));
      scheduleLifecycle(
        () => {
          finalizeRemove(item);
          setRemovingIds((current) => {
            const next = new Set(current);
            next.delete(item.id);
            return next;
          });
        },
        reduce ? 140 : REMOVE_PENDING_MS
      );
    },
    [finalizeRemove, reduce, removingIds, scheduleLifecycle]
  );

  const resetDrag = useCallback(() => {
    dragDepthRef.current = 0;
    setDragging(false);
  }, []);
  const closePreview = useCallback(() => setPreviewItem(null), []);

  // Close the preview in the same render when its item goes away.
  if (previewItem && !items.some((item) => item.id === previewItem.id)) {
    setPreviewItem(null);
  }

  const uploadOrder = [...uploadingIds];
  const previewLayoutId = previewItem
    ? `attachment-image-${previewItem.id}`
    : undefined;

  return (
    <LayoutGroup id={inputId}>
      <div className={cn("w-full max-w-full min-w-0", className)}>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          aria-label="Upload attachments"
          accept={accept}
          multiple={multiple}
          disabled={blocked}
          tabIndex={-1}
          className="sr-only"
          onChange={(event) => {
            addFiles([...(event.currentTarget.files ?? [])]);
            event.currentTarget.value = "";
          }}
        />

        <motion.button
          type="button"
          disabled={blocked}
          data-dragging={dragging}
          animate={reduce ? undefined : { scale: dragging ? 1.006 : 1 }}
          whileTap={reduce ? undefined : { scale: 0.995 }}
          transition={SPRING_PRESS}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            if (blocked) {
              return;
            }
            event.preventDefault();
            dragDepthRef.current += 1;
            setDragging(true);
          }}
          onDragOver={(event) => {
            if (blocked) {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (blocked) {
              return;
            }
            event.preventDefault();
            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
            if (dragDepthRef.current === 0) {
              setDragging(false);
            }
          }}
          onDrop={(event) => {
            if (blocked) {
              return;
            }
            event.preventDefault();
            resetDrag();
            addFiles([...event.dataTransfer.files]);
          }}
          className={cn(
            "group relative isolate flex min-h-52 w-full max-w-full min-w-0 flex-col items-center justify-center overflow-hidden rounded-[2rem] p-2 text-center outline-none",
            "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2",
            "disabled:pointer-events-none disabled:opacity-55",
            classNames?.dropzone
          )}
        >
          <span
            aria-hidden="true"
            className="border-muted-foreground/25 group-hover:border-muted-foreground/45 group-data-[dragging=true]:border-foreground/65 group-data-[dragging=true]:bg-muted/20 absolute inset-2 -z-10 rounded-[1.5rem] border border-dashed transition-[border-color,background-color] duration-200"
          />
          <DropzoneIcon dragging={dragging} reduce={reduce} />
          <DropzoneText
            maxReached={maxReached}
            title={title}
            description={description}
            count={items.length}
            maxFiles={maxFiles}
            maxFileSize={maxFileSize}
          />
        </motion.button>

        {items.length > 0 ? (
          <section
            className="mt-8 max-w-full min-w-0"
            aria-labelledby={`${inputId}-attachments`}
          >
            <h3
              id={`${inputId}-attachments`}
              className="text-foreground text-sm font-semibold"
            >
              {attachmentsLabel}
            </h3>

            <ul
              className={cn(
                "mt-3 max-w-full min-w-0 space-y-2",
                classNames?.list
              )}
            >
              <AnimatePresence initial={uploadOrder.length > 0}>
                {items.map((item) => (
                  <AttachmentRow
                    key={item.id}
                    item={item}
                    playing={playingId === item.id}
                    uploading={
                      uploadingIds.has(item.id) || item.status === "uploading"
                    }
                    uploadComplete={
                      uploadCompleteIds.has(item.id) ||
                      item.status === "complete"
                    }
                    failed={item.status === "failed"}
                    removing={removingIds.has(item.id)}
                    arrivalIndex={uploadOrder.indexOf(item.id)}
                    imageLayoutId={
                      reduce ? undefined : `attachment-image-${item.id}`
                    }
                    onAudioToggle={onAudioToggle}
                    onImagePreview={setPreviewItem}
                    onRemove={requestRemove}
                    onRetry={onRetry}
                    reduce={reduce}
                    className={classNames?.row}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ) : null}

        <ImagePreviewDialog
          item={previewItem}
          layoutId={reduce ? undefined : previewLayoutId}
          onClose={closePreview}
          reduce={reduce}
        />
      </div>
    </LayoutGroup>
  );
}
