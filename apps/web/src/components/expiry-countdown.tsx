import { useEffect, useState } from "react";

import {
  remainingLabel,
  remainingRatio,
  remainingTone,
  type RemainingLabelOptions,
} from "#/lib/expiry.ts";
import { cn } from "#/lib/utils.ts";

interface ExpiryCountdownProps extends RemainingLabelOptions {
  expiresAt: string;
  createdAt: string;
  className?: string;
}

export function ExpiryCountdown({
  expiresAt,
  createdAt,
  className,
  includeSeconds = false,
  format = "phrase",
}: ExpiryCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      globalThis.clearInterval(timer);
    };
  }, []);

  const label = remainingLabel(expiresAt, now, { includeSeconds, format });
  if (label === "") {
    return null;
  }

  const ratio = remainingRatio(expiresAt, createdAt, now);

  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex items-center gap-1.5 text-xs tabular-nums",
        className
      )}
    >
      {ratio === null ? null : <RemainingCircle ratio={ratio} />}
      <time dateTime={expiresAt}>{label}</time>
    </span>
  );
}

const CIRCLE_SIZE = 14;
const CIRCLE_STROKE = 2;
const CIRCLE_RADIUS = (CIRCLE_SIZE - CIRCLE_STROKE) / 2;
const CIRCLE_LENGTH = 2 * Math.PI * CIRCLE_RADIUS;

const TONE_STROKE = {
  green: "stroke-green-500",
  yellow: "stroke-yellow-500",
  red: "stroke-red-500",
} as const;

function RemainingCircle({ ratio }: { ratio: number }) {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5 shrink-0"
      viewBox={`0 0 ${CIRCLE_SIZE} ${CIRCLE_SIZE}`}
    >
      <circle
        className="stroke-muted-foreground/25"
        cx={CIRCLE_SIZE / 2}
        cy={CIRCLE_SIZE / 2}
        fill="none"
        r={CIRCLE_RADIUS}
        strokeWidth={CIRCLE_STROKE}
      />
      <circle
        className={TONE_STROKE[remainingTone(ratio)]}
        cx={CIRCLE_SIZE / 2}
        cy={CIRCLE_SIZE / 2}
        fill="none"
        r={CIRCLE_RADIUS}
        strokeDasharray={CIRCLE_LENGTH}
        strokeDashoffset={CIRCLE_LENGTH * (1 - ratio)}
        strokeLinecap="round"
        strokeWidth={CIRCLE_STROKE}
        transform={`rotate(-90 ${CIRCLE_SIZE / 2} ${CIRCLE_SIZE / 2})`}
      />
    </svg>
  );
}
