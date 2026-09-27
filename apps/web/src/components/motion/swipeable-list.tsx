"use client";
// beui.dev/components/blocks/swipeable-list

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import type { PanInfo } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import { TOUCH_GESTURE_CONTENT_CLASS } from "#/lib/touch.ts";
import { cn } from "#/lib/utils.ts";

export type SwipeSide = "left" | "right";

export interface SwipeableListValue {
  id: string;
  side: SwipeSide;
}

export type SwipeActionTone =
  | "neutral"
  | "primary"
  | "info"
  | "success"
  | "warning"
  | "danger";

export interface SwipeAction {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  tone?: SwipeActionTone;
  disabled?: boolean;
  closeOnAction?: boolean;
  onClick?: (item: SwipeableListItem) => void;
  renderButton?: (props: {
    actionWidth: number;
    focusable: boolean;
    side: SwipeSide;
    onClick: () => void;
  }) => ReactNode;
}

export interface SwipeableListItem {
  id: string;
  ariaLabel?: string;
  title?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  content?: ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  disabled?: boolean;
}

export interface SwipeableListClassNames {
  root?: string;
  item?: string;
  rail?: string;
  action?: string;
  surface?: string;
  leading?: string;
  content?: string;
  title?: string;
  description?: string;
  meta?: string;
}

export interface SwipeableListProps {
  items: SwipeableListItem[];
  value?: SwipeableListValue | null;
  defaultValue?: SwipeableListValue | null;
  onValueChange?: (value: SwipeableListValue | null) => void;
  onAction?: (payload: {
    item: SwipeableListItem;
    action: SwipeAction;
    side: SwipeSide;
  }) => void;
  actionWidth?: number;
  revealThreshold?: number;
  closeOnAction?: boolean;
  className?: string;
  classNames?: SwipeableListClassNames;
  renderItem?: (item: SwipeableListItem) => ReactNode;
}

// Distance-based release spring keeps short rebounds and full reveals feeling
// equally direct, closer to native mobile list interactions.
const ROW_SETTLE = {
  type: "spring",
  stiffness: 560,
  damping: 48,
  mass: 0.82,
  restDelta: 0.5,
  restSpeed: 8,
} as const;
const OPEN_DISTANCE_RATIO = 0.46;
const CLOSE_DISTANCE_RATIO = 0.72;
const OPEN_VELOCITY = 720;
const CLOSE_VELOCITY = 320;
const FLING_DISTANCE = 14;
const RELEASE_VELOCITY_LIMIT = 1500;

const ACTION_TONE_CLASS: Record<SwipeActionTone, string> = {
  neutral: "text-muted-foreground group-hover:text-foreground",
  primary: "text-foreground",
  info: "text-blue-500 dark:text-blue-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-destructive",
};

function useControllableSwipeValue({
  value,
  defaultValue,
  onValueChange,
}: {
  value?: SwipeableListValue | null;
  defaultValue?: SwipeableListValue | null;
  onValueChange?: (value: SwipeableListValue | null) => void;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? null);
  const isControlled = value !== undefined;
  const currentValue = value ?? internalValue;

  const setValue = useCallback(
    (next: SwipeableListValue | null) => {
      if (!isControlled) {
        setInternalValue(next);
      }

      onValueChange?.(next);
    },
    [isControlled, onValueChange]
  );

  return [currentValue, setValue] as const;
}

function isActionableSide(value: number, sideWidth: number) {
  return sideWidth > 0 && Math.abs(value) > 0;
}

/** Row offset that reveals the actions on `side`, or 0 when closed. */
function swipeOffset(
  side: SwipeSide | null,
  leftWidth: number,
  rightWidth: number
) {
  if (side === "left") {
    return leftWidth;
  }
  if (side === "right") {
    return -rightWidth;
  }
  return 0;
}

function clampReleaseVelocity(velocity: number) {
  return Math.max(
    -RELEASE_VELOCITY_LIMIT,
    Math.min(RELEASE_VELOCITY_LIMIT, velocity)
  );
}

function SwipeActionButton({
  action,
  actionWidth,
  side,
  focusable,
  onAction,
  className,
}: {
  action: SwipeAction;
  actionWidth: number;
  side: SwipeSide;
  focusable: boolean;
  onAction: (action: SwipeAction, side: SwipeSide) => void;
  className?: string;
}) {
  if (action.renderButton) {
    return action.renderButton({
      actionWidth,
      focusable,
      side,
      onClick: () => onAction(action, side),
    });
  }

  return (
    <button
      type="button"
      data-swipe-action={side}
      disabled={action.disabled}
      tabIndex={focusable ? 0 : -1}
      aria-label={typeof action.label === "string" ? action.label : undefined}
      onClick={() => onAction(action, side)}
      className={cn(
        "group flex h-full shrink-0 cursor-pointer items-center justify-center outline-none",
        "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "w-(--action-width)",
        className
      )}
      style={{ "--action-width": `${actionWidth}px` }}
    >
      <span
        className={cn(
          "group-hover:bg-background grid h-9 w-9 place-items-center rounded-full transition-[background-color,color,transform] duration-150 group-active:scale-95",
          ACTION_TONE_CLASS[action.tone ?? "neutral"]
        )}
      >
        {action.icon}
      </span>
      <span className="sr-only">{action.label}</span>
    </button>
  );
}

function SwipeableListRow({
  item,
  actionWidth,
  revealThreshold,
  openValue,
  setOpenValue,
  closeOnAction,
  onAction,
  classNames,
  renderItem,
}: {
  item: SwipeableListItem;
  actionWidth: number;
  revealThreshold: number;
  openValue: SwipeableListValue | null;
  setOpenValue: (value: SwipeableListValue | null) => void;
  closeOnAction: boolean;
  onAction?: SwipeableListProps["onAction"];
  classNames?: SwipeableListClassNames;
  renderItem?: (item: SwipeableListItem) => ReactNode;
}) {
  const reduce = useReducedMotion();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const animationRef = useRef<{ stop: () => void } | null>(null);
  const commandedTargetRef = useRef(0);
  const leftActions = item.leftActions ?? [];
  const rightActions = item.rightActions ?? [];
  const leftWidth = leftActions.length * actionWidth;
  const rightWidth = rightActions.length * actionWidth;
  const openSide = openValue?.id === item.id ? openValue.side : null;
  const actionHintId = useId();
  const targetX = swipeOffset(openSide, leftWidth, rightWidth);

  const settleX = useCallback(
    (nextX: number, velocity = 0) => {
      commandedTargetRef.current = nextX;
      animationRef.current?.stop();

      if (reduce) {
        x.set(nextX);
        return;
      }

      animationRef.current = animate(x, nextX, {
        ...ROW_SETTLE,
        velocity: clampReleaseVelocity(velocity),
        onComplete: () => x.set(nextX),
      });
    },
    [reduce, x]
  );

  useEffect(() => () => animationRef.current?.stop(), []);

  useEffect(() => {
    if (commandedTargetRef.current === targetX) {
      return;
    }

    settleX(targetX);
  }, [settleX, targetX]);

  const getTargetX = useCallback(
    (side: SwipeSide | null) => swipeOffset(side, leftWidth, rightWidth),
    [leftWidth, rightWidth]
  );

  const snapTo = useCallback(
    (side: SwipeSide | null, velocity = 0) => {
      setOpenValue(side ? { id: item.id, side } : null);
      settleX(getTargetX(side), velocity);
    },
    [getTargetX, item.id, setOpenValue, settleX]
  );

  const onDragStart = useCallback(() => {
    animationRef.current?.stop();

    if (openValue && openValue.id !== item.id) {
      setOpenValue(null);
    }
  }, [item.id, openValue, setOpenValue]);

  const onDragEnd = useCallback(
    (_: PointerEvent, info: PanInfo) => {
      const velocity = info.velocity.x;
      const latest = x.get();
      const leftOpenThreshold = Math.max(
        revealThreshold,
        leftWidth * OPEN_DISTANCE_RATIO
      );
      const rightOpenThreshold = Math.max(
        revealThreshold,
        rightWidth * OPEN_DISTANCE_RATIO
      );

      if (openSide === "left") {
        if (
          latest < leftWidth * CLOSE_DISTANCE_RATIO ||
          velocity < -CLOSE_VELOCITY
        ) {
          snapTo(null, velocity);
          return;
        }

        snapTo("left", velocity);
        return;
      }

      if (openSide === "right") {
        if (
          Math.abs(latest) < rightWidth * CLOSE_DISTANCE_RATIO ||
          velocity > CLOSE_VELOCITY
        ) {
          snapTo(null, velocity);
          return;
        }

        snapTo("right", velocity);
        return;
      }

      if (
        isActionableSide(latest, leftWidth) &&
        (latest > leftOpenThreshold ||
          (velocity > OPEN_VELOCITY && latest > FLING_DISTANCE))
      ) {
        snapTo("left", velocity);
        return;
      }

      if (
        isActionableSide(latest, rightWidth) &&
        (latest < -rightOpenThreshold ||
          (velocity < -OPEN_VELOCITY && latest < -FLING_DISTANCE))
      ) {
        snapTo("right", velocity);
        return;
      }

      snapTo(null, velocity);
    },
    [leftWidth, openSide, revealThreshold, rightWidth, snapTo, x]
  );

  const handleAction = useCallback(
    (action: SwipeAction, side: SwipeSide) => {
      action.onClick?.(item);
      onAction?.({ item, action, side });

      if (action.closeOnAction ?? closeOnAction) {
        snapTo(null);
      }
    },
    [closeOnAction, item, onAction, snapTo]
  );

  return (
    <div
      className={cn(
        "bg-muted relative isolate overflow-hidden rounded-2xl",
        item.disabled && "opacity-60",
        classNames?.item
      )}
    >
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape from an action button bubbles here to close the row. */}
      <div
        aria-hidden={!openSide}
        inert={!openSide}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            snapTo(null);
            surfaceRef.current?.focus();
          }
        }}
        className={cn(
          "absolute inset-0 z-0 flex overflow-hidden rounded-2xl",
          classNames?.rail
        )}
      >
        <div className="flex h-full overflow-hidden rounded-l-2xl">
          {leftActions.map((action) => (
            <SwipeActionButton
              key={action.id}
              action={action}
              actionWidth={actionWidth}
              className={classNames?.action}
              focusable={openSide === "left"}
              onAction={handleAction}
              side="left"
            />
          ))}
        </div>
        <div className="ml-auto flex h-full overflow-hidden rounded-r-2xl">
          {rightActions.map((action) => (
            <SwipeActionButton
              key={action.id}
              action={action}
              actionWidth={actionWidth}
              className={classNames?.action}
              focusable={openSide === "right"}
              onAction={handleAction}
              side="right"
            />
          ))}
        </div>
      </div>

      <span id={actionHintId} hidden>
        Press the right or left arrow key to reveal actions.
      </span>
      <motion.div
        ref={surfaceRef}
        data-swipeable-row
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- <fieldset> brings form styling to a draggable row.
        role="group"
        aria-label={item.ariaLabel}
        aria-describedby={leftWidth || rightWidth ? actionHintId : undefined}
        tabIndex={item.disabled || !(leftWidth || rightWidth) ? -1 : 0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) {
            return;
          }
          let side: SwipeSide | null = null;
          if (event.key === "ArrowRight" && leftWidth > 0) {
            side = "left";
          } else if (event.key === "ArrowLeft" && rightWidth > 0) {
            side = "right";
          }
          if (side) {
            event.preventDefault();
            snapTo(side);
            requestAnimationFrame(() => {
              surfaceRef.current?.parentElement
                ?.querySelector<HTMLButtonElement>(
                  `[data-swipe-action="${side}"]`
                )
                ?.focus();
            });
          } else if (event.key === "Escape" && openSide) {
            event.preventDefault();
            event.stopPropagation();
            snapTo(null);
          }
        }}
        drag={item.disabled ? false : "x"}
        dragConstraints={{ left: -rightWidth, right: leftWidth }}
        dragElastic={0.04}
        dragMomentum={false}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        style={{ x }}
        className={cn(
          // `touch-pan-y`, not `touch-none`: the row owns the horizontal
          // swipe, the page keeps the vertical scroll through it.
          "border-border bg-card relative z-10 min-h-[72px] cursor-grab touch-pan-y rounded-2xl border px-4 py-3 shadow-sm active:cursor-grabbing",
          // The swipe is the row's, but what it carries is the consumer's:
          // selection is only suppressed where the platform runs its own press
          // gestures, so a mouse can still select and copy the row's text.
          TOUCH_GESTURE_CONTENT_CLASS,
          classNames?.surface
        )}
      >
        {renderItem
          ? renderItem(item)
          : (item.content ?? (
              <SwipeableRowContent item={item} classNames={classNames} />
            ))}
      </motion.div>
    </div>
  );
}

export function SwipeableList({
  items,
  value,
  defaultValue = null,
  onValueChange,
  onAction,
  actionWidth = 56,
  revealThreshold = 34,
  closeOnAction = true,
  className,
  classNames,
  renderItem,
}: SwipeableListProps) {
  const [openValue, setOpenValue] = useControllableSwipeValue({
    value,
    defaultValue,
    onValueChange,
  });

  return (
    <div
      className={cn("flex w-full flex-col gap-2", className, classNames?.root)}
    >
      {items.map((item) => (
        <SwipeableListRow
          key={item.id}
          item={item}
          actionWidth={actionWidth}
          revealThreshold={revealThreshold}
          openValue={openValue}
          setOpenValue={setOpenValue}
          closeOnAction={closeOnAction}
          onAction={onAction}
          classNames={classNames}
          renderItem={renderItem}
        />
      ))}
    </div>
  );
}

function SwipeableRowContent({
  item,
  classNames,
}: {
  item: SwipeableListItem;
  classNames?: SwipeableListClassNames;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {item.leading ? (
        <div className={cn("shrink-0", classNames?.leading)}>
          {item.leading}
        </div>
      ) : null}
      <div className={cn("min-w-0 flex-1", classNames?.content)}>
        {item.title ? (
          <div
            className={cn(
              "text-foreground truncate text-sm font-medium",
              classNames?.title
            )}
          >
            {item.title}
          </div>
        ) : null}
        {item.description ? (
          <div
            className={cn(
              "text-muted-foreground mt-0.5 truncate text-xs",
              classNames?.description
            )}
          >
            {item.description}
          </div>
        ) : null}
      </div>
      {item.meta ? (
        <div
          className={cn(
            "text-muted-foreground shrink-0 text-xs font-medium",
            classNames?.meta
          )}
        >
          {item.meta}
        </div>
      ) : null}
    </div>
  );
}
