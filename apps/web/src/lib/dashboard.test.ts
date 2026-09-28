import { describe, expect, it } from "vitest";

import {
  applyLiveEvent,
  countsByKind,
  downloadRate,
  filterByKind,
  cellToDay,
  dayToCell,
  selectionRange,
  seriesForRange,
  toHeatValues,
  trend,
  weekdayTotals,
} from "./dashboard.ts";
import type { DailyCounts, Dashboard } from "./dashboard.ts";

const row = (
  day: string,
  kind: DailyCounts["kind"],
  views: number,
  downloads = 0,
  created = 0
): DailyCounts => ({ day, kind, views, downloads, created });

describe("dashboard series", () => {
  it("fills every day of the range and sums kinds", () => {
    const rows = [row("2026-09-02", "url", 3), row("2026-09-02", "file", 1, 1)];

    expect(
      seriesForRange(rows, { start: "2026-09-01", end: "2026-09-03" })
    ).toStrictEqual([
      {
        day: "2026-09-01",
        date: new Date("2026-09-01T12:00:00Z"),
        created: 0,
        views: 0,
        downloads: 0,
      },
      {
        day: "2026-09-02",
        date: new Date("2026-09-02T12:00:00Z"),
        created: 0,
        views: 4,
        downloads: 1,
      },
      {
        day: "2026-09-03",
        date: new Date("2026-09-03T12:00:00Z"),
        created: 0,
        views: 0,
        downloads: 0,
      },
    ]);
  });

  it("totals by weekday, Monday first, and by kind", () => {
    // 2026-09-27 is a Sunday.
    const rows = [row("2026-09-27", "url", 2, 1), row("2026-09-21", "file", 1)];

    expect(weekdayTotals(rows)[6]).toStrictEqual({
      name: "Sun",
      views: 2,
      downloads: 1,
    });
    expect(weekdayTotals(rows)[0].views).toBe(1);
    expect(countsByKind(rows).url).toStrictEqual({
      created: 0,
      views: 2,
      downloads: 1,
    });
  });

  it("filters rows by link kind", () => {
    const rows = [row("2026-09-02", "url", 3), row("2026-09-02", "text", 1)];

    expect(filterByKind(rows, "all")).toHaveLength(2);
    expect(filterByKind(rows, "text")).toStrictEqual([rows[1]]);
  });
});

describe("heat calendar", () => {
  // 2026-09-27 is a Sunday, so the last column ends on it.
  const end = "2026-09-27";

  it("places days Monday-first and scales by the busiest day", () => {
    const { values, maxCount, total } = toHeatValues(
      [
        { day: "2026-09-21", views: 2, downloads: 2 },
        { day: "2026-09-27", views: 1, downloads: 0 },
        { day: "2026-09-28", views: 9, downloads: 0 },
      ],
      end,
      "both",
      2
    );

    expect(maxCount).toBe(4);
    expect(total).toBe(5);
    expect(values).toStrictEqual([
      [0, 0, 0, 0, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 0.25],
    ]);
  });

  it("converts between cells and days", () => {
    expect(cellToDay({ w: 1, d: 6 }, end, 2)).toBe("2026-09-27");
    expect(cellToDay({ w: 0, d: 0 }, end, 2)).toBe("2026-09-14");
    expect(dayToCell("2026-09-21", end, 2)).toStrictEqual({ w: 1, d: 0 });
    expect(dayToCell("2026-09-13", end, 2)).toBeNull();
    expect(dayToCell("2026-09-28", end, 2)).toBeNull();
  });

  it("orders a selection's days", () => {
    expect(
      selectionRange({ start: "2026-09-27", end: "2026-09-21" })
    ).toStrictEqual({ start: "2026-09-21", end: "2026-09-27" });
    expect(selectionRange({ start: "2026-09-14" })).toStrictEqual({
      start: "2026-09-14",
      end: "2026-09-14",
    });
  });
});

describe("trends", () => {
  it("compares with the previous period", () => {
    expect(trend(15, 10)).toStrictEqual({ direction: "up", percent: 50 });
    expect(trend(5, 10)).toStrictEqual({ direction: "down", percent: 50 });
    expect(trend(3, 0)).toStrictEqual({ direction: "up", percent: null });
    expect(trend(0, 0)).toStrictEqual({ direction: "flat", percent: null });
  });

  it("reports the download rate only when there were views", () => {
    expect(downloadRate({ created: 0, views: 0, downloads: 0 })).toBeNull();
    expect(downloadRate({ created: 0, views: 8, downloads: 2 })).toBe(25);
  });
});

describe("live events", () => {
  const counts = { created: 0, views: 0, downloads: 0 };
  const dashboard = {
    scope: "device",
    days: 7,
    start: "2026-09-21",
    end: "2026-09-27",
    daily: [],
    year: [],
    totals: {
      ...counts,
      by_kind: { url: counts, text: counts, file: counts },
    },
    previous: {
      ...counts,
      by_kind: { url: counts, text: counts, file: counts },
    },
    nearby: {
      sent: 0,
      received: 0,
      bytes_sent: 0,
      bytes_received: 0,
      daily: [],
    },
    devices: null,
    team: null,
    links: [
      {
        code: "ABC1234",
        kind: "file",
        view_count: 0,
        download_count: 0,
        created_at: "2026-09-27T10:00:00Z",
        expires_at: "2026-09-28T10:00:00Z",
      },
    ],
  } satisfies Dashboard;

  it("counts a download on its link, kind and day", () => {
    const next = applyLiveEvent(dashboard, {
      code: "ABC1234",
      kind: "download",
      viewCount: 0,
      downloadCount: 1,
      occurredAt: "2026-09-27T12:00:00Z",
    });

    expect(next?.links[0].download_count).toBe(1);
    expect(next?.totals.downloads).toBe(1);
    expect(next?.totals.by_kind.file.downloads).toBe(1);
    expect(next?.daily).toStrictEqual([
      { day: "2026-09-27", kind: "file", created: 0, views: 0, downloads: 1 },
    ]);
    expect(next?.year).toStrictEqual([
      { day: "2026-09-27", views: 0, downloads: 1 },
    ]);
  });

  it("ignores links outside the dashboard's scope", () => {
    expect(
      applyLiveEvent(dashboard, {
        code: "ZZZ9999",
        kind: "view",
        viewCount: 1,
        downloadCount: 0,
        occurredAt: "2026-09-27T12:00:00Z",
      })
    ).toBeNull();
  });
});
