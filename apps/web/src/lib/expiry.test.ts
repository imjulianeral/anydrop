import { describe, expect, it } from "vitest";

import { remainingLabel, remainingRatio, remainingTone } from "./expiry.ts";

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

describe("remainingRatio", () => {
  const createdAt = "2026-09-05T00:00:00.000Z";
  const expiresAt = "2026-09-06T00:00:00.000Z";

  it("returns null for invalid dates", () => {
    expect(remainingRatio("not-a-date", createdAt)).toBeNull();
    expect(remainingRatio(expiresAt, "not-a-date")).toBeNull();
  });

  it("returns the remaining lifetime fraction", () => {
    expect(
      remainingRatio(
        expiresAt,
        createdAt,
        Date.parse("2026-09-05T12:00:00.000Z")
      )
    ).toBe(0.5);
  });

  it("clamps before creation and after expiry", () => {
    expect(
      remainingRatio(
        expiresAt,
        createdAt,
        Date.parse("2026-09-04T00:00:00.000Z")
      )
    ).toBe(1);
    expect(
      remainingRatio(
        expiresAt,
        createdAt,
        Date.parse("2026-09-07T00:00:00.000Z")
      )
    ).toBe(0);
  });

  it("returns 0 when the window is empty", () => {
    expect(remainingRatio(createdAt, createdAt)).toBe(0);
  });
});

describe("remainingTone", () => {
  it("is green from 66% remaining", () => {
    expect(remainingTone(1)).toBe("green");
    expect(remainingTone(0.66)).toBe("green");
  });

  it("is yellow from 33% up to 66%", () => {
    expect(remainingTone(0.659)).toBe("yellow");
    expect(remainingTone(0.33)).toBe("yellow");
  });

  it("is red below 33%", () => {
    expect(remainingTone(0.329)).toBe("red");
    expect(remainingTone(0)).toBe("red");
  });
});
