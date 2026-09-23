"use client";
// beui.dev/components/motion/cylinder-carousel

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import type {
  AnimationPlaybackControls,
  MotionStyle,
  MotionValue,
} from "motion/react";
import {
  Children,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  Ref,
  WheelEvent as ReactWheelEvent,
} from "react";

import {
  capturePointer,
  releasePointer,
  TOUCH_GESTURE_CLASS,
} from "#/lib/touch.ts";
import { cn } from "#/lib/utils.ts";

// Carousel-specific: a soft spring that receives the release velocity, so a
// flick keeps rolling freely, drifts past the snap point and eases back.
const GLIDE_SPRING = { stiffness: 40, damping: 20, mass: 3 };

// How far a flick keeps rolling: projected items = release velocity * momentum.
const FLICK_MOMENTUM = 0.45;
const MAX_FLICK_ITEMS = 6;

export interface CylinderCarouselProps {
  children: ReactNode;
  /** Max item box size in px (square) at full size, i.e. at the container
   * edge. Balls shrink below this automatically so the row keeps breathing
   * room in narrow containers. */
  itemSize?: number;
  /** How many item slots span the container width. */
  visibleItems?: number;
  /** "concave" (default): inside of the cylinder — center ball smallest and
   * dipped, growing toward the edges. "convex": outside of the cylinder —
   * center ball biggest and raised, shrinking toward the edges. */
  variant?: "concave" | "convex";
  /** Scale of the smallest ball (center for concave, edges for convex);
   * the biggest reaches 1. */
  minScale?: number;
  /** Items rolled per item-width dragged — above 1 the wall outruns the
   * pointer, which reads as a lighter, freer roll. */
  dragSpeed?: number;
  /** Curve depth in px: for concave, how far the edge balls ride above the
   * center one (valley); for convex, how far below (arch). 0 = flat line.
   * Defaults to 35% of the item size. */
  arc?: number;
  /** Snap to the nearest item when the roll settles. */
  snap?: boolean;
  /** Roll on its own until interacted with. */
  autoRotate?: boolean;
  /** Auto-roll speed in items per second. */
  autoRotateSpeed?: number;
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  /** Stage height in px. Defaults to `itemSize`. */
  height?: number;
  ariaLabel?: string;
  className?: string;
  ref?: Ref<CylinderCarouselHandle>;
}

export interface CylinderCarouselHandle {
  scrollTo: (index: number) => void;
}

// The frame edge sits at this wall angle; how far the wall curves in frame.
const THETA_EDGE = (72 * Math.PI) / 180;
// Wall angle past which a ball is parked far off-stage (always hidden there).
const THETA_CLAMP = (95 * Math.PI) / 180;

/**
 * One ball on the inside wall of the cylinder, rendered through a single
 * perspective projection: the ball sits at wall angle θ, the camera slightly
 * above the ball line, so horizontal position, size and height all share one
 * 1/(cosθ + k) depth term. Center = far wall: smallest, highest, moving
 * slowest; edges = nearest: full size, level, moving fastest, sliding off to
 * be clipped. Nothing overlaps, fades or reorders — the edge is the exit.
 */
function CarouselBall({
  scroll,
  index,
  alpha,
  k,
  projection,
  gap,
  edgeOffset,
  minScale,
  convex,
  arc,
  halfWidth,
  itemSize,
  children,
}: {
  scroll: MotionValue<number>;
  index: number;
  /** Wall angle per item step, in radians. */
  alpha: number;
  /** Camera distance term for the horizontal projection. */
  k: number;
  /** Projection strength: maps sinθ/(cosθ+k) to px so θE lands on the edge. */
  projection: number;
  /** Uniform slot width in px — convex spacing. */
  gap: number;
  /** Offset at which a ball's center sits on the container edge. */
  edgeOffset: number;
  minScale: number;
  convex: boolean;
  /** Curve depth in px between the center ball and the edge balls. */
  arc: number;
  halfWidth: number;
  itemSize: number;
  children: ReactNode;
}) {
  // Keep each ball on a fixed slot. Wrapping teleports a neighbor across
  // the stage when another item is centered.
  const offset = useTransform(scroll, (s) => index - s);
  // Concave spacing follows the interior perspective (slow, tight center);
  // convex pairs its big center balls with uniform spacing — the interior
  // projection would collapse them into each other.
  const x = useTransform(offset, (o) => {
    if (convex) {
      return o * gap;
    }
    const th = Math.max(-THETA_CLAMP, Math.min(THETA_CLAMP, o * alpha));
    return (projection * Math.sin(th)) / (Math.cos(th) + k);
  });
  // Linear in wall angle, not in depth (the depth curve is near-flat around
  // the center, which made the middle three read as equal): every step is
  // visibly bigger than the last — growing outward (concave) or inward
  // (convex).
  const scale = useTransform(offset, (o) => {
    const t = Math.min(Math.abs(o) / edgeOffset, THETA_CLAMP / THETA_EDGE);
    return convex ? 1 - (1 - minScale) * t : minScale + (1 - minScale) * t;
  });
  // Parabola centered on the stage — valley for concave (center ball dips
  // arc/2 below the midline, edges rise arc/2 above), arch for convex — and
  // deliberately unclamped: a ball keeps following the same curve as it
  // crosses the edge, so entries never pop.
  const y = useTransform(x, (px) => {
    const t = px / halfWidth;
    const valley = arc * (0.5 - t * t);
    return convex ? -valley : valley;
  });
  // Fully off-stage balls stop painting (matters for canvas/shader children).
  const visibility = useTransform(x, (px) =>
    Math.abs(px) > halfWidth + itemSize ? "hidden" : "visible"
  );

  return (
    <motion.div
      className="absolute top-1/2 left-1/2"
      style={
        {
          x,
          y,
          scale,
          visibility,
          width: itemSize,
          height: itemSize,
          marginLeft: -itemSize / 2,
          marginTop: -itemSize / 2,
          "--item-scale": scale,
        } as MotionStyle & { "--item-scale": MotionValue<number> }
      }
    >
      {children}
    </motion.div>
  );
}

export function CylinderCarousel({
  children,
  itemSize = 200,
  visibleItems = 5,
  variant = "concave",
  minScale = 0.55,
  dragSpeed = 1.5,
  arc: arcProp,
  snap = true,
  autoRotate = false,
  autoRotateSpeed = 0.4,
  defaultIndex = 0,
  onIndexChange,
  height,
  ariaLabel = "Nearby devices",
  className,
  ref,
}: CylinderCarouselProps) {
  const reduce = useReducedMotion() ?? false;
  // Preserve the registry's children API and React's generated slide keys.
  // oxlint-disable-next-line react/no-react-children
  const items = Children.toArray(children);
  const count = items.length;

  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Sized so `visibleItems` balls sit fully in frame and the next one out on
  // each side straddles the container edge, half visible.
  const stageWidth = width || 800;
  const halfWidth = stageWidth / 2;
  const edgeOffset = (visibleItems + 1) / 2;

  // Fit: the resting row's diameters may take at most ~66% of the stage — the
  // rest is air between balls plus the half-visible ball on each edge.
  // `itemSize` only caps the result.
  const convex = variant === "convex";
  let scaleSum = 0;
  for (let i = 0; i < visibleItems; i += 1) {
    const t = Math.abs(i - (visibleItems - 1) / 2) / edgeOffset;
    scaleSum += convex ? 1 - (1 - minScale) * t : minScale + (1 - minScale) * t;
  }
  const size = Math.min(itemSize, (stageWidth * 0.65) / scaleSum);

  const gap = stageWidth / (visibleItems + 1);
  const arc = arcProp ?? size * 0.35;

  // Perspective constants. The ball one slot past the frame edge sits at wall
  // angle THETA_EDGE with its center right on the container edge — scale 1,
  // half of it in view; k falls out of the requested minScale (clamped so the
  // projection stays monotonic up to THETA_CLAMP).
  const alpha = THETA_EDGE / edgeOffset;
  const k = Math.max(0.2, (minScale - Math.cos(THETA_EDGE)) / (1 - minScale));
  const projection =
    (halfWidth * (Math.cos(THETA_EDGE) + k)) / Math.sin(THETA_EDGE);

  // scroll is in item units (continuous); item i sits at x = (i - scroll) * gap.
  // Drags write it 1:1 so the wall sticks to the pointer; releases hand the
  // pointer velocity to a soft spring so the roll glides on and settles free.
  const scroll = useMotionValue(defaultIndex);
  const indexRef = useRef(defaultIndex);
  const [, setActiveIndex] = useState(defaultIndex);
  const glideRef = useRef<AnimationPlaybackControls | null>(null);
  const draggingRef = useRef(false);
  const hoverRef = useRef(false);

  useEffect(() => {
    if (count === 0) {
      return;
    }
    const unsub = scroll.on("change", (v) => {
      const idx = Math.min(count - 1, Math.max(0, Math.round(v)));
      if (idx !== indexRef.current) {
        indexRef.current = idx;
        setActiveIndex(idx);
        onIndexChange?.(idx);
      }
    });
    return unsub;
  }, [scroll, count, onIndexChange]);

  const stopGlide = useCallback(() => {
    glideRef.current?.stop();
    glideRef.current = null;
  }, []);

  useEffect(() => {
    const lastIndex = Math.max(0, count - 1);
    if (scroll.get() > lastIndex) {
      stopGlide();
      scroll.set(lastIndex);
    }
  }, [count, scroll, stopGlide]);

  // Spring toward `to`, carrying `velocity` (items/s) through so motion never
  // steps — the roll leaves the finger at finger speed.
  const glideTo = useCallback(
    (to: number, velocity: number) => {
      stopGlide();
      if (reduce) {
        scroll.set(to);
        return;
      }
      glideRef.current = animate(scroll, to, {
        type: "spring",
        ...GLIDE_SPRING,
        velocity,
        restDelta: 0.001,
        restSpeed: 0.005,
      });
    },
    [scroll, stopGlide, reduce]
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollTo(index: number) {
        if (count === 0) {
          return;
        }
        const next = Math.min(count - 1, Math.max(0, index));
        if (Math.abs(next - scroll.get()) < 0.01) {
          return;
        }
        glideTo(next, scroll.getVelocity());
      },
    }),
    [count, scroll, glideTo]
  );

  const settle = useCallback(
    (velocity: number) => {
      const projected =
        scroll.get() +
        Math.max(
          -MAX_FLICK_ITEMS,
          Math.min(MAX_FLICK_ITEMS, velocity * FLICK_MOMENTUM)
        );
      const snapped = snap ? Math.round(projected) : projected;
      glideTo(Math.min(count - 1, Math.max(0, snapped)), velocity);
    },
    [scroll, snap, glideTo, count]
  );

  const drag = useRef({
    startX: 0,
    startScroll: 0,
    lastX: 0,
    lastT: 0,
    prevX: 0,
    prevT: 0,
  });

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      stopGlide();
      draggingRef.current = true;
      capturePointer(e.currentTarget, e.pointerId);
      const now = performance.now();
      drag.current = {
        startX: e.clientX,
        startScroll: scroll.get(),
        lastX: e.clientX,
        lastT: now,
        prevX: e.clientX,
        prevT: now,
      };
    },
    [scroll, stopGlide]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!draggingRef.current) {
        return;
      }
      const d = drag.current;
      scroll.set(d.startScroll - ((e.clientX - d.startX) * dragSpeed) / gap);
      d.prevX = d.lastX;
      d.prevT = d.lastT;
      d.lastX = e.clientX;
      d.lastT = performance.now();
    },
    [scroll, gap, dragSpeed]
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      releasePointer(e.currentTarget, e.pointerId);
      const d = drag.current;
      const dt = d.lastT - d.prevT;
      const vpx = dt > 0 ? (d.lastX - d.prevX) / dt : 0;
      settle((-vpx * dragSpeed * 1000) / gap);
    },
    [settle, gap, dragSpeed]
  );

  const rollBy = useCallback(
    (dir: number) => {
      glideTo(
        Math.min(count - 1, Math.max(0, Math.round(scroll.get()) + dir)),
        scroll.getVelocity()
      );
    },
    [scroll, glideTo, count]
  );

  const wheelSettleRef = useRef<number | null>(null);
  const onWheel = useCallback(
    (e: ReactWheelEvent) => {
      stopGlide();
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      scroll.set(scroll.get() + delta / gap);
      if (wheelSettleRef.current) {
        window.clearTimeout(wheelSettleRef.current);
      }
      wheelSettleRef.current = window.setTimeout(
        () => settle(scroll.getVelocity()),
        140
      );
    },
    [scroll, gap, settle, stopGlide]
  );

  useEffect(() => {
    if (!autoRotate || reduce || count === 0) {
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!draggingRef.current && !hoverRef.current && !glideRef.current) {
        scroll.set(scroll.get() + autoRotateSpeed * dt);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, autoRotateSpeed, reduce, count, scroll]);

  const stageHeight = height ?? size;

  return (
    // The application role owns arrow-key navigation and pointer gestures.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={stageRef}
      role="application"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard entry point for the carousel.
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          rollBy(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          rollBy(-1);
        }
      }}
      onPointerDownCapture={stopGlide}
      onFocusCapture={stopGlide}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onPointerEnter={() => {
        hoverRef.current = true;
      }}
      onPointerLeave={() => {
        hoverRef.current = false;
      }}
      className={cn(
        // clip-path, not overflow: it also clips the GPU-composited balls
        "relative w-full touch-none outline-none [clip-path:inset(0)]",
        // The stage drives the roll from the press itself, so iOS must not
        // claim the same touch for its callout or a slide drag.
        TOUCH_GESTURE_CLASS,
        "cursor-grab active:cursor-grabbing",
        "focus-visible:ring-foreground/20 focus-visible:ring-2",
        className
      )}
      style={{ height: stageHeight }}
    >
      {items.map((item, i) => (
        <CarouselBall
          // biome-ignore lint/suspicious/noArrayIndexKey: slides are positional and stable
          key={i}
          scroll={scroll}
          index={i}
          alpha={alpha}
          k={k}
          projection={projection}
          gap={gap}
          edgeOffset={edgeOffset}
          minScale={minScale}
          convex={convex}
          arc={arc}
          halfWidth={halfWidth}
          itemSize={size}
        >
          {item}
        </CarouselBall>
      ))}
    </div>
  );
}
