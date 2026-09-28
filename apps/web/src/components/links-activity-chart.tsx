import { BarChart } from "#/components/charts/bar-chart.tsx";
import { BarXAxis } from "#/components/charts/bar-x-axis.tsx";
import { Bar } from "#/components/charts/bar.tsx";
import { Grid } from "#/components/charts/grid.tsx";
import { ChartTooltip } from "#/components/charts/tooltip/index.ts";
import { seriesColors } from "#/components/dashboard/charts.tsx";
import type { LinkStat } from "#/lib/api.ts";
import { weekdayLabel } from "#/lib/link-events.ts";
import { cn } from "#/lib/utils.ts";

export type ActivityMetric = "views" | "downloads";

const defaultMetrics: ActivityMetric[] = ["views", "downloads"];

const metricLabels: Record<ActivityMetric, string> = {
  views: "Views",
  downloads: "Downloads",
};

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
  description = "Views and downloads across your live links, last 7 days.",
  framed = true,
}: LinksActivityChartProps) {
  const data = stats.map((stat) => ({
    name: weekdayLabel(stat.date),
    views: stat.views,
    downloads: stat.downloads,
  }));

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
      <BarChart
        aspectRatio="5 / 2"
        barGap={0.3}
        data={data}
        margin={{ top: 12, right: 8, bottom: 32, left: 8 }}
      >
        <Grid horizontal numTicksRows={3} />
        {metrics.map((metric) => (
          <Bar
            dataKey={metric}
            fill={seriesColors[metric]}
            key={metric}
            lineCap={4}
          />
        ))}
        <BarXAxis showAllLabels />
        <ChartTooltip
          rows={(point) =>
            metrics.map((metric) => ({
              color: seriesColors[metric],
              label: metricLabels[metric],
              value: Number(point[metric] ?? 0),
            }))
          }
          showDatePill={false}
        />
      </BarChart>
    </section>
  );
}
