import { describe, expect, it } from "vitest";

import { formatBytes, initials, mediaKind } from "#/lib/media.ts";

describe("mediaKind", () => {
  it("detects images from type and filename", () => {
    expect(mediaKind("image/png", "photo.bin")).toBe("image");
    expect(mediaKind("application/octet-stream", "cover.webp")).toBe("image");
  });

  it("detects videos and PDFs", () => {
    expect(mediaKind("video/mp4", "clip.bin")).toBe("video");
    expect(mediaKind(null, "notes.PDF")).toBe("pdf");
  });

  it("falls back to a generic file", () => {
    expect(mediaKind("application/zip", "archive.zip")).toBe("file");
  });
});

describe("formatBytes", () => {
  it("formats common sizes", () => {
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });
});

describe("initials", () => {
  it("uses the first two words", () => {
    expect(initials("Amber Fox")).toBe("AF");
  });
});
