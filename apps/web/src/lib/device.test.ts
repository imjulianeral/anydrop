import { describe, expect, it } from "vitest";

import { detectDeviceKind, generateDisplayName } from "./device.ts";

describe("device identity", () => {
  it("builds a two-word display name", () => {
    expect(generateDisplayName()).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/u);
  });

  it("classifies user agents", () => {
    expect(detectDeviceKind("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe(
      "phone"
    );
    expect(detectDeviceKind("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("tablet");
    expect(detectDeviceKind("Mozilla/5.0 (X11; Linux x86_64)")).toBe("desktop");
  });
});
