import { useLayoutEffect, useRef, useState } from "react";

import { HeatCalendar } from "#/components/charts/heat-calendar.tsx";
import type { HeatCalendarSelection } from "#/components/charts/heat-calendar.tsx";
import { Panel } from "#/components/dashboard/cards.tsx";
import { Tabs, TabsList, TabsTrigger } from "#/components/motion/tabs.tsx";
import {
  HEAT_WEEKS,
  cellToDay,
  dayToCell,
  toHeatValues,
} from "#/lib/dashboard.ts";
import type {
  DayRange,
  DaySelection,
  HeatMetric,
  YearDay,
} from "#/lib/dashboard.ts";

// One week column is a 16px cell plus a 4px gap.
const WEEK_PX = 20;
const MIN_WEEKS = 8;

/** As many weeks as fit at full cell size, so phones show recent months. */
function useFittingWeeks() {
  const ref = useRef<HTMLDivElement>(null);
  const [weeks, setWeeks] = useState(HEAT_WEEKS);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? node.clientWidth;
      setWeeks(
        Math.max(MIN_WEEKS, Math.min(HEAT_WEEKS, Math.floor(width / WEEK_PX)))
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, weeks };
}

const toCells = (
  selection: DaySelection | null,
  end: string,
  weeks: number
): HeatCalendarSelection | null => {
  const start = selection ? dayToCell(selection.start, end, weeks) : null;
  if (!selection || !start) {
    return null;
  }
  if (!selection.end) {
    return { start };
  }
  const last = dayToCell(selection.end, end, weeks);
  return last ? { start, end: last } : { start };
};

const metricUnits: Record<HeatMetric, string> = {
  views: "views",
  downloads: "downloads",
  both: "opens",
};

const rangeLabel = new Intl.DateTimeFormat(undefined, {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

const formatDay = (day: string) =>
  rangeLabel.format(new Date(`${day}T00:00:00Z`));

/**
 * A year of activity, one cell per day. Clicking a day and then another
 * narrows the rest of the dashboard to that span.
 */
export function YearHeat({
  year,
  end,
  metric,
  onMetricChange,
  selection,
  selectedRange,
  onSelectionChange,
}: {
  year: YearDay[];
  end: string;
  metric: HeatMetric;
  onMetricChange: (metric: HeatMetric) => void;
  selection: DaySelection | null;
  selectedRange: DayRange | null;
  onSelectionChange: (selection: DaySelection | null) => void;
}) {
  const { ref, weeks } = useFittingWeeks();
  const { values, maxCount, total } = toHeatValues(year, end, metric, weeks);
  const period = weeks === HEAT_WEEKS ? "year" : `${weeks} weeks`;
  let description = `${total.toLocaleString()} ${metricUnits[metric]} in the last ${period}. Click two days to focus on the days between them.`;
  if (selectedRange) {
    description =
      selectedRange.start === selectedRange.end
        ? `Showing ${formatDay(selectedRange.start)}.`
        : `Showing ${formatDay(selectedRange.start)} – ${formatDay(selectedRange.end)}.`;
  }

  return (
    <Panel
      title="Year in sharing"
      description={description}
      action={
        <div className="flex items-center gap-2">
          {selection ? (
            <button
              className="text-muted-foreground hover:text-foreground cursor-pointer text-xs underline underline-offset-2"
              type="button"
              onClick={() => onSelectionChange(null)}
            >
              Clear selection
            </button>
          ) : null}
          <Tabs
            value={metric}
            variant="segment"
            onValueChange={(next) => onMetricChange(next as HeatMetric)}
          >
            <TabsList>
              <TabsTrigger value="both">All</TabsTrigger>
              <TabsTrigger value="views">Views</TabsTrigger>
              <TabsTrigger value="downloads">Downloads</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      }
    >
      <div className="-mx-1 overflow-x-auto px-1 pb-1" ref={ref}>
        <HeatCalendar
          className="mx-auto"
          color="var(--foreground)"
          endDate={new Date(`${end}T00:00:00Z`)}
          maxCount={maxCount}
          selection={toCells(selection, end, weeks)}
          unit={metricUnits[metric]}
          values={values}
          weeks={weeks}
          onSelectionChange={(next) =>
            onSelectionChange(
              next && {
                start: cellToDay(next.start, end, weeks),
                end: next.end && cellToDay(next.end, end, weeks),
              }
            )
          }
        />
      </div>
    </Panel>
  );
}
