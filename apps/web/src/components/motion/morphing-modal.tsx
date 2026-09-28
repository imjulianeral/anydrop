"use client";
// beui.dev/components/motion/morphing-modal

import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
} from "motion/react";
import type { AnimationPlaybackControls } from "motion/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";

import { EASE_OUT, SPRING_PANEL } from "#/lib/ease.ts";
import { PresenceGate } from "#/lib/presence-gate.tsx";
import { cn } from "#/lib/utils.ts";

export interface MorphingModalProps {
  /** Which view is currently shown. `null` closes the modal. */
  viewId: string | null;
  onClose: () => void;
  children: ReactNode;
  /** "bottom" anchors to the viewport bottom (mobile-like). "center" centers vertically. */
  placement?: "bottom" | "center";
  className?: string;
}

export function MorphingModal({
  viewId,
  onClose,
  children,
  placement = "bottom",
  className,
}: MorphingModalProps) {
  const open = viewId !== null;
  const reduce = useReducedMotion();
  const offset = placement === "bottom" ? 40 : 20;
  const enterY = reduce ? 0 : offset;
  const enterScale = reduce ? 1 : 0.97;

  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Mounted only while open, and while open the chrome is two fixed siblings
  // rather than one wrapper: the backdrop spans the viewport edges but carries
  // the scrim colour, and the layer positioning the panel sits inset off every
  // edge (`inset-x-4 top-4`, bottom placement clears `--app-dock-space`). Both
  // hang off `PresenceGate`, so interaction releases in the same commit that
  // starts the exit rather than when it ends — `open` is already false for
  // those frames. See tests/fixed-overlay-edge-sampling.test.tsx.
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <PresenceGate key="backdrop">
          {({ gate }) => (
            <motion.button
              type="button"
              aria-label="Close modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              {...gate}
              onClick={onClose}
              className="bg-background/5 pointer-events-auto fixed inset-0 z-[80]"
            />
          )}
        </PresenceGate>
      ) : null}

      {open ? (
        <PresenceGate key="panel-layer">
          {({ isPresent, gate }) => (
            // The layer itself never takes pointer events, so it carries
            // `inert` alone rather than the gate's pointer-events value.
            <div
              inert={!isPresent}
              className={cn(
                "pointer-events-none fixed inset-x-4 top-4 z-[80] flex justify-center",
                placement === "bottom"
                  ? "bottom-(--app-dock-space) items-end"
                  : "bottom-4 items-center"
              )}
            >
              <motion.div
                key="panel"
                initial={{ opacity: 0, y: enterY, scale: enterScale }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  y: enterY,
                  scale: reduce ? 1 : 0.98,
                  transition: { duration: 0.18, ease: EASE_OUT },
                }}
                transition={SPRING_PANEL}
                {...gate}
                className={cn(
                  // Views set their own max width; the transition morphs between them.
                  "border-border bg-background pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-3xl border shadow-2xl transition-[max-width] duration-300 ease-out will-change-transform motion-reduce:transition-none",
                  className
                )}
              >
                <AutoHeight>
                  <MorphingView viewId={viewId ?? ""} className="p-5">
                    {children}
                  </MorphingView>
                </AutoHeight>
              </motion.div>
            </div>
          )}
        </PresenceGate>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Eases the panel's height to its content. Animating real height, rather than a
 * `layout` scale, keeps the content from being squashed and counter-scaled on
 * every frame while a view cross-fades inside.
 */
function AutoHeight({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);

  // Driven straight from the observer: a React state round-trip here lags the
  // view swap by several frames, leaving the new view clipped meanwhile.
  useLayoutEffect(() => {
    const boxNode = box.current;
    const contentNode = content.current;
    if (!boxNode || !contentNode) {
      return;
    }
    let first = true;
    let running: AnimationPlaybackControls | null = null;
    const observer = new ResizeObserver(([entry]) => {
      const height =
        entry?.borderBoxSize[0]?.blockSize ?? contentNode.offsetHeight;
      running?.stop();
      if (first || reduce) {
        first = false;
        boxNode.style.height = `${height}px`;
        return;
      }
      running = animate(boxNode, { height }, SPRING_PANEL);
    });
    observer.observe(contentNode);
    return () => {
      observer.disconnect();
      running?.stop();
    };
  }, [reduce]);

  return (
    <div ref={box} className="overflow-hidden">
      <div ref={content}>{children}</div>
    </div>
  );
}

/**
 * Cross-fades between views as `viewId` changes. Inside a `MorphingModal` the
 * panel resizes to fit, so a panel whose steps share one component's state can
 * animate them without remounting it.
 */
export function MorphingView({
  viewId,
  children,
  className,
}: {
  viewId: string;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  // Relative, so the view popped out on exit stays where it was.
  return (
    <div className={cn("relative", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={viewId}
          initial={
            reduce ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(4px)" }
          }
          animate={
            reduce
              ? { opacity: 1, transition: { duration: 0.18, ease: EASE_OUT } }
              : {
                  opacity: 1,
                  y: 0,
                  filter: "blur(0px)",
                  transition: { duration: 0.24, ease: EASE_OUT },
                  // A lingering blur(0px) keeps a filter layer over the whole
                  // view, so later repaints inside it flicker.
                  transitionEnd: { filter: "none" },
                }
          }
          exit={
            reduce
              ? { opacity: 0, transition: { duration: 0.14, ease: EASE_OUT } }
              : {
                  opacity: 0,
                  y: -8,
                  filter: "blur(4px)",
                  transition: { duration: 0.16, ease: EASE_OUT },
                }
          }
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
