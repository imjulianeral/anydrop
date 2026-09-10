import { describe, expect, it } from "vitest";

import { ApiError } from "./api.ts";
import {
  isRouteModuleLoadError,
  shortLinkLoadErrorMessage,
} from "./short-link.ts";

describe("shortLinkLoadErrorMessage", () => {
  it("treats missing and gone links as expired", () => {
    expect(shortLinkLoadErrorMessage(new ApiError("not found", 404))).toBe(
      "This link has expired or is unavailable."
    );
    expect(shortLinkLoadErrorMessage(new ApiError("gone", 410))).toBe(
      "This link has expired or is unavailable."
    );
  });

  it("keeps other API errors", () => {
    expect(
      shortLinkLoadErrorMessage(
        new ApiError("could not allocate short code", 503)
      )
    ).toBe("could not allocate short code");
  });

  it("falls back when the error has no message", () => {
    expect(shortLinkLoadErrorMessage({})).toBe("This link is unavailable.");
  });
});

describe("isRouteModuleLoadError", () => {
  it("detects failed lazy route chunks", () => {
    expect(
      isRouteModuleLoadError(
        new TypeError("Failed to fetch dynamically imported module: /s.$code")
      )
    ).toBe(true);
    expect(
      isRouteModuleLoadError(new TypeError("Importing a module script failed."))
    ).toBe(true);
  });

  it("ignores ordinary errors", () => {
    expect(isRouteModuleLoadError(new Error("not found"))).toBe(false);
  });
});
