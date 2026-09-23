import { describe, expect, it, vi } from "vitest";

import { resolveAssetUrl } from "./api.ts";

vi.mock(import("./config.ts"), () => ({
  apiBase: "https://api.example.test",
  cableUrl: () => "",
  maxFileBytes: 0,
  maxTextBytes: 0,
}));

describe("download URLs", () => {
  it("keeps decrypted file downloads in the browser when the API uses another origin", () => {
    const url = "blob:https://app.example.test/decrypted-file";
    expect(resolveAssetUrl(url)).toBe(url);
  });

  it("resolves backend paths without changing absolute download URLs", () => {
    expect(resolveAssetUrl("/api/v1/files/file-1")).toBe(
      "https://api.example.test/api/v1/files/file-1"
    );
    const url = "https://storage.example.test/file-1";
    expect(resolveAssetUrl(url)).toBe(url);
  });
});
