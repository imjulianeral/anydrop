import { useEffect, useState } from "react";

import { remainingLabel, type RemainingLabelOptions } from "#/lib/expiry.ts";
import { cn } from "#/lib/utils.ts";

interface ExpiryCountdownProps extends RemainingLabelOptions {
  expiresAt: string;
  className?: string;
}

export function ExpiryCountdown({
  expiresAt,
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

  return (
    <time
      className={cn("text-muted-foreground text-xs tabular-nums", className)}
      dateTime={expiresAt}
    >
      {label}
    </time>
  );
}
