import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "#/components/ui/chart.tsx";
import type { LinkStat } from "#/lib/api.ts";
import { cn } from "#/lib/utils.ts";

const chartConfig = {
  views: {
    label: "Views",
    color: "var(--chart-1)",
  },
  downloads: {
    label: "Downloads",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

const weekday = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
  });

export type ActivityMetric = "views" | "downloads";

const defaultMetrics: ActivityMetric[] = ["views", "downloads"];

interface LinksActivityChartProps {
  stats: LinkStat[];
  metrics?: ActivityMetric[];
  title?: string;
  description?: string;
  framed?: boolean;
}

export function LinksActivityChart({
  stats,
  metrics = defaultMetrics,
  title = "Activity",
  description = "Views and downloads across your live links, last 7 days (UTC).",
  framed = true,
}: LinksActivityChartProps) {
  const showViews = metrics.includes("views");
  const showDownloads = metrics.includes("downloads");
  const showLegend = metrics.length > 1;

  return (
    <section
      className={cn(
        "flex shrink-0 flex-col gap-3",
        framed ? "border-border/70 bg-card/40 rounded-3xl border p-4" : null
      )}
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-sm">{title}</h3>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <ChartContainer className="aspect-auto h-48 w-full" config={chartConfig}>
        <BarChart accessibilityLayer data={stats}>
          <CartesianGrid vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="date"
            tickFormatter={weekday}
            tickLine={false}
            tickMargin={8}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          {showLegend ? <ChartLegend content={<ChartLegendContent />} /> : null}
          {showViews ? (
            <Bar dataKey="views" fill="var(--color-views)" radius={4} />
          ) : null}
          {showDownloads ? (
            <Bar dataKey="downloads" fill="var(--color-downloads)" radius={4} />
          ) : null}
        </BarChart>
      </ChartContainer>
    </section>
  );
}
