import { describe, expect, it } from "vitest";

import {
  applyShortLinkEventToLink,
  applyShortLinkEventToStats,
  readShortLinkEvent,
} from "./link-events.ts";

const event = {
  code: "ABC1234",
  kind: "view" as const,
  viewCount: 4,
  downloadCount: 1,
  date: "2026-09-05",
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
        date: "2026-09-05",
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

describe("applyShortLinkEventToStats", () => {
  it("increments today's matching bucket", () => {
    const stats = [
      { date: "2026-09-04", views: 1, downloads: 0 },
      { date: "2026-09-05", views: 3, downloads: 1 },
    ];
    expect(applyShortLinkEventToStats(stats, event)).toEqual([
      { date: "2026-09-04", views: 1, downloads: 0 },
      { date: "2026-09-05", views: 4, downloads: 1 },
    ]);
  });
});
