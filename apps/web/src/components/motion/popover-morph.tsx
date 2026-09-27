"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactElement, ReactNode, Ref } from "react";
import { createPortal } from "react-dom";

import { usePopoverPortalPosition } from "#/components/motion/popover-position.ts";
import type { PortalLayout } from "#/components/motion/popover-position.ts";
import { EASE_OUT, SPRING_PANEL } from "#/lib/ease.ts";
import { useHydrated } from "#/lib/hooks/use-hydrated.ts";
import { cn } from "#/lib/utils.ts";

type Side = "top" | "bottom";
type Align = "start" | "center" | "end";

interface MorphContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  triggerId: string;
  contentId: string;
  /** The element the panel measures against — see `registerTrigger`. */
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  registerTrigger: (node: HTMLElement | null) => void;
  contentRef: React.MutableRefObject<HTMLDivElement | null>;
}

const MorphContext = createContext<MorphContextValue | null>(null);

function useMorphContext(component: string) {
  const ctx = useContext(MorphContext);
  if (!ctx) {
    throw new Error(`${component} must be used within <MorphPopover>`);
  }
  return ctx;
}

export interface MorphPopoverProps {
  children: ReactNode;
  /** Controlled open state. */
  open?: boolean;
  /** Uncontrolled initial open state. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/**
 * A popover whose panel grows from the trigger's alignment point. It lays out
 * at full size, then reveals itself from that point. Closes on outside pointer
 * or Escape. Controlled or uncontrolled.
 */
export function MorphPopover({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  className,
}: MorphPopoverProps) {
  const baseId = useId();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) {
        setInternalOpen(next);
      }
      onOpenChange?.(next);
    },
    [controlled, onOpenChange]
  );
  const toggle = useCallback(() => setOpen(!open), [setOpen, open]);

  // A trigger normally registers itself through MorphPopoverTrigger. It can't
  // when something else already clones the element — a Tooltip wrapping the
  // button, say — and an unregistered trigger leaves the panel with nothing to
  // measure against, so it renders permanently invisible. The root boxes the
  // trigger exactly (the content portals out of it), so it stands in until a
  // real trigger registers, and stands in again if that one unmounts. Both are
  // state, so a trigger arriving while the panel is open re-anchors it.
  const anchorRef = useMemo<React.MutableRefObject<HTMLElement | null>>(
    () => ({ current: trigger ?? root }),
    [root, trigger]
  );

  // The panel is a `role="dialog"` and goes inert the moment it closes, so
  // focus cannot be left sitting inside it: a dismissal hands it back to the
  // trigger, the way the ARIA dialog pattern asks. A pointer dismissal takes
  // the focus onward itself when it lands on something focusable — this only
  // catches the case where it would otherwise be stranded. When no trigger has
  // registered, the root anchor stands in only if it can actually hold focus;
  // there is nowhere better than where the keyboard already is, so leave it.
  const close = useCallback(() => {
    setOpen(false);
    const focused = document.activeElement;
    const inPanel =
      focused instanceof HTMLElement && contentRef.current?.contains(focused);
    if (!inPanel) {
      return;
    }
    const restore = trigger ?? (root && root.tabIndex >= 0 ? root : null);
    restore?.focus();
  }, [root, setOpen, trigger]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        root &&
        !root.contains(target) &&
        !contentRef.current?.contains(target)
      ) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open, root, close]);

  const ctx = useMemo<MorphContextValue>(
    () => ({
      open,
      setOpen,
      toggle,
      triggerId: `${baseId}-trigger`,
      contentId: `${baseId}-content`,
      triggerRef: anchorRef,
      registerTrigger: setTrigger,
      contentRef,
    }),
    [open, setOpen, toggle, baseId, anchorRef]
  );

  return (
    <MorphContext.Provider value={ctx}>
      <div ref={setRoot} className={cn("relative inline-flex", className)}>
        {children}
      </div>
    </MorphContext.Provider>
  );
}

export interface MorphPopoverTriggerProps {
  children: ReactElement;
}

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(node);
      } else if (ref && typeof ref === "object") {
        (ref as React.MutableRefObject<T | null>).current = node;
      }
    }
  };
}

/** Wraps a single element, toggling the popover on click. */
export function MorphPopoverTrigger({ children }: MorphPopoverTriggerProps) {
  const ctx = useMorphContext("MorphPopoverTrigger");
  if (!isValidElement(children)) {
    return children;
  }

  const child = children as ReactElement<Record<string, unknown>>;
  const childOnClick = child.props.onClick as
    | ((e: unknown) => void)
    | undefined;
  const childRef = (child.props as { ref?: Ref<HTMLElement> }).ref;

  // oxlint-disable-next-line react/no-clone-element -- The trigger is the caller's own element, wired up in place.
  return cloneElement(child, {
    id: ctx.triggerId,
    ref: mergeRefs(childRef, ctx.registerTrigger),
    onClick: (e: unknown) => {
      childOnClick?.(e);
      ctx.toggle();
    },
    "aria-haspopup": "dialog",
    "aria-expanded": ctx.open,
    "aria-controls": ctx.open ? ctx.contentId : undefined,
  });
}

const horizontalOrigin = {
  start: "left",
  center: "center",
  end: "right",
} as const;

const originFor = (side: Side, align: Align) =>
  `${side === "bottom" ? "top" : "bottom"} ${horizontalOrigin[align]}`;

const hiddenSides = {
  start: ["92%", "0%"],
  center: ["46%", "46%"],
  end: ["0%", "92%"],
} as const;

// The clip starts at the trigger's horizontal anchor. inset(top right bottom left).
/** Viewport position of the content next to its trigger. */
function contentPosition(
  layout: PortalLayout | null,
  side: Side,
  align: Align,
  sideOffset: number
) {
  if (!layout) {
    return { left: 0, top: 0 };
  }
  const { trigger, content } = layout;
  let alignShift = trigger.width - content.width;
  if (align === "start") {
    alignShift = 0;
  } else if (align === "center") {
    alignShift /= 2;
  }
  const top =
    side === "bottom"
      ? trigger.top + trigger.height + sideOffset
      : trigger.top - content.height - sideOffset;
  return { left: trigger.left + alignShift, top };
}

function clipHidden(side: Side, align: Align, radius: number) {
  const top = side === "bottom" ? "0%" : "92%";
  const bottom = side === "bottom" ? "92%" : "0%";
  const [right, left] = hiddenSides[align];
  return `inset(${top} ${right} ${bottom} ${left} round ${radius}px)`;
}
const clipShown = (radius: number) => `inset(0% 0% 0% 0% round ${radius}px)`;

// Preserve the original spring character on the wrapper, but tween the complex
// clip-path so it cannot snap when the spring resolves its final distance.
const MORPH_CLIP_TRANSITION = { duration: 0.32, ease: EASE_OUT } as const;

export interface MorphPopoverContentProps {
  children: ReactNode;
  side?: Side;
  align?: Align;
  /** Gap between trigger and panel, in px. Default 8. */
  sideOffset?: number;
  /** Panel corner radius, in px. Default 16. */
  radius?: number;
  className?: string;
}

export function MorphPopoverContent({
  children,
  side = "bottom",
  align = "end",
  sideOffset = 8,
  radius = 16,
  className,
}: MorphPopoverContentProps) {
  const { triggerRef, contentRef, contentId, triggerId, open } =
    useMorphContext("MorphPopoverContent");
  const reduce = useReducedMotion() ?? false;
  const portalReady = useHydrated();
  const layout = usePopoverPortalPosition(
    triggerRef,
    contentRef,
    portalReady && open
  );

  const { left, top } = contentPosition(layout, side, align, sideOffset);

  // Both directions travel between the exact same hidden/show states. Exit
  // targets "hidden" directly instead of introducing separate choreography.
  const wrap = reduce
    ? undefined
    : {
        hidden: { opacity: 0, scale: 0.96, transition: SPRING_PANEL },
        show: { opacity: 1, scale: 1, transition: SPRING_PANEL },
      };
  const clip = reduce
    ? undefined
    : {
        hidden: {
          clipPath: clipHidden(side, align, radius),
          transition: MORPH_CLIP_TRANSITION,
        },
        show: {
          clipPath: clipShown(radius),
          transition: MORPH_CLIP_TRANSITION,
        },
      };

  // Keep the server and first client render identical, then mount the portal.
  if (!portalReady) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          data-morph-popover-portal=""
          // Wrapper carries the shadow as a drop-shadow filter, which hugs the
          // clipped shape below (box-shadow would just get clipped away).
          variants={wrap}
          initial={reduce ? { opacity: 0 } : "hidden"}
          animate={reduce ? { opacity: 1 } : "show"}
          exit={reduce ? { opacity: 0 } : "hidden"}
          transition={reduce ? { duration: 0.12 } : undefined}
          style={{
            "--popover-left": `${left}px`,
            "--popover-top": `${top}px`,
            "--popover-origin": originFor(side, align),
          }}
          className={cn(
            "fixed top-(--popover-top) left-(--popover-left) z-[9999] origin-(--popover-origin) [filter:drop-shadow(0_10px_18px_rgba(0,0,0,0.14))]",
            !layout && "invisible"
          )}
        >
          <motion.div
            ref={contentRef}
            id={contentId}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A native <dialog> stays hidden unless opened imperatively; Motion drives this popover.
            role="dialog"
            aria-labelledby={triggerId}
            variants={clip}
            style={{ "--popover-radius": `${radius}px` }}
            className={cn(
              "border-border bg-background overflow-hidden rounded-(--popover-radius) border",
              className
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
