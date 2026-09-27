"use client";
// beui.dev/components/motion/dock

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createContext, useContext, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { EASE_OUT, SPRING_LAYOUT } from "#/lib/ease.ts";
import { useHoverCapable } from "#/lib/hooks/use-hover-capable.ts";
import { cn } from "#/lib/utils.ts";

interface DockContextValue {
  size: number;
  pillLayoutId: string;
  hoverLayoutId: string;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  canHover: boolean;
}

const DockContext = createContext<DockContextValue | null>(null);

export interface DockProps {
  children: ReactNode;
  className?: string;
  /** Size of each item in px. */
  size?: number;
}

export function Dock({ children, size = 44, className }: DockProps) {
  const id = useId();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const canHover = useHoverCapable();
  const ctx = useMemo<DockContextValue>(
    () => ({
      size,
      pillLayoutId: `${id}-active`,
      hoverLayoutId: `${id}-hover`,
      hoveredId,
      setHoveredId,
      canHover,
    }),
    [size, id, hoveredId, canHover]
  );

  return (
    <DockContext.Provider value={ctx}>
      <motion.div
        layoutRoot
        onMouseLeave={() => setHoveredId(null)}
        className={cn(
          "border-border bg-card/80 inline-flex h-auto items-end gap-1.5 rounded-2xl border px-2 py-1 shadow-2xl backdrop-blur-xl",
          className
        )}
      >
        {children}
      </motion.div>
    </DockContext.Provider>
  );
}

export interface DockItemProps {
  children: ReactNode;
  className?: string;
  /** When set, the item renders as a <button>. Omit when children carry their own link or button. */
  onClick?: () => void;
  active?: boolean;
  "aria-label"?: string;
}

export function DockItem({
  children,
  className,
  onClick,
  active,
  ...rest
}: DockItemProps) {
  const dock = useContext(DockContext);
  const reduce = useReducedMotion();
  const id = useId();
  const size = dock?.size ?? 44;
  const pillLayoutId = dock?.pillLayoutId ?? "dock-pill";
  const hoverId = dock?.hoveredId ?? null;
  const hovered = hoverId === id;
  const onHover = () => {
    if (dock?.canHover) {
      dock.setHoveredId(id);
    }
  };
  const hover = (
    <AnimatePresence initial={false}>
      {hoverId === null ? null : (
        <motion.span
          key="hover"
          initial={
            reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(6px)" }
          }
          animate={
            reduce ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)" }
          }
          exit={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(6px)" }}
          transition={
            reduce ? { duration: 0 } : { duration: 0.18, ease: EASE_OUT }
          }
          className="pointer-events-none absolute inset-0.5 -z-10"
        >
          {hovered ? (
            <motion.span
              layoutId={dock?.hoverLayoutId ?? "dock-hover"}
              transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
              className="bg-muted/70 block size-full rounded-xl"
            />
          ) : null}
        </motion.span>
      )}
    </AnimatePresence>
  );

  const pill = active ? (
    <motion.span
      layoutId={pillLayoutId}
      transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
      className="bg-primary/5 pointer-events-none absolute inset-0.5 -z-10 rounded-xl"
    />
  ) : null;
  const sharedClass = cn(
    "text-foreground relative isolate flex size-(--dock-item-size) shrink-0 items-center justify-center rounded-full",
    className
  );

  if (onClick) {
    return (
      <button
        type="button"
        onMouseEnter={onHover}
        onClick={onClick}
        aria-label={rest["aria-label"]}
        aria-pressed={active}
        style={{ "--dock-item-size": `${size}px` }}
        className={cn(
          sharedClass,
          "cursor-pointer border-0 bg-transparent p-0 outline-none",
          "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2"
        )}
      >
        {pill}
        {hover}
        {children}
      </button>
    );
  }

  // Children carry their own link or button (and its accessible name).
  return (
    <div
      style={{ "--dock-item-size": `${size}px` }}
      className={sharedClass}
      onMouseEnter={onHover}
    >
      {pill}
      {hover}
      {children}
    </div>
  );
}

export function DockSeparator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("bg-border mx-1 h-6 w-px self-center", className)}
    />
  );
}
