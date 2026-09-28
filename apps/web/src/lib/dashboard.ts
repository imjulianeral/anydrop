import type { SavedDevice } from "#/lib/account-devices.ts";
import type { ShortLink } from "#/lib/api.ts";
import { authRequest } from "#/lib/auth.ts";
import { applyShortLinkEventToLink, shiftDateKey } from "#/lib/link-events.ts";
import type { ShortLinkEvent } from "#/lib/link-events.ts";

export type LinkKind = ShortLink["kind"];
export type KindFilter = LinkKind | "all";
export type DashboardScope = "device" | "account" | "team";
export type DashboardRange = 7 | 30 | 90 | 365;
export type HeatMetric = "views" | "downloads" | "both";

export const dashboardRanges: DashboardRange[] = [7, 30, 90, 365];

export interface Counts {
  created: number;
  views: number;
  downloads: number;
}

/** One day's counts for one link kind. Days with no activity are omitted. */
export interface DailyCounts extends Counts {
  day: string;
  kind: LinkKind;
}

export interface YearDay {
  day: string;
  views: number;
  downloads: number;
}

export interface TeamSummary {
  name: string;
  role: "owner" | "member";
  members: number;
  pending_invitations: number;
  accepted_invitations: number;
  devices: number;
  online_devices: number;
  growth: { day: string; members: number }[];
}

export interface Dashboard {
  scope: DashboardScope;
  days: DashboardRange;
  /** First and last UTC day of the range, `YYYY-MM-DD`. */
  start: string;
  end: string;
  daily: DailyCounts[];
  /** The last 53 weeks, for the heat calendar. */
  year: YearDay[];
  totals: Counts & { by_kind: Record<LinkKind, Counts> };
  /** The same totals for the period just before, for trend arrows. */
  previous: Counts & { by_kind: Record<LinkKind, Counts> };
  nearby: {
    sent: number;
    received: number;
    bytes_sent: number;
    bytes_received: number;
    daily: { day: string; sent: number; received: number }[];
  };
  devices: { saved: number; online: number; list: SavedDevice[] } | null;
  team: TeamSummary | null;
  links: ShortLink[];
}

export const getDashboard = (
  deviceToken: string,
  days: DashboardRange,
  scope: "me" | "team"
) =>
  authRequest<Dashboard>(
    `dashboard?days=${days}&scope=${scope}`,
    undefined,
    undefined,
    "GET",
    { "X-Device-Token": deviceToken }
  );

export const kindLabels: Record<LinkKind, string> = {
  text: "Message",
  file: "File",
  url: "URL",
};

export const emptyCounts = (): Counts => ({
  created: 0,
  views: 0,
  downloads: 0,
});

export const addCounts = (total: Counts, row: Counts): Counts => ({
  created: total.created + row.created,
  views: total.views + row.views,
  downloads: total.downloads + row.downloads,
});

export const filterByKind = <T extends { kind: LinkKind }>(
  rows: T[],
  kind: KindFilter
): T[] => (kind === "all" ? rows : rows.filter((row) => row.kind === kind));

export interface DayRange {
  start: string;
  end: string;
}

export const inRange = (day: string, range: DayRange) =>
  day >= range.start && day <= range.end;

export const daysBetween = (range: DayRange): string[] => {
  const days: string[] = [];
  for (let day = range.start; day <= range.end; day = shiftDateKey(day, 1)) {
    days.push(day);
  }
  return days;
};

export interface SeriesPoint extends Counts {
  day: string;
  date: Date;
}

/** Every day of the range, summing kinds, with empty days as zeros. */
export const seriesForRange = (
  rows: DailyCounts[],
  range: DayRange
): SeriesPoint[] => {
  const byDay = new Map<string, Counts>();
  for (const row of rows) {
    byDay.set(row.day, addCounts(byDay.get(row.day) ?? emptyCounts(), row));
  }
  return daysBetween(range).map((day) => ({
    day,
    // Noon UTC stays on the same calendar day in every viewer's time zone,
    // since the chart axis formats dates locally.
    date: new Date(`${day}T12:00:00Z`),
    ...(byDay.get(day) ?? emptyCounts()),
  }));
};

export const sumCounts = (rows: Counts[]): Counts => {
  let total = emptyCounts();
  for (const row of rows) {
    total = addCounts(total, row);
  }
  return total;
};

export const HEAT_WEEKS = 53;

const DAY_MS = 86_400_000;

const utcDay = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** Monday on or before the day, matching the heat calendar's columns. */
const mondayOf = (day: string) => {
  const weekday = (new Date(utcDay(day)).getUTCDay() + 6) % 7;
  return shiftDateKey(day, -weekday);
};

const firstHeatDay = (end: string, weeks: number) =>
  shiftDateKey(mondayOf(end), -(weeks - 1) * 7);

const heatCount = (row: YearDay, metric: HeatMetric) => {
  if (metric === "views") {
    return row.views;
  }
  if (metric === "downloads") {
    return row.downloads;
  }
  return row.views + row.downloads;
};

/**
 * The heat calendar's `values[week][day]` (Monday first) as fractions of the
 * busiest day, which becomes `maxCount` so every cell reads its exact count.
 */
export const toHeatValues = (
  year: YearDay[],
  end: string,
  metric: HeatMetric,
  weeks = HEAT_WEEKS
): { values: number[][]; maxCount: number; total: number } => {
  const first = utcDay(firstHeatDay(end, weeks));
  const counts = Array.from({ length: weeks }, () =>
    Array.from({ length: 7 }, () => 0)
  );
  let total = 0;
  for (const row of year) {
    const index = Math.round((utcDay(row.day) - first) / DAY_MS);
    if (index < 0 || index >= weeks * 7 || row.day > end) {
      continue;
    }
    const count = heatCount(row, metric);
    counts[Math.floor(index / 7)][index % 7] += count;
    total += count;
  }
  const maxCount = Math.max(1, ...counts.flat());
  return {
    values: counts.map((week) => week.map((count) => count / maxCount)),
    maxCount,
    total,
  };
};

export interface HeatCell {
  w: number;
  d: number;
}

/** A heat calendar selection as days, so it survives a change in visible weeks. */
export interface DaySelection {
  start: string;
  end?: string;
}

export const cellToDay = (cell: HeatCell, end: string, weeks = HEAT_WEEKS) =>
  shiftDateKey(firstHeatDay(end, weeks), cell.w * 7 + cell.d);

/** The cell showing a day, or null when the day is outside the visible weeks. */
export const dayToCell = (
  day: string,
  end: string,
  weeks = HEAT_WEEKS
): HeatCell | null => {
  const index = Math.round(
    (utcDay(day) - utcDay(firstHeatDay(end, weeks))) / DAY_MS
  );
  if (index < 0 || index >= weeks * 7 || day > end) {
    return null;
  }
  return { w: Math.floor(index / 7), d: index % 7 };
};

/** The days a selection covers, earliest first. */
export const selectionRange = (selection: DaySelection): DayRange => {
  const to = selection.end ?? selection.start;
  return selection.start <= to
    ? { start: selection.start, end: to }
    : { start: to, end: selection.start };
};

export interface Trend {
  direction: "up" | "down" | "flat";
  /** Whole-percent change, or null when there was nothing to compare with. */
  percent: number | null;
}

export const trend = (current: number, previous: number): Trend => {
  if (current === previous) {
    return { direction: "flat", percent: previous === 0 ? null : 0 };
  }
  const direction = current > previous ? "up" : "down";
  if (previous === 0) {
    return { direction, percent: null };
  }
  return {
    direction,
    percent: Math.round((Math.abs(current - previous) / previous) * 100),
  };
};

/** Downloads per view on file links, as a whole percent. */
export const downloadRate = (counts: Counts): number | null =>
  counts.views === 0
    ? null
    : Math.min(100, Math.round((counts.downloads / counts.views) * 100));

export const linkDay = (link: ShortLink) => link.created_at.slice(0, 10);

export const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const bump = <T extends { views: number; downloads: number }>(
  counts: T,
  metric: "views" | "downloads"
): T => ({ ...counts, [metric]: counts[metric] + 1 });

/**
 * Folds a live view or download into the loaded numbers, so the dashboard
 * ticks up without a refetch. Returns null when the link isn't in scope.
 */
export const applyLiveEvent = (
  dashboard: Dashboard,
  event: ShortLinkEvent
): Dashboard | null => {
  const link = dashboard.links.find((item) => item.code === event.code);
  if (!link) {
    return null;
  }
  const metric = event.kind === "view" ? "views" : "downloads";
  const day = event.occurredAt.slice(0, 10);
  const links = dashboard.links.map((item) =>
    applyShortLinkEventToLink(item, event)
  );
  if (!inRange(day, dashboard)) {
    return { ...dashboard, links };
  }
  const hasDaily = dashboard.daily.some(
    (row) => row.day === day && row.kind === link.kind
  );
  const daily = hasDaily
    ? dashboard.daily.map((row) =>
        row.day === day && row.kind === link.kind ? bump(row, metric) : row
      )
    : [
        ...dashboard.daily,
        bump({ day, kind: link.kind, ...emptyCounts() }, metric),
      ];
  const hasYear = dashboard.year.some((row) => row.day === day);
  const year = hasYear
    ? dashboard.year.map((row) => (row.day === day ? bump(row, metric) : row))
    : [...dashboard.year, bump({ day, views: 0, downloads: 0 }, metric)];
  return {
    ...dashboard,
    links,
    daily,
    year,
    totals: {
      ...bump(dashboard.totals, metric),
      by_kind: {
        ...dashboard.totals.by_kind,
        [link.kind]: bump(dashboard.totals.by_kind[link.kind], metric),
      },
    },
  };
};

/** Views and downloads by weekday, Monday first. */
export const weekdayTotals = (rows: DailyCounts[]) => {
  const totals = weekdayNames.map((name) => ({ name, views: 0, downloads: 0 }));
  for (const row of rows) {
    const index = (new Date(utcDay(row.day)).getUTCDay() + 6) % 7;
    totals[index].views += row.views;
    totals[index].downloads += row.downloads;
  }
  return totals;
};

export const countsByKind = (
  rows: DailyCounts[]
): Record<LinkKind, Counts> => ({
  text: sumCounts(filterByKind(rows, "text")),
  file: sumCounts(filterByKind(rows, "file")),
  url: sumCounts(filterByKind(rows, "url")),
});

const previousFor = (data: Dashboard, kind: KindFilter): Counts =>
  kind === "all" ? data.previous : data.previous.by_kind[kind];

/** Everything the dashboard shows, narrowed to the type filter and selected days. */
export const deriveView = (
  data: Dashboard,
  kind: KindFilter,
  selectedRange: DayRange | null
) => {
  const focus = selectedRange ?? { start: data.start, end: data.end };
  const daily = data.daily.filter((row) => inRange(row.day, focus));
  const kindDaily = filterByKind(daily, kind);
  const nearbyDaily = data.nearby.daily.filter((row) =>
    inRange(row.day, focus)
  );
  let nearbySent = 0;
  let nearbyReceived = 0;
  for (const row of nearbyDaily) {
    nearbySent += row.sent;
    nearbyReceived += row.received;
  }
  return {
    focus,
    daily,
    kindDaily,
    current: sumCounts(kindDaily),
    // Trends compare whole periods, so they hide while days are selected.
    previous: selectedRange ? null : previousFor(data, kind),
    fileRate:
      kind === "all" || kind === "file"
        ? downloadRate(sumCounts(filterByKind(daily, "file")))
        : null,
    links: filterByKind(data.links, kind).filter(
      (link) => !selectedRange || inRange(linkDay(link), selectedRange)
    ),
    nearbyDaily,
    nearbySent,
    nearbyReceived,
    empty:
      data.year.length === 0 &&
      data.links.length === 0 &&
      data.totals.created === 0,
  };
};
