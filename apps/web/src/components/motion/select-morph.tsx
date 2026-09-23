"use client";
// beui.dev/components/motion/select-morph
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Custom listbox elements support the beUI morph animation. */

import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Transition, Variants } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { cn } from "#/lib/utils.ts";

// Shared-layout morph: trigger box grows into the panel and back, one surface.
const MORPH: Transition = { type: "spring", duration: 0.5, bounce: 0.22 };
// Trigger and panel header share this row so the morph stays seamless.
const ROW =
  "flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-sm";

const LIST: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.08 } },
};
const ITEM: Variants = {
  hidden: { opacity: 0, y: -6, filter: "blur(3px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)" },
};

interface MorphContextValue {
  value: string | undefined;
  open: boolean;
  setOpen: (open: boolean) => void;
  select: (value: string) => void;
  register: (value: string, label: string) => void;
  unregister: (value: string) => void;
  labelFor: (value: string | undefined) => string | undefined;
  placeholder: string;
  setPlaceholder: (p: string) => void;
  reduce: boolean;
  layoutId: string;
  triggerId: string;
  listId: string;
  disabled: boolean;
  labelId?: string;
}

const MorphContext = createContext<MorphContextValue | null>(null);

function useMorphContext(component: string) {
  const ctx = useContext(MorphContext);
  if (!ctx) {
    throw new Error(`${component} must be used within <MorphSelect>`);
  }
  return ctx;
}

export interface MorphSelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  "aria-labelledby"?: string;
}

export function MorphSelect({
  value,
  defaultValue,
  onValueChange,
  disabled = false,
  className,
  children,
  "aria-labelledby": labelId,
}: MorphSelectProps) {
  const reduce = useReducedMotion() ?? false;
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue);
  // ref-counted: items render twice (hidden registrar + open panel), so a
  // label is only dropped once every copy with that value has unmounted.
  const [labels, setLabels] = useState<
    Map<string, { label: string; count: number }>
  >(new Map());
  const [placeholder, setPlaceholder] = useState("Select");

  const controlled = value !== undefined;
  const current = controlled ? value : internal;

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() =>
      rootRef.current
        ?.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')
        ?.focus()
    );
  }, []);

  const select = useCallback(
    (next: string) => {
      if (disabled) {
        return;
      }
      if (!controlled) {
        setInternal(next);
      }
      onValueChange?.(next);
      close();
    },
    [controlled, onValueChange, disabled, close]
  );

  const register = useCallback((v: string, label: string) => {
    setLabels(
      (m) => new Map([...m, [v, { label, count: (m.get(v)?.count ?? 0) + 1 }]])
    );
  }, []);
  const unregister = useCallback((v: string) => {
    setLabels((m) => {
      const entry = m.get(v);
      if (!entry) {
        return m;
      }
      const next = new Map(m);
      if (entry.count <= 1) {
        next.delete(v);
      } else {
        next.set(v, { label: entry.label, count: entry.count - 1 });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const list = rootRef.current?.querySelector("[role=listbox]");
      (
        list?.querySelector<HTMLButtonElement>(
          "[aria-selected=true]:not(:disabled)"
        ) ??
        list?.querySelector<HTMLButtonElement>("[role=option]:not(:disabled)")
      )?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  useEffect(() => {
    const root = rootRef.current;
    const onKey = (event: KeyboardEvent) => {
      if (disabled) {
        return;
      }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        const options = [
          ...(rootRef.current?.querySelectorAll<HTMLButtonElement>(
            "[role=listbox] [role=option]:not(:disabled)"
          ) ?? []),
        ];
        const index =
          document.activeElement instanceof HTMLButtonElement
            ? options.indexOf(document.activeElement)
            : -1;
        let next =
          (index + (event.key === "ArrowUp" ? -1 : 1) + options.length) %
          options.length;
        if (event.key === "Home") {
          next = 0;
        }
        if (event.key === "End") {
          next = options.length - 1;
        }
        options[next]?.focus();
      }
    };
    root?.addEventListener("keydown", onKey);
    return () => root?.removeEventListener("keydown", onKey);
  }, [disabled, open]);

  const ctx = useMemo<MorphContextValue>(
    () => ({
      value: current,
      open,
      setOpen: (next) => (next ? setOpen(true) : close()),
      select,
      register,
      unregister,
      labelFor: (v) => (v === undefined ? undefined : labels.get(v)?.label),
      placeholder,
      setPlaceholder,
      reduce,
      layoutId: `${baseId}-surface`,
      triggerId: `${baseId}-trigger`,
      listId: `${baseId}-list`,
      disabled,
      labelId,
    }),
    [
      current,
      open,
      select,
      register,
      unregister,
      labels,
      placeholder,
      reduce,
      baseId,
      disabled,
      labelId,
      close,
    ]
  );

  return (
    <MorphContext.Provider value={ctx}>
      <div
        ref={rootRef}
        className={cn("relative", open && "z-40", className)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setOpen(false);
          }
        }}
      >
        {children}
      </div>
    </MorphContext.Provider>
  );
}

export interface MorphSelectValueProps {
  placeholder?: string;
  className?: string;
}

export function MorphSelectValue({
  placeholder,
  className,
}: MorphSelectValueProps) {
  const ctx = useMorphContext("MorphSelectValue");
  const { setPlaceholder } = ctx;
  useEffect(() => {
    if (placeholder) {
      setPlaceholder(placeholder);
    }
  }, [placeholder, setPlaceholder]);
  const label = ctx.labelFor(ctx.value);
  return (
    <span
      className={cn(
        label ? "text-foreground" : "text-muted-foreground",
        className
      )}
    >
      {label ?? placeholder ?? "Select"}
    </span>
  );
}

export interface MorphSelectTriggerProps {
  className?: string;
  children: ReactNode;
}

export function MorphSelectTrigger({
  className,
  children,
}: MorphSelectTriggerProps) {
  const ctx = useMorphContext("MorphSelectTrigger");
  return (
    <>
      {/* invisible sizer reserves the closed height (the morph surface is
          absolute, so this keeps surrounding layout from shifting) */}
      <div
        aria-hidden
        inert
        className={cn(ROW, "border-border invisible rounded-xl border")}
      >
        {children}
        <ChevronDown className="size-4" />
      </div>

      <AnimatePresence initial={false} mode="popLayout">
        {ctx.open ? null : (
          <motion.button
            key="trigger"
            layoutId={ctx.layoutId}
            type="button"
            id={ctx.triggerId}
            disabled={ctx.disabled}
            aria-labelledby={ctx.labelId}
            aria-haspopup="listbox"
            aria-expanded={ctx.open}
            aria-controls={ctx.listId}
            onClick={() => ctx.setOpen(true)}
            transition={ctx.reduce ? { duration: 0 } : MORPH}
            style={{ borderRadius: 12 }}
            className={cn(
              ROW,
              "border-border bg-background text-foreground absolute inset-x-0 top-0 z-10 border transition-colors outline-none",
              "focus-visible:ring-foreground/20 hover:border-(--color-border-strong) focus-visible:ring-2",
              "disabled:pointer-events-none disabled:opacity-50",
              className
            )}
          >
            <motion.span layout="position" className="min-w-0 truncate">
              {children}
            </motion.span>
            <motion.span layout="position" className="text-muted-foreground">
              <ChevronDown className="size-4" />
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}

export interface MorphSelectContentProps {
  className?: string;
  children: ReactNode;
}

export function MorphSelectContent({
  className,
  children,
}: MorphSelectContentProps) {
  const ctx = useMorphContext("MorphSelectContent");
  const label = ctx.labelFor(ctx.value);
  return (
    <>
      {/* always-mounted, hidden — keeps item label registrations alive while
          closed so the trigger shows the selected value before first open */}
      <ul hidden aria-hidden="true">
        {children}
      </ul>

      <AnimatePresence initial={false} mode="popLayout">
        {ctx.open ? (
          <motion.div
            key="panel"
            layoutId={ctx.layoutId}
            transition={ctx.reduce ? { duration: 0 } : MORPH}
            style={{ borderRadius: 12 }}
            className={cn(
              "border-border bg-background absolute inset-x-0 top-0 z-30 overflow-hidden border shadow-lg",
              className
            )}
          >
            {/* header mirrors the trigger (continuous morph) and collapses the
                panel back into the trigger when clicked */}
            <motion.button
              type="button"
              layout="position"
              aria-expanded
              aria-haspopup="listbox"
              aria-controls={ctx.listId}
              aria-labelledby={ctx.labelId}
              onClick={() => ctx.setOpen(false)}
              className={cn(ROW, "outline-none")}
            >
              <span
                className={cn(
                  "min-w-0 truncate",
                  label ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {label ?? ctx.placeholder}
              </span>
              <motion.span
                animate={{ rotate: 180 }}
                transition={ctx.reduce ? { duration: 0 } : MORPH}
                className="text-muted-foreground"
              >
                <ChevronDown className="size-4" />
              </motion.span>
            </motion.button>

            <div className="bg-border h-px" />

            <motion.ul
              id={ctx.listId}
              role="listbox"
              aria-labelledby={ctx.labelId}
              initial="hidden"
              animate="show"
              variants={ctx.reduce ? undefined : LIST}
              className="max-h-48 overflow-y-auto p-1"
            >
              {children}
            </motion.ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export interface MorphSelectItemProps {
  value: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function MorphSelectItem({
  value,
  disabled = false,
  className,
  children,
}: MorphSelectItemProps) {
  const ctx = useMorphContext("MorphSelectItem");
  const selected = ctx.value === value;
  const label = typeof children === "string" ? children : value;

  const { register, unregister } = ctx;
  useLayoutEffect(() => {
    register(value, label);
    return () => unregister(value);
  }, [register, unregister, value, label]);

  return (
    <motion.li role="presentation" variants={ctx.reduce ? undefined : ITEM}>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        disabled={disabled}
        onClick={() => ctx.select(value)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors outline-none",
          selected
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted",
          "disabled:pointer-events-none disabled:opacity-50",
          className
        )}
      >
        {children}
        {selected ? <Check className="size-3.5 shrink-0" /> : null}
      </button>
    </motion.li>
  );
}
