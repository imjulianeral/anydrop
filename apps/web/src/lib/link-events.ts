import type { LinkEventOccurrence, LinkStat, ShortLink } from "#/lib/api.ts";

export interface ShortLinkEvent {
  code: string;
  kind: "view" | "download";
  viewCount: number;
  downloadCount: number;
  occurredAt: string;
}

export interface LocalStatsOptions {
  days?: number;
  now?: Date;
  timeZone?: string;
}

export const viewerTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

export const dateKeyInTimeZone = (instant: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return "";
  }
  return `${year}-${month}-${day}`;
};

export const shiftDateKey = (dateKey: string, days: number): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
};

export const emptyLocalStats = ({
  days = 7,
  now = new Date(),
  timeZone = viewerTimeZone(),
}: LocalStatsOptions = {}): LinkStat[] => {
  const today = dateKeyInTimeZone(now, timeZone);
  return Array.from({ length: days }, (_, index) => ({
    date: shiftDateKey(today, index - (days - 1)),
    views: 0,
    downloads: 0,
  }));
};

export const statsFromEvents = (
  events: LinkEventOccurrence[],
  options: LocalStatsOptions = {}
): LinkStat[] => {
  const timeZone = options.timeZone ?? viewerTimeZone();
  const rows = emptyLocalStats({ ...options, timeZone });
  const index = new Map(rows.map((row, rowIndex) => [row.date, rowIndex]));

  for (const event of events) {
    const instant = new Date(event.occurred_at);
    if (Number.isNaN(instant.getTime())) {
      continue;
    }
    const rowIndex = index.get(dateKeyInTimeZone(instant, timeZone));
    if (rowIndex === undefined) {
      continue;
    }
    const row = rows[rowIndex];
    if (event.kind === "view") {
      rows[rowIndex] = { ...row, views: row.views + 1 };
    } else {
      rows[rowIndex] = { ...row, downloads: row.downloads + 1 };
    }
  }

  return rows;
};

export const readShortLinkEvent = (
  payload: Record<string, unknown>
): ShortLinkEvent | null => {
  if (payload.type !== "short_link_event") {
    return null;
  }
  if (typeof payload.code !== "string" || payload.code === "") {
    return null;
  }
  if (payload.kind !== "view" && payload.kind !== "download") {
    return null;
  }
  if (
    typeof payload.view_count !== "number" ||
    typeof payload.download_count !== "number"
  ) {
    return null;
  }
  if (typeof payload.occurred_at !== "string" || payload.occurred_at === "") {
    return null;
  }
  return {
    code: payload.code,
    kind: payload.kind,
    viewCount: payload.view_count,
    downloadCount: payload.download_count,
    occurredAt: payload.occurred_at,
  };
};

export const applyShortLinkEventToLink = (
  link: ShortLink,
  event: ShortLinkEvent
): ShortLink => {
  if (link.code !== event.code) {
    return link;
  }
  return {
    ...link,
    view_count: event.viewCount,
    download_count: event.downloadCount,
  };
};

export const applyShortLinkEventToStats = (
  stats: LinkStat[],
  event: ShortLinkEvent,
  timeZone = viewerTimeZone()
): LinkStat[] => {
  const instant = new Date(event.occurredAt);
  if (Number.isNaN(instant.getTime())) {
    return stats;
  }
  const date = dateKeyInTimeZone(instant, timeZone);
  return stats.map((row) => {
    if (row.date !== date) {
      return row;
    }
    if (event.kind === "view") {
      return { ...row, views: row.views + 1 };
    }
    return { ...row, downloads: row.downloads + 1 };
  });
};

export const weekdayLabel = (dateKey: string, locale?: string): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    weekday: "short",
  });
};
