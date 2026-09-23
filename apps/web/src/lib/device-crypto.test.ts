import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ECDH_STORAGE_KEY,
  loadDeviceKeyPair,
  unwrapMasterKey,
  wrapMasterKey,
} from "./device-crypto.ts";
import { toBase64 } from "./secret-format.ts";

const pair = () =>
  crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);

describe("device key delivery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("wraps a master key for only the recipient", async () => {
    const recipient = await pair();
    const stranger = await pair();
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const publicSpki = toBase64(
      new Uint8Array(await crypto.subtle.exportKey("spki", recipient.publicKey))
    );
    const wrap = await wrapMasterKey(masterKey, publicSpki);
    await expect(
      unwrapMasterKey(wrap, recipient.privateKey)
    ).resolves.toStrictEqual(masterKey);
    await expect(unwrapMasterKey(wrap, stranger.privateKey)).rejects.toThrow(
      "Could not unlock this transfer."
    );
    const repeated = await wrapMasterKey(masterKey, publicSpki);
    expect(repeated.ephemeral_public).not.toBe(wrap.ephemeral_public);
    expect(repeated.ciphertext).not.toBe(wrap.ciphertext);
  });

  it("persists the device identity and replaces corrupt storage", async () => {
    const storage = new Map<string, string>([[ECDH_STORAGE_KEY, "broken"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal("navigator", {});
    const first = await loadDeviceKeyPair();
    const next = await loadDeviceKeyPair();
    expect(next.publicSpki).toBe(first.publicSpki);
    expect(next.privateKey.extractable).toBeFalsy();
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    await expect(
      unwrapMasterKey(
        await wrapMasterKey(masterKey, first.publicSpki),
        next.privateKey
      )
    ).resolves.toStrictEqual(masterKey);
  });
});
