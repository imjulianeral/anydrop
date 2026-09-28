import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { linkPageUrl, loadLinkKey, rememberLinkKey } from "./link-keys.ts";
import {
  fromBase64Url,
  isSecret,
  parseFragmentKey,
  toBase64Url,
} from "./secret-format.ts";

describe("fragment keys", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal("location", { origin: "https://phemera.test" });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("copies the complete URL in the creating browser only", () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const code = "ABC1234";
    expect(linkPageUrl(code)).toBe("https://phemera.test/s/ABC1234");
    rememberLinkKey(code, key);
    expect(linkPageUrl(code)).toMatch(/\/s\/ABC1234#[A-Za-z0-9_-]{43}$/u);
    expect(parseFragmentKey(new URL(linkPageUrl(code)).hash)).toStrictEqual(
      key
    );
    expect(loadLinkKey(code)).toStrictEqual(key);
    expect(linkPageUrl("URL1234")).toBe("https://phemera.test/s/URL1234");
  });

  it("round-trips canonical Base64url", () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    expect(fromBase64Url(toBase64Url(key))).toStrictEqual(key);
  });

  it("rejects missing, malformed, padded and noncanonical fragments", () => {
    for (const hash of [
      "",
      "#",
      "#abc",
      `${"A".repeat(43)}=`,
      `${"A".repeat(42)}B`,
      "!".repeat(43),
    ]) {
      expect(parseFragmentKey(hash)).toBeNull();
    }
    localStorage.setItem("phemera.link-keys", "broken");
    expect(loadLinkKey("ABC1234")).toBeNull();
  });

  it("validates v3 optional fields without the legacy key count", () => {
    const secret = {
      version: 3,
      kdf: "hkdf-sha256",
      cipher: "aes-256-gcm",
      password: false,
      iv: "AAAAAAAAAAAAAAAA",
    };
    expect(isSecret(secret)).toBeTruthy();
    expect(
      isSecret({ ...secret, salt: "AAAAAAAAAAAAAAAAAAAAAA==" })
    ).toBeFalsy();
    expect(isSecret({ ...secret, password: true })).toBeFalsy();
    expect(
      isSecret({ ...secret, password: true, salt: "AAAAAAAAAAAAAAAAAAAAAA==" })
    ).toBeTruthy();
  });

  it("rejects invalid wraps and stream IVs", () => {
    const secret = {
      version: 3,
      kdf: "hkdf-sha256",
      cipher: "aes-256-gcm",
      password: false,
      iv: "AAAAAAAAAAAAAAAA",
    };
    expect(isSecret({ ...secret, wrap: {} })).toBeFalsy();
    expect(
      isSecret({ ...secret, cipher: "secretstream-xchacha20poly1305" })
    ).toBeFalsy();
  });
});
