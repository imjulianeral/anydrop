import NumberFlow from "@number-flow/react";
import type { ReactNode } from "react";

import { ArrowUp } from "#/components/rune-icons.tsx";
import type { RuneIcon } from "#/components/rune-icons.tsx";
import type { Trend } from "#/lib/dashboard.ts";
import { cn } from "#/lib/utils.ts";

/** The dashboard's framed surface, with an optional title row. */
export function Panel({
  title,
  description,
  action,
  className,
  children,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "border-border/70 bg-card/40 flex min-w-0 flex-col gap-4 rounded-3xl border p-4 sm:p-5",
        className
      )}
    >
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="font-heading text-sm">{title}</h3>
            {description ? (
              <p className="text-muted-foreground text-xs">{description}</p>
            ) : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

function TrendBadge({ trend }: { trend: Trend }) {
  if (trend.direction === "flat") {
    return <span className="text-muted-foreground text-xs">No change</span>;
  }
  const label =
    trend.percent === null ? "New" : `${trend.percent.toLocaleString()}%`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums",
        trend.direction === "up"
          ? "bg-foreground/[0.08] text-foreground"
          : "bg-destructive/10 text-destructive"
      )}
    >
      <ArrowUp
        aria-hidden="true"
        className={cn("size-3", trend.direction === "down" && "rotate-180")}
      />
      {label}
      <span className="sr-only">
        {trend.direction === "up" ? " more" : " fewer"} than the period before
      </span>
    </span>
  );
}

/** One headline number with its change against the period before. */
export function StatCard({
  label,
  value,
  suffix,
  icon: Icon,
  trend,
  hint,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  icon: RuneIcon;
  trend?: Trend | null;
  hint?: string;
}) {
  return (
    <div className="border-border/70 bg-card/40 flex min-w-0 flex-col gap-3 rounded-3xl border p-4">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Icon aria-hidden="true" className="size-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="font-heading text-2xl tabular-nums sm:text-3xl">
          {value === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <NumberFlow suffix={suffix} value={value} />
          )}
        </p>
        {trend ? <TrendBadge trend={trend} /> : null}
      </div>
      {hint ? (
        <p className="text-muted-foreground truncate text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

/** A small labelled figure inside a panel. */
export function Figure({
  label,
  value,
  children,
}: {
  label: string;
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="bg-foreground/[0.03] flex min-w-0 flex-col gap-1 rounded-2xl p-3">
      <span className="text-muted-foreground truncate text-xs">{label}</span>
      <span className="font-heading text-lg tabular-nums">{value}</span>
      {children}
    </div>
  );
}
