import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { migrateLegacyStorage } from "./legacy-storage.ts";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};

describe("legacy storage", () => {
  let local = memoryStorage();
  let session = memoryStorage();

  beforeEach(() => {
    local = memoryStorage();
    session = memoryStorage();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("moves pre-rename keys to their Phemera names", () => {
    local.setItem("anyshare.device", '{"id":"d1"}');
    local.setItem("anyshare.device-ecdh", "keys");
    local.setItem("anyshare.link-keys", "{}");
    local.setItem("anyshare.theme", "dark");
    session.setItem("anyshare:account-view", "sign-up");

    migrateLegacyStorage();

    expect(Object.fromEntries(local.values)).toStrictEqual({
      "phemera.device": '{"id":"d1"}',
      "phemera.device-ecdh": "keys",
      "phemera.link-keys": "{}",
      "phemera.theme": "dark",
    });
    expect(Object.fromEntries(session.values)).toStrictEqual({
      "phemera:account-view": "sign-up",
    });
  });

  it("never overwrites a value already stored under the new name", () => {
    local.setItem("anyshare.device", "old");
    local.setItem("phemera.device", "new");

    migrateLegacyStorage();

    expect(local.getItem("phemera.device")).toBe("new");
    expect(local.getItem("anyshare.device")).toBeNull();
  });

  it("keeps starting when storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });

    expect(() => migrateLegacyStorage()).not.toThrow();
  });
});
