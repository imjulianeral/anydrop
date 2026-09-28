"use client";
// beui.dev/components/blocks/bloom-menu
// Adapted: items carry values and one can be selected, the trigger shows the
// selection, and `anchor="top"` grows the panel downward for page headers.

import { ChevronDown, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import type { ComponentType } from "react";

import { EASE_OUT } from "#/lib/ease.ts";
import { cn } from "#/lib/utils.ts";

export interface BloomMenuItem<T extends string> {
  value: T;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

// Folder-open feel: a touch of overshoot as the panel expands, kept subtle.
const SPRING_FOLDER = {
  type: "spring",
  stiffness: 300,
  damping: 32,
  mass: 0.9,
} as const;

const MAX_COLUMNS = 3;

const COLUMN_CLASS = ["grid-cols-1", "grid-cols-2", "grid-cols-3"] as const;

// Half the h-8 trigger: a pill that morphs into the panel's rounded rect.
const TRIGGER_RADIUS = 16;
const PANEL_RADIUS = 20;

export interface BloomMenuProps<T extends string> {
  items: readonly BloomMenuItem<T>[];
  /** The selected item, shown on the trigger and marked in the panel. */
  value?: T;
  onSelect?: (value: T) => void;
  /** Heading inside the open panel; also names the trigger for assistive tech. */
  title: string;
  /**
   * `center` blooms out around the trigger in every direction. `top` keeps
   * the trigger's top edge fixed and grows down, for menus at a page's top.
   */
  anchor?: "center" | "top";
  className?: string;
}

export function BloomMenu<T extends string>({
  items,
  value,
  onSelect,
  title,
  anchor = "center",
  className,
}: BloomMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const layoutId = useId();
  const panelId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  // The trigger remounts on close, so focus is handed back to it explicitly.
  const returnFocus = useRef(false);
  const selected = items.find((item) => item.value === value) ?? items[0];

  useEffect(() => {
    if (!open) {
      if (returnFocus.current) {
        returnFocus.current = false;
        triggerRef.current?.focus();
      }
      return;
    }
    selectedRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        returnFocus.current = true;
        setOpen(false);
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (
        ref.current &&
        event.target instanceof Node &&
        !ref.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const close = () => {
    returnFocus.current = true;
    setOpen(false);
  };

  const morph = reduce ? { duration: 0.15 } : SPRING_FOLDER;
  const columns = Math.min(MAX_COLUMNS, items.length);
  const rows = Math.ceil(items.length / columns);
  const panelWidth = "w-[min(86vw,22rem)]";

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      {/* spacer fixes the anchor to the trigger size */}
      <div className="h-8 w-36" aria-hidden="true" />

      {/* Box as wide as the OPEN panel and centered on the trigger.
          justify-items-center only centers an item that fits its cell, so the
          cell must be as wide as the panel — otherwise the overflow
          left-anchors and the panel expands rightward. Both states share its
          center line, so the morph grows outward from the middle. */}
      <div
        className={cn(
          "pointer-events-none absolute left-1/2 z-30 grid -translate-x-1/2 justify-items-center *:pointer-events-auto",
          panelWidth,
          anchor === "top"
            ? "top-0 items-start"
            : "top-1/2 h-75 -translate-y-1/2 items-center"
        )}
      >
        {/* popLayout pulls the exiting trigger out of grid flow at once, so the
            grid never briefly holds two rows and shoves the panel off-center */}
        <AnimatePresence initial={false} mode="popLayout">
          {open ? (
            <motion.div
              key="panel"
              id={panelId}
              layoutId={layoutId}
              transition={morph}
              // oxlint-disable-next-line shadcn/no-inline-styles -- Motion corrects border radius during layout morphs only when it is set in style.
              style={{ borderRadius: PANEL_RADIUS }}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An animated panel; <fieldset> can't be the morph target.
              role="group"
              aria-label={title}
              className={cn(
                "border-border bg-card overflow-hidden border shadow-lg",
                panelWidth
              )}
            >
              <motion.div
                // `layout` lets motion undo the box's morph scaling so this
                // content stays crisp instead of stretching with the resize.
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduce ? 0 : 0.12, duration: 0.2 }}
              >
                <div className="border-border flex items-center justify-between border-b py-2 pr-2 pl-4">
                  <span className="text-muted-foreground text-xs font-medium">
                    {title}
                  </span>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close menu"
                    className="text-muted-foreground hover:text-foreground hover:bg-muted grid size-7 cursor-pointer place-items-center rounded-full transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>

                <motion.div
                  // Iris reveal: start as a small box at the grid center and
                  // open outward to all four corners, so the menu grows from
                  // the middle in every direction instead of wiping top-down.
                  initial={
                    reduce ? false : { clipPath: "inset(45% 34% 45% 34%)" }
                  }
                  animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
                  transition={{
                    delay: reduce ? 0 : 0.08,
                    duration: 0.45,
                    ease: EASE_OUT,
                  }}
                  className={cn("grid", COLUMN_CLASS[columns - 1])}
                >
                  {items.map((item, index) => {
                    // Radial stagger: delay each item by its distance from the
                    // grid center so the open reads as center-out.
                    const col = index % columns;
                    const row = Math.floor(index / columns);
                    const dist = Math.hypot(
                      col - (columns - 1) / 2,
                      row - (rows - 1) / 2
                    );
                    const active = item.value === selected?.value;
                    return (
                      <button
                        key={item.value}
                        ref={active ? selectedRef : undefined}
                        type="button"
                        aria-label={item.label}
                        aria-pressed={active}
                        onClick={() => {
                          onSelect?.(item.value);
                          close();
                        }}
                        // Static cells with hairline borders (no animated
                        // fill) so the grid lines never flicker as items
                        // stagger in. Only the inner content animates.
                        className={cn(
                          "border-border flex cursor-pointer items-center justify-center px-3 py-5 transition-colors focus-visible:outline-offset-[-2px]",
                          active
                            ? "bg-muted/60 text-foreground"
                            : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                          col < columns - 1 && "border-r",
                          row < rows - 1 && "border-b"
                        )}
                      >
                        <motion.span
                          initial={
                            reduce
                              ? { opacity: 0 }
                              : { opacity: 0, scale: 0.85, filter: "blur(6px)" }
                          }
                          animate={{
                            opacity: 1,
                            scale: 1,
                            filter: "blur(0px)",
                          }}
                          transition={{
                            delay: reduce ? 0 : 0.1 + dist * 0.07,
                            type: "spring",
                            stiffness: 440,
                            damping: 34,
                          }}
                          className="flex flex-col items-center gap-2"
                        >
                          <item.icon className="size-5" />
                          <span className="text-xs font-medium">
                            {item.label}
                          </span>
                        </motion.span>
                      </button>
                    );
                  })}
                </motion.div>
              </motion.div>
            </motion.div>
          ) : (
            <motion.button
              key="trigger"
              ref={triggerRef}
              type="button"
              layoutId={layoutId}
              transition={morph}
              // oxlint-disable-next-line shadcn/no-inline-styles -- Motion corrects border radius during layout morphs only when it is set in style.
              style={{ borderRadius: TRIGGER_RADIUS }}
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={selected ? `${title}: ${selected.label}` : title}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              className="border-border bg-card text-foreground inline-flex h-8 w-36 cursor-pointer items-center justify-center border text-xs font-medium"
            >
              {/* own `layout` counter-scales the label so it stays crisp while
                  the button box morphs, instead of stretching with it */}
              <motion.span
                layout
                className="inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                {selected ? (
                  <>
                    <selected.icon className="text-muted-foreground size-3.5" />
                    {selected.label}
                  </>
                ) : (
                  title
                )}
                <ChevronDown className="text-muted-foreground size-3.5" />
              </motion.span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
