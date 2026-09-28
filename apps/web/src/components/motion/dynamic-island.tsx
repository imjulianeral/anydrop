"use client";
// beui.dev/components/blocks/dynamic-island

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { EASE_OUT } from "#/lib/ease.ts";
import { cn } from "#/lib/utils.ts";

interface IslandContextValue {
  view: string | null;
}

const IslandContext = createContext<IslandContextValue | null>(null);

// Shell physics in Apple's duration/bounce form one long perceptual glide with barely-there bounce, identical in
// both directions. The shell animates real width/height (not transforms), so
// slots are never scale-distorted.
const SHELL_SPRING = {
  type: "spring",
  duration: 0.8,
  bounce: 0.2,
} as const;

// Content gets a touch more life than the shell.
const CONTENT_SPRING = {
  type: "spring",
  duration: 0.8,
  bounce: 0.35,
} as const;

// Constant radius — never animated. The browser clamps it to half the shell
// height, so the pill-to-rounded-rect morph falls out of the resize for free
// with zero chance of corner glitches.
//
// Everything inside is sized to sit concentric with these corners: a 40px
// icon badge with 8px of padding (20 + 8 = 28) in a view, and a 25px badge
// with 6px of padding (12.5 + 6 = 18.5, the clamped radius) in the pill.

// iPhone pill dimensions. Also the shell's pre-measure animate target: if the
// first commit already has a view active (e.g. a click replayed after
// hydration), the shell blooms from the pill instead of rendering expanded
// with no animation. Lives in `animate`, not `initial`, so server and client
// markup agree.
const PILL_WIDTH = 126;
const PILL_HEIGHT = 37;

/** Tracks the natural size of the content so the shell can spring to it. */
function useContentSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null
  );

  // Synchronous mount measure: the shell must own explicit dimensions before
  // the first interaction. ResizeObserver fires async after mount — a quick
  // first press could beat it, leaving the shell auto-sized so the view
  // snapped open instead of springing.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    setSize({ width: el.offsetWidth, height: el.offsetHeight });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      setSize({ width: el.offsetWidth, height: el.offsetHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

function Slot({
  keyId,
  children,
  className,
}: {
  keyId: string;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={keyId}
      initial={
        reduce
          ? { opacity: 0, filter: "blur(0px)" }
          : { opacity: 0, scale: 0.9, y: -8, filter: "blur(5px)" }
      }
      animate={
        reduce
          ? { opacity: 1, filter: "blur(0px)" }
          : { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }
      }
      // Exit gets sucked up into the pill — fast, blur-free, before the
      // shrinking shell can clip it.
      exit={
        reduce
          ? { opacity: 0, filter: "blur(0px)", transition: { duration: 0.1 } }
          : {
              opacity: 0,
              scale: 0.9,
              y: -6,
              filter: "blur(0px)",
              transition: { duration: 0.08, ease: EASE_OUT },
            }
      }
      // One spring drives transform, opacity and blur together — no per
      // property tweens, no delays. Content travels with the shell.
      transition={reduce ? { duration: 0.15 } : CONTENT_SPRING}
      // Anchored to the pill line: content unfurls downward out of it and is
      // sucked back up into it.
      className={cn("flex origin-top items-center justify-center", className)}
    >
      {children}
    </motion.div>
  );
}

export interface DynamicIslandProps {
  /** Active view id. `null` shows the compact pill. */
  view: string | null;
  /** Compact pill content, shown when no view is active. */
  compact?: ReactNode;
  /** Identifies the compact content; a new id cross-fades the pill. */
  compactId?: string;
  /** DynamicIslandView elements. */
  children?: ReactNode;
  className?: string;
}

export function DynamicIsland({
  view,
  compact,
  compactId = "compact",
  children,
  className,
}: DynamicIslandProps) {
  const reduce = useReducedMotion();
  const expanded = view !== null;
  const [sizerRef, size] = useContentSize();
  const contextValue = useMemo(() => ({ view }), [view]);

  return (
    <IslandContext.Provider value={contextValue}>
      <motion.div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An animated block container; <output> only allows phrasing content.
        role="status"
        aria-live="polite"
        initial={false}
        animate={
          size
            ? { width: size.width, height: size.height }
            : { width: PILL_WIDTH, height: PILL_HEIGHT }
        }
        transition={reduce ? { duration: 0 } : SHELL_SPRING}
        // items-start pins content to the top edge while the shell springs, so
        // expansion reads as unfurling downward out of the pill. Top-align the
        // island in its parent (like under a notch) to complete the effect.
        // `dark` scopes the theme tokens: the island is black in both themes,
        // so muted text and buttons inside it use their dark-surface values.
        className={cn(
          "dark relative inline-flex items-start justify-center overflow-hidden rounded-[28px]",
          "text-foreground bg-black ring-1 ring-white/10",
          "shadow-[0_18px_40px_-12px_rgb(0_0_0/0.45),0_4px_12px_-4px_rgb(0_0_0/0.2)]",
          className
        )}
      >
        {/* w-max keeps this at the natural size of the active content; the
            shell springs toward it. */}
        <div ref={sizerRef} className="w-max">
          <AnimatePresence mode="popLayout" initial={false}>
            {!expanded && compact ? (
              <Slot
                key={compactId}
                keyId={compactId}
                // iPhone pill proportions: ~126 x 37.
                className="h-[37px] min-w-[126px] px-1.5 text-xs font-medium"
              >
                {compact}
              </Slot>
            ) : null}
          </AnimatePresence>
          {children}
        </div>
      </motion.div>
    </IslandContext.Provider>
  );
}

export interface DynamicIslandViewProps {
  /** Matches the parent `view` prop when active. */
  id: string;
  children: ReactNode;
  className?: string;
}

export function DynamicIslandView({
  id,
  children,
  className,
}: DynamicIslandViewProps) {
  const ctx = useContext(IslandContext);
  if (!ctx) {
    throw new Error("DynamicIslandView must be used inside <DynamicIsland>");
  }
  const active = ctx.view === id;

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {active ? (
        <Slot key={id} keyId={id} className={cn("p-2", className)}>
          {children}
        </Slot>
      ) : null}
    </AnimatePresence>
  );
}

const ICON_TONE = {
  blue: "bg-series-blue/15 text-series-blue",
  violet: "bg-series-violet/15 text-series-violet",
  green: "bg-success/15 text-success",
  red: "bg-destructive/15 text-destructive",
  amber: "bg-warning/15 text-warning",
  gray: "bg-white/10 text-muted-foreground",
} as const;

export type DynamicIslandIconTone = keyof typeof ICON_TONE;

export interface DynamicIslandIconProps {
  tone: DynamicIslandIconTone;
  /** `sm` fits the compact pill, `md` leads a view. */
  size?: "sm" | "md";
  /** A single icon; it is sized and centered by the badge. */
  children: ReactNode;
  className?: string;
}

/**
 * The tinted circle that leads island content. Sized to sit concentric with
 * the shell's corners when placed at the view's (or pill's) padding.
 */
export function DynamicIslandIcon({
  tone,
  size = "md",
  children,
  className,
}: DynamicIslandIconProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full [&>svg]:shrink-0",
        size === "sm"
          ? "icon-bold size-[25px] [&>svg]:size-3.5"
          : "size-10 [&>svg]:size-[18px]",
        ICON_TONE[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
