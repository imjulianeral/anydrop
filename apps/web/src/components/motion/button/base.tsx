"use client";

import {
  AnimatePresence,
  type HTMLMotionProps,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  forwardRef,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";

import { EASE_OUT, SPRING_PRESS } from "#/lib/ease.ts";
import { useHoverCapable } from "#/lib/hooks/use-hover-capable.ts";
import { cn } from "#/lib/utils.ts";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends Omit<
  HTMLMotionProps<"button">,
  "children"
> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pressScale?: number;
  /** Spawn a Material-style ripple from the press point. On by default. */
  ripple?: boolean;
  children?: ReactNode;
}

export interface ButtonLinkProps extends Omit<
  HTMLMotionProps<"a">,
  "children"
> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pressScale?: number;
  /** Spawn a Material-style ripple from the press point. On by default. */
  ripple?: boolean;
  children?: ReactNode;
}

type Ripple = { id: number; x: number; y: number; size: number };

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border border-border bg-card text-foreground hover:border-border",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-primary/5",
  outline:
    "border border-border bg-transparent text-foreground hover:bg-primary/5",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-full",
  md: "h-10 px-5 text-sm gap-2 rounded-full",
  lg: "h-12 px-6 text-base gap-2 rounded-full",
  icon: "h-8 w-8 rounded-lg",
};

const useRipple = (enabled: boolean) => {
  const reduce = useReducedMotion();
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextId = useRef(0);
  const active = enabled && !reduce;

  const spawn = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!active) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const id = nextId.current++;
      setRipples((prev) => [
        ...prev,
        {
          id,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          size,
        },
      ]);
    },
    [active]
  );

  const layer = active ? (
    <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            animate={{ scale: 1, opacity: 0 }}
            className="absolute rounded-full bg-current"
            exit={{ opacity: 0 }}
            initial={{ scale: 0.05, opacity: 0.3 }}
            style={{
              left: ripple.x,
              top: ripple.y,
              width: ripple.size,
              height: ripple.size,
              x: "-50%",
              y: "-50%",
            }}
            transition={{ duration: 1.6, ease: EASE_OUT }}
            onAnimationComplete={() => {
              setRipples((prev) =>
                prev.filter((item) => item.id !== ripple.id)
              );
            }}
          />
        ))}
      </AnimatePresence>
    </span>
  ) : null;

  return { spawn, layer, clip: active };
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      pressScale = 0.93,
      ripple = true,
      className,
      children,
      onPointerDown,
      ...rest
    },
    ref
  ) {
    const reduce = useReducedMotion();
    const canHover = useHoverCapable();
    const { spawn, layer, clip } = useRipple(ripple);

    return (
      <motion.button
        ref={ref}
        className={cn(
          "inline-flex cursor-pointer items-center justify-center font-medium select-none",
          "transition-colors",
          "disabled:pointer-events-none disabled:opacity-50",
          clip && "relative overflow-hidden",
          VARIANT_CLASS[variant],
          SIZE_CLASS[size],
          className
        )}
        transition={SPRING_PRESS}
        type="button"
        whileHover={reduce || !canHover ? undefined : { scale: 1.02 }}
        whileTap={reduce ? undefined : { scale: pressScale }}
        {...rest}
        onPointerDown={(event) => {
          spawn(event);
          onPointerDown?.(event);
        }}
      >
        {layer}
        {children}
      </motion.button>
    );
  }
);

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  function ButtonLink(
    {
      variant = "primary",
      size = "md",
      pressScale = 0.93,
      ripple = true,
      className,
      children,
      onPointerDown,
      ...rest
    },
    ref
  ) {
    const reduce = useReducedMotion();
    const canHover = useHoverCapable();
    const { spawn, layer, clip } = useRipple(ripple);

    return (
      <motion.a
        ref={ref}
        className={cn(
          "inline-flex cursor-pointer items-center justify-center font-medium select-none",
          "transition-colors",
          clip && "relative overflow-hidden",
          VARIANT_CLASS[variant],
          SIZE_CLASS[size],
          className
        )}
        transition={SPRING_PRESS}
        whileHover={reduce || !canHover ? undefined : { scale: 1.02 }}
        whileTap={reduce ? undefined : { scale: pressScale }}
        {...rest}
        onPointerDown={(event) => {
          spawn(event);
          onPointerDown?.(event);
        }}
      >
        {layer}
        {children}
      </motion.a>
    );
  }
);
