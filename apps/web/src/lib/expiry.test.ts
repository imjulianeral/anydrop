import { describe, expect, it } from "vitest";

import { remainingLabel } from "./expiry.ts";

describe("remainingLabel", () => {
  const now = Date.parse("2026-09-05T12:00:00.000Z");

  it("returns empty for invalid dates", () => {
    expect(remainingLabel("not-a-date", now)).toBe("");
  });

  it("marks past times as expired", () => {
    expect(remainingLabel("2026-09-05T11:59:59.000Z", now)).toBe("Expired");
  });

  it("formats days and hours", () => {
    expect(remainingLabel("2026-09-11T16:00:00.000Z", now)).toBe(
      "Deletes in 6d 4h"
    );
  });

  it("formats hours and minutes", () => {
    expect(remainingLabel("2026-09-06T01:12:00.000Z", now)).toBe(
      "Deletes in 13h 12m"
    );
  });

  it("formats minutes and seconds", () => {
    expect(remainingLabel("2026-09-05T12:12:08.000Z", now)).toBe(
      "Deletes in 12m 8s"
    );
  });

  it("formats seconds", () => {
    expect(remainingLabel("2026-09-05T12:00:09.000Z", now)).toBe(
      "Deletes in 9s"
    );
  });

  it("includes seconds for longer remaining times when asked", () => {
    expect(
      remainingLabel("2026-09-11T16:12:08.000Z", now, {
        includeSeconds: true,
      })
    ).toBe("Deletes in 6d 4h 12m 8s");
  });

  it("formats a duration countdown with seconds", () => {
    expect(
      remainingLabel("2026-09-06T01:12:08.000Z", now, {
        format: "duration",
      })
    ).toBe("13h 12m 8s");
  });
});
