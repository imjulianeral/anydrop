import { describe, expect, it } from "vitest";

import {
  applyShortLinkEventToLink,
  applyShortLinkEventToStats,
  dateKeyInTimeZone,
  readShortLinkEvent,
  statsFromEvents,
  weekdayLabel,
} from "./link-events.ts";

const event = {
  code: "ABC1234",
  kind: "view" as const,
  viewCount: 4,
  downloadCount: 1,
  occurredAt: "2026-09-07T01:00:00.000Z",
};

describe("readShortLinkEvent", () => {
  it("reads a view pulse", () => {
    expect(
      readShortLinkEvent({
        type: "short_link_event",
        code: "ABC1234",
        kind: "view",
        view_count: 4,
        download_count: 1,
        occurred_at: "2026-09-07T01:00:00.000Z",
      })
    ).toEqual(event);
  });

  it("ignores other cable events", () => {
    expect(readShortLinkEvent({ type: "peer_joined", id: "x" })).toBeNull();
  });
});

describe("applyShortLinkEventToLink", () => {
  it("updates matching counts", () => {
    const link = {
      code: "ABC1234",
      kind: "url" as const,
      view_count: 3,
      download_count: 1,
      expires_at: "2026-09-12T00:00:00Z",
    };
    expect(applyShortLinkEventToLink(link, event).view_count).toBe(4);
  });
});

describe("statsFromEvents", () => {
  it("puts a UTC Monday event on Sunday in Sao Paulo", () => {
    const now = new Date("2026-09-07T01:00:00.000Z");
    const stats = statsFromEvents(
      [{ occurred_at: "2026-09-07T01:00:00.000Z", kind: "view" }],
      { days: 7, now, timeZone: "America/Sao_Paulo" }
    );

    expect(stats.at(-1)?.date).toBe("2026-09-06");
    expect(stats.find((row) => row.date === "2026-09-06")?.views).toBe(1);
    expect(
      stats.find((row) => row.date === "2026-09-07")?.views
    ).toBeUndefined();
  });

  it("keeps a UTC Monday event on Monday in UTC", () => {
    const now = new Date("2026-09-07T01:00:00.000Z");
    const stats = statsFromEvents(
      [{ occurred_at: "2026-09-07T01:00:00.000Z", kind: "view" }],
      { days: 7, now, timeZone: "UTC" }
    );

    expect(stats.at(-1)?.date).toBe("2026-09-07");
    expect(stats.find((row) => row.date === "2026-09-07")?.views).toBe(1);
  });
});

describe("applyShortLinkEventToStats", () => {
  it("increments the local day for a UTC timestamp", () => {
    const stats = [
      { date: "2026-09-06", views: 1, downloads: 0 },
      { date: "2026-09-07", views: 3, downloads: 1 },
    ];
    expect(
      applyShortLinkEventToStats(stats, event, "America/Sao_Paulo")
    ).toEqual([
      { date: "2026-09-06", views: 2, downloads: 0 },
      { date: "2026-09-07", views: 3, downloads: 1 },
    ]);
  });
});

describe("dateKeyInTimeZone", () => {
  it("uses the civil date in the given zone", () => {
    const instant = new Date("2026-09-07T01:00:00.000Z");
    expect(dateKeyInTimeZone(instant, "America/Sao_Paulo")).toBe("2026-09-06");
    expect(dateKeyInTimeZone(instant, "UTC")).toBe("2026-09-07");
  });
});

describe("weekdayLabel", () => {
  it("labels a local calendar date without shifting the day", () => {
    expect(weekdayLabel("2026-09-06", "en-US")).toBe("Sun");
    expect(weekdayLabel("2026-09-07", "en-US")).toBe("Mon");
  });
});
