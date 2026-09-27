"use client";
// beui.dev/components/motion/input

import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
} from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "#/lib/utils.ts";

export interface InputClassNames {
  root?: string;
  label?: string;
  field?: string;
  input?: string;
  leftIcon?: string;
  rightIcon?: string;
  successIcon?: string;
  errorMessage?: string;
}

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange"
> {
  label?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Truthy error triggers a shake, red border and (if a string) a message. */
  error?: string | boolean;
  /** Reserve one message line so validation does not shift nearby content. */
  reserveErrorLine?: boolean;
  success?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  classNames?: InputClassNames;
}

export function Input({
  label,
  value: valueProp,
  defaultValue,
  onChange,
  onFocus,
  onBlur,
  error,
  reserveErrorLine = false,
  success,
  leftIcon,
  rightIcon,
  className,
  classNames,
  disabled,
  id: idProp,
  type,
  ref,
  ...rest
}: InputProps & { ref?: Ref<HTMLInputElement> }) {
  const slots: InputClassNames = classNames ?? {};
  const reactId = useId();
  const id = idProp ?? reactId;
  const reduce = useReducedMotion();

  const [value, handleChange] = useInputValue(
    valueProp,
    defaultValue,
    onChange
  );

  const [focused, setFocused] = useState(false);

  const fieldRef = useRef<HTMLDivElement>(null);

  const hasError = Boolean(error);
  const errorMessage = typeof error === "string" ? error : null;

  // Right edge shows the success check, otherwise the caller's right icon.
  const rightSlot = success ? null : rightIcon;

  // Shake the field when an error appears.
  useEffect(() => {
    if (!fieldRef.current || reduce || !hasError) {
      return;
    }
    animate(
      fieldRef.current,
      { x: [0, -6, 6, -4, 4, -2, 0] },
      { duration: 0.45 }
    );
  }, [hasError, reduce]);

  return (
    <div className={cn("flex flex-col gap-1.5", className, slots.root)}>
      {label ? (
        <label
          htmlFor={id}
          className={cn(
            "text-foreground px-1 text-sm font-medium",
            slots.label
          )}
        >
          {label}
        </label>
      ) : null}

      <div
        ref={fieldRef}
        data-state={fieldState(hasError, success, focused)}
        className={fieldClass({ focused, hasError, disabled }, slots.field)}
      >
        {leftIcon ? (
          <span
            className={cn(
              "text-muted-foreground pointer-events-none absolute top-1/2 left-3 flex -translate-y-1/2 items-center [&_svg]:h-4 [&_svg]:w-4",
              slots.leftIcon
            )}
          >
            {leftIcon}
          </span>
        ) : null}

        <input
          ref={ref}
          id={id}
          type={type}
          value={value}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={errorMessage ? `${id}-error` : undefined}
          {...rest}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          className={inputClass(
            {
              leftPadded: Boolean(leftIcon),
              rightPadded: Boolean(rightSlot || success),
              disabled,
            },
            slots.input
          )}
        />

        {success ? (
          <SuccessCheck
            reduce={Boolean(reduce)}
            className={slots.successIcon}
          />
        ) : null}
        {!success && rightSlot ? (
          <span
            className={cn(
              "text-muted-foreground absolute top-0 right-0 flex h-full items-center [&_button]:grid [&_button]:size-11 [&_button]:place-items-center [&_svg]:h-4 [&_svg]:w-4",
              slots.rightIcon
            )}
          >
            {rightSlot}
          </span>
        ) : null}
      </div>

      <div className={reserveErrorLine ? "min-h-4" : "contents"}>
        <AnimatePresence initial={false}>
          {errorMessage ? (
            <InputError
              id={`${id}-error`}
              message={errorMessage}
              reduce={Boolean(reduce)}
              className={slots.errorMessage}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function fieldState(hasError: boolean, success: unknown, focused: boolean) {
  if (hasError) {
    return "error";
  }
  if (success) {
    return "success";
  }
  return focused ? "focused" : "idle";
}

/** The input's value, whether the caller controls it or not. */
function useInputValue(
  value: string | undefined,
  defaultValue: string | undefined,
  onChange: ((value: string) => void) | undefined
) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const controlled = value !== undefined;
  const handleChange = (next: string) => {
    if (!controlled) {
      setInternal(next);
    }
    onChange?.(next);
  };
  return [controlled ? value : internal, handleChange] as const;
}

function SuccessCheck({
  reduce,
  className,
}: {
  reduce: boolean;
  className?: string;
}) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn(
        "text-success absolute top-1/2 right-3.5 h-5 w-5 -translate-y-1/2",
        className
      )}
    >
      <motion.path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      />
    </motion.svg>
  );
}

function InputError({
  id,
  message,
  reduce,
  className,
}: {
  id: string;
  message: string;
  reduce: boolean;
  className?: string;
}) {
  const hidden = reduce
    ? { opacity: 0 }
    : { opacity: 0, y: -4, filter: "blur(4px)" };
  return (
    <motion.p
      id={id}
      role="alert"
      initial={hidden}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={hidden}
      transition={{ duration: 0.2 }}
      className={cn("text-destructive px-1 text-xs", className)}
    >
      {message}
    </motion.p>
  );
}

function fieldClass(
  state: { focused: boolean; hasError: boolean; disabled?: boolean },
  className?: string
) {
  return cn(
    "relative h-11 overflow-hidden rounded-full border transition-colors duration-200",
    "border-border",
    state.focused &&
      !state.hasError &&
      "border-foreground/40 ring-ring/40 ring-2",
    state.hasError && "border-destructive ring-destructive/25 ring-2",
    state.disabled && "opacity-60",
    className
  );
}

function inputClass(
  layout: { leftPadded: boolean; rightPadded: boolean; disabled?: boolean },
  className?: string
) {
  return cn(
    "peer text-foreground caret-foreground h-full w-full bg-transparent text-base leading-6 outline-none",
    "placeholder:text-muted-foreground/60",
    layout.leftPadded ? "pl-10" : "pl-3.5",
    layout.rightPadded ? "pr-10" : "pr-3.5",
    layout.disabled && "cursor-not-allowed",
    className
  );
}
