import {
  animate,
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
  useMotionValue,
  useTransform,
} from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";

import { EASE_IN_OUT } from "#/lib/ease.ts";
import { gooBridge } from "#/lib/goo-bridge.ts";
import { radialSlots, topSlot } from "#/lib/radial-slots.ts";

export interface MorphFabAction {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  position?: "top";
}

interface Anchor {
  x: number;
  y: number;
  radius: number;
  viewportWidth: number;
  viewportHeight: number;
}

const ACTION_SIZE = 64;
const DURATION = 0.65;

/** Portals the fluid layer so a carousel's clipping cannot cut off the actions. */
export function MorphFab({
  id,
  label,
  triggerRef,
  open,
  onOpenChange,
  actions,
}: {
  id: string;
  label: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: MorphFabAction[];
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const close = useCallback(
    (restoreFocus = false) => {
      if (restoreFocus) {
        triggerRef.current?.focus({ preventScroll: true });
      }
      onOpenChange(false);
    },
    [onOpenChange, triggerRef]
  );

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    let frame = 0;
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        const next = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          radius: rect.width / 2,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        };
        setAnchor((previous) =>
          previous &&
          previous.x === next.x &&
          previous.y === next.y &&
          previous.radius === next.radius &&
          previous.viewportWidth === next.viewportWidth &&
          previous.viewportHeight === next.viewportHeight
            ? previous
            : next
        );
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        close(true);
      }
    };
    const dismiss = () => close(true);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("wheel", dismiss, { passive: true });
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("wheel", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [open, close, triggerRef]);

  const ready = anchor !== null;
  useEffect(() => {
    if (open && ready) {
      menuRef.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true });
    }
  }, [open, ready]);

  if (!anchor) {
    return null;
  }
  const lowerSlots = radialSlots(
    anchor,
    actions.filter((action) => action.position !== "top").length,
    ACTION_SIZE
  );
  let lowerIndex = 0;
  const slots = actions.map((action) =>
    action.position === "top"
      ? topSlot(anchor, ACTION_SIZE)
      : lowerSlots[lowerIndex++]
  );

  // Clip the SVG bridges at the viewport edge so they cannot add page scrollbars.
  return createPortal(
    <AnimatePresence>
      {open ? (
        <FabLayer
          key={id}
          ref={menuRef}
          id={id}
          role="menu"
          aria-label={label}
          className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
          initial="closed"
          animate="open"
          exit="closed"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape" || event.key === "Tab") {
              if (event.key === "Escape") {
                event.preventDefault();
              }
              close(true);
              return;
            }
            const buttons = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button"
              ),
            ];
            const current =
              document.activeElement instanceof HTMLButtonElement
                ? buttons.indexOf(document.activeElement)
                : -1;
            let next = current;
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              next = (current + 1) % buttons.length;
            }
            if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              next = (current - 1 + buttons.length) % buttons.length;
            }
            if (event.key === "Home") {
              next = 0;
            }
            if (event.key === "End") {
              next = buttons.length - 1;
            }
            if (next !== current) {
              event.preventDefault();
              buttons[next]?.focus();
            }
          }}
        >
          <div
            className="pointer-events-none absolute size-px"
            style={{ left: anchor.x, top: anchor.y }}
          >
            {actions.map((action, index) => (
              <FabAction
                key={action.id}
                action={action}
                slot={slots[index]}
                radius={anchor.radius}
                onSelect={() => {
                  close(true);
                  action.onSelect();
                }}
              />
            ))}
          </div>
        </FabLayer>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

function FabLayer(
  props: HTMLMotionProps<"div"> & { ref: RefObject<HTMLDivElement | null> }
) {
  const present = useIsPresent();
  return (
    <motion.div
      {...props}
      inert={!present}
      aria-hidden={!present || undefined}
    />
  );
}

function FabAction({
  action,
  slot,
  radius,
  onSelect,
}: {
  action: MorphFabAction;
  slot: { x: number; y: number };
  radius: number;
  onSelect: () => void;
}) {
  const maskId = useId();
  const present = useIsPresent();
  const reduce = useReducedMotion();
  const progress = useMotionValue(0);
  const x = useTransform(progress, (value) => slot.x * value);
  const y = useTransform(progress, (value) => slot.y * value);
  const scale = useTransform(progress, [0, 1], [0.6, 1]);
  const distance = Math.hypot(slot.x, slot.y);
  const restGap = distance - radius - ACTION_SIZE / 2;
  const bridge = useTransform(progress, (value) =>
    gooBridge(
      radius,
      (ACTION_SIZE / 2) * (0.6 + value * 0.4),
      distance * value,
      restGap
    )
  );
  const extent = distance + ACTION_SIZE / 2 + 4;

  useEffect(() => {
    const animation = animate(progress, present ? 1 : 0, {
      duration: reduce ? 0 : DURATION,
      ease: EASE_IN_OUT,
    });
    return () => animation.stop();
  }, [present, progress, reduce]);

  return (
    <>
      <svg
        aria-hidden="true"
        className="text-background pointer-events-none absolute"
        width={extent * 2}
        height={extent * 2}
        viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`}
        style={{ left: -extent, top: -extent }}
      >
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x={-extent}
            y={-extent}
            width={extent * 2}
            height={extent * 2}
          >
            <rect
              x={-extent}
              y={-extent}
              width={extent * 2}
              height={extent * 2}
              fill="white"
            />
            <circle r={radius} fill="black" />
          </mask>
        </defs>
        <g fill="currentColor" mask={`url(#${maskId})`}>
          <g
            transform={`rotate(${(Math.atan2(slot.y, slot.x) * 180) / Math.PI})`}
          >
            <motion.path d={bridge} />
          </g>
          <motion.g style={{ x, y, scale }}>
            <circle r={ACTION_SIZE / 2} />
          </motion.g>
        </g>
      </svg>
      <motion.button
        type="button"
        role="menuitem"
        aria-label={action.label}
        className="text-foreground focus-visible:outline-foreground pointer-events-auto absolute flex size-16 cursor-pointer items-center justify-center rounded-full outline-offset-4 will-change-transform focus-visible:outline-2"
        style={{ left: -ACTION_SIZE / 2, top: -ACTION_SIZE / 2, x, y, scale }}
        variants={{ closed: { opacity: 0 }, open: { opacity: 1 } }}
        transition={{ duration: reduce ? 0 : DURATION, ease: EASE_IN_OUT }}
        onClick={onSelect}
      >
        {action.icon}
        <span className="bg-background text-foreground absolute top-full mt-2 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap shadow-sm">
          {action.label}
        </span>
      </motion.button>
    </>
  );
}
