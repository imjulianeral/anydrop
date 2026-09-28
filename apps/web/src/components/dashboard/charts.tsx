import { Area, AreaChart } from "#/components/charts/area-chart.tsx";
import { BarChart } from "#/components/charts/bar-chart.tsx";
import { BarXAxis } from "#/components/charts/bar-x-axis.tsx";
import { Bar } from "#/components/charts/bar.tsx";
import { Grid } from "#/components/charts/grid.tsx";
import { RingCenter } from "#/components/charts/ring-center.tsx";
import { RingChart } from "#/components/charts/ring-chart.tsx";
import { Ring } from "#/components/charts/ring.tsx";
import { ChartTooltip } from "#/components/charts/tooltip/index.ts";
import { XAxis } from "#/components/charts/x-axis.tsx";
import { kindLabels } from "#/lib/dashboard.ts";
import type {
  weekdayTotals,
  Counts,
  Dashboard,
  DayRange,
  LinkKind,
  SeriesPoint,
} from "#/lib/dashboard.ts";

/** Series colours, from the colorblind-checked sets in styles.css. */
export const seriesColors = {
  views: "var(--series-blue)",
  downloads: "var(--series-orange)",
  created: "var(--series-aqua)",
  members: "var(--series-green)",
} as const;

/** Link kinds get their own hues so the By type ring never reads as a metric. */
export const kindColors: Record<LinkKind, string> = {
  text: "var(--series-violet)",
  file: "var(--series-magenta)",
  url: "var(--series-yellow)",
};

const number = new Intl.NumberFormat();

const rowsFor =
  (keys: { key: string; label: string; color: string }[]) =>
  (point: Record<string, unknown>) =>
    keys.map(({ key, label, color }) => ({
      color,
      label,
      value: number.format(Number(point[key] ?? 0)),
    }));

const activitySeries = [
  { key: "views", label: "Views", color: seriesColors.views },
  { key: "downloads", label: "Downloads", color: seriesColors.downloads },
  { key: "created", label: "Links created", color: seriesColors.created },
];

const activityRows = rowsFor(activitySeries);

/** Names each colour in a chart, so identity never rests on hue alone. */
function SeriesLegend({
  series,
}: {
  series: { key: string; label: string; color: string }[];
}) {
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {series.map(({ key, label, color }) => (
        <li className="flex items-center gap-1.5" key={key}>
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full bg-(--swatch)"
            style={{ "--swatch": color }}
          />
          {label}
        </li>
      ))}
    </ul>
  );
}

export function ActivityChart({
  series,
  loading,
  showCreated,
}: {
  series: SeriesPoint[];
  loading: boolean;
  showCreated: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <SeriesLegend
        series={showCreated ? activitySeries : activitySeries.slice(0, 2)}
      />
      <AreaChart
        aspectRatio="5 / 2"
        data={series as unknown as Record<string, unknown>[]}
        margin={{ top: 16, right: 12, bottom: 32, left: 12 }}
        status={loading ? "loading" : "ready"}
        xDataKey="date"
      >
        <Grid horizontal numTicksRows={4} />
        <Area
          dataKey="views"
          fill={seriesColors.views}
          fillOpacity={0.25}
          stroke={seriesColors.views}
        />
        <Area
          dataKey="downloads"
          fill={seriesColors.downloads}
          fillOpacity={0.2}
          stroke={seriesColors.downloads}
        />
        {showCreated ? (
          <Area
            dataKey="created"
            fill={seriesColors.created}
            fillOpacity={0}
            stroke={seriesColors.created}
            strokeWidth={1.5}
          />
        ) : null}
        <XAxis numTicks={6} />
        <ChartTooltip rows={activityRows} />
      </AreaChart>
    </div>
  );
}

const weekdaySeries = activitySeries.slice(0, 2);

const weekdayRows = rowsFor(weekdaySeries);

export function WeekdayChart({
  data,
  loading,
}: {
  data: ReturnType<typeof weekdayTotals>;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <SeriesLegend series={weekdaySeries} />
      <BarChart
        aspectRatio="2 / 1"
        barGap={0.3}
        data={data}
        margin={{ top: 16, right: 8, bottom: 32, left: 8 }}
        status={loading ? "loading" : "ready"}
      >
        <Grid horizontal numTicksRows={3} />
        <Bar dataKey="views" fill={seriesColors.views} lineCap={4} />
        <Bar dataKey="downloads" fill={seriesColors.downloads} lineCap={4} />
        <BarXAxis showAllLabels />
        <ChartTooltip rows={weekdayRows} showDatePill={false} />
      </BarChart>
    </div>
  );
}

/** Nearby's own pair; the Sent and Received figures above the bars name them. */
export const nearbyColors = {
  sent: seriesColors.views,
  received: seriesColors.downloads,
} as const;

const nearbyRows = rowsFor([
  { key: "sent", label: "Sent", color: nearbyColors.sent },
  { key: "received", label: "Received", color: nearbyColors.received },
]);

const shortDay = new Intl.DateTimeFormat(undefined, {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

/** Nearby sends per day, or per week once the range has too many days for bars. */
export const nearbyBars = (
  daily: Dashboard["nearby"]["daily"],
  days: string[]
) => {
  const byDay = new Map(daily.map((row) => [row.day, row]));
  const size = days.length > 31 ? 7 : 1;
  const bars: { name: string; sent: number; received: number }[] = [];
  for (let index = 0; index < days.length; index += size) {
    const chunk = days.slice(index, index + size);
    bars.push({
      name: shortDay.format(new Date(`${chunk[0]}T00:00:00Z`)),
      sent: chunk.reduce((sum, day) => sum + (byDay.get(day)?.sent ?? 0), 0),
      received: chunk.reduce(
        (sum, day) => sum + (byDay.get(day)?.received ?? 0),
        0
      ),
    });
  }
  return bars;
};

export function NearbyChart({
  bars,
  loading,
}: {
  bars: ReturnType<typeof nearbyBars>;
  loading: boolean;
}) {
  return (
    <BarChart
      aspectRatio="5 / 2"
      barGap={0.25}
      data={bars}
      margin={{ top: 16, right: 8, bottom: 32, left: 8 }}
      status={loading ? "loading" : "ready"}
    >
      <Grid horizontal numTicksRows={3} />
      <Bar dataKey="sent" fill={nearbyColors.sent} lineCap={3} />
      <Bar dataKey="received" fill={nearbyColors.received} lineCap={3} />
      <BarXAxis maxLabels={6} />
      <ChartTooltip rows={nearbyRows} showDatePill={false} />
    </BarChart>
  );
}

const kindOrder: LinkKind[] = ["text", "file", "url"];

/** Links created per type; hovering a ring shows its count in the middle. */
export function KindRing({
  byKind,
  metric,
  onSelect,
}: {
  byKind: Record<LinkKind, Counts>;
  metric: keyof Counts;
  onSelect: (kind: LinkKind) => void;
}) {
  const max = Math.max(1, ...kindOrder.map((kind) => byKind[kind][metric]));
  const data = kindOrder.map((kind) => ({
    label: kindLabels[kind],
    value: byKind[kind][metric],
    maxValue: max,
    color: kindColors[kind],
  }));
  return (
    <div className="flex flex-col items-center gap-4">
      <RingChart
        baseInnerRadius={52}
        className="aspect-square w-full max-w-56"
        data={data}
        ringGap={6}
        strokeWidth={12}
      >
        {data.map((ring, index) => (
          <Ring color={ring.color} index={index} key={ring.label} />
        ))}
        <RingCenter defaultLabel="Total" />
      </RingChart>
      <ul className="flex w-full flex-col gap-1">
        {kindOrder.map((kind, index) => (
          <li key={kind}>
            <button
              className="hover:bg-muted/60 focus-visible:ring-ring/50 flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none"
              type="button"
              onClick={() => onSelect(kind)}
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full bg-(--swatch)"
                style={{ "--swatch": data[index].color }}
              />
              <span className="flex-1">{kindLabels[kind]}</span>
              <span className="text-muted-foreground tabular-nums">
                {number.format(data[index].value)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const growthRows = rowsFor([
  { key: "members", label: "Members", color: seriesColors.members },
]);

/** Team size over time: a step each day someone joined, held until the next. */
export const growthSeries = (
  growth: { day: string; members: number }[],
  range: DayRange
) => {
  const byDay = new Map(growth.map((point) => [point.day, point.members]));
  let members = 0;
  for (const point of growth) {
    if (point.day < range.start) {
      ({ members } = point);
    }
  }
  const points: { date: Date; members: number }[] = [];
  for (
    let day = new Date(`${range.start}T12:00:00Z`);
    day.toISOString().slice(0, 10) <= range.end;
    day = new Date(day.getTime() + 86_400_000)
  ) {
    members = byDay.get(day.toISOString().slice(0, 10)) ?? members;
    points.push({ date: day, members });
  }
  return points;
};

export function TeamGrowthChart({
  points,
}: {
  points: ReturnType<typeof growthSeries>;
}) {
  return (
    <AreaChart
      aspectRatio="4 / 1"
      data={points}
      margin={{ top: 12, right: 8, bottom: 28, left: 8 }}
      xDataKey="date"
    >
      <Grid horizontal numTicksRows={3} />
      <Area
        dataKey="members"
        fill={seriesColors.members}
        fillOpacity={0.2}
        stroke={seriesColors.members}
      />
      <XAxis numTicks={4} />
      <ChartTooltip rows={growthRows} />
    </AreaChart>
  );
}
