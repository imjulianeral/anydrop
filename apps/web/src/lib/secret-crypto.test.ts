import { argon2Sync, createDecipheriv, hkdfSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  openSecretV3,
  sealFileV3,
  sealTextV3,
  openSecret,
  sealFile,
  sealText,
} from "./secret-crypto.ts";
import {
  unlockError,
  fromBase64,
  isSecret,
  maxSecretFileBytes,
} from "./secret-format.ts";

const password = "four random words for sharing";

describe("Secrets", () => {
  it("opens a fixed legacy v1 fixture", async () => {
    const sealed = {
      secret: {
        version: 1,
        kdf: "argon2id",
        memory: 65_536,
        iterations: 3,
        parallelism: 4,
        cipher: "aes-256-gcm",
        salt: "AAAAAAAAAAAAAAAAAAAAAA==",
        iv: "AAAAAAAAAAAAAAAA",
      } as const,
      ciphertext: fromBase64("YWgntqOabZFWTOnG+gZRY8v9xM2qzhslv+G0DFGXRTqRDSw=")
        .buffer,
    };
    await expect(openSecret(sealed, password, "text")).resolves.toStrictEqual({
      kind: "text",
      body: "Legacy fixture 🔒",
    });
  });

  it("encrypts Unicode messages and interoperates with native Argon2id and AES-GCM", async () => {
    const body = "A private message 🔒\n秘密";
    const sealed = await sealText(body, password);
    await expect(openSecret(sealed, password, "text")).resolves.toStrictEqual({
      kind: "text",
      body,
    });
    expect(new TextDecoder().decode(sealed.ciphertext)).not.toContain(body);

    const key = argon2Sync("argon2id", {
      message: password,
      nonce: fromBase64(sealed.secret.salt),
      parallelism: 4,
      memory: 65_536,
      passes: 3,
      tagLength: 32,
    });
    const ciphertext = Buffer.from(sealed.ciphertext);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      fromBase64(sealed.secret.iv)
    );
    decipher.setAAD(
      Buffer.from(
        `anyshare:secrets:1:text:argon2id:65536:3:4:aes-256-gcm:${sealed.secret.salt}`
      )
    );
    decipher.setAuthTag(ciphertext.subarray(-16));
    const plaintext = Buffer.concat([
      decipher.update(ciphertext.subarray(0, -16)),
      decipher.final(),
    ]);
    expect(plaintext.toString()).toBe(body);
  });

  it("uses fresh salts and IVs for repeated content and passwords", async () => {
    const first = await sealText("same message", password);
    const second = await sealText("same message", password);
    expect(first.secret.salt).not.toBe(second.secret.salt);
    expect(first.secret.iv).not.toBe(second.secret.iv);
    expect(new Uint8Array(first.ciphertext)).not.toStrictEqual(
      new Uint8Array(second.ciphertext)
    );
  });

  it("rejects wrong passwords, altered ciphertext, and changed content kinds", async () => {
    const sealed = await sealText("private", password);
    await expect(openSecret(sealed, "wrong password", "text")).rejects.toThrow(
      "Could not unlock"
    );
    await expect(openSecret(sealed, password, "file")).rejects.toThrow(
      "Could not unlock"
    );
    const bytes = new Uint8Array(sealed.ciphertext);
    bytes[0] = (bytes[0] + 1) % 256;
    await expect(openSecret(sealed, password, "text")).rejects.toThrow(
      "Could not unlock"
    );
  });

  it("encrypts binary files and their names and MIME types", async () => {
    const bytes = new Uint8Array([0, 255, 1, 128, 13, 10]);
    const file = new File([bytes], "private-秘密.svg", {
      type: "image/svg+xml",
    });
    const sealed = await sealFile(file, password);
    expect(new TextDecoder().decode(sealed.ciphertext)).not.toContain(
      file.name
    );
    const opened = await openSecret(sealed, password, "file");
    expect(opened).toStrictEqual({
      kind: "file",
      filename: file.name,
      contentType: file.type,
      bytes: bytes.buffer,
    });
    expect(opened.kind).toBe("file");
    if (opened.kind !== "file") {
      throw new Error("Expected a file");
    }
    expect(new Uint8Array(opened.bytes)).toStrictEqual(bytes);
  });

  it("supports empty files and full-sized messages", async () => {
    const file = new File([], "empty.txt");
    const sealedFile = await sealFile(file, password);
    await expect(
      openSecret(sealedFile, password, "file")
    ).resolves.toStrictEqual({
      kind: "file",
      filename: "empty.txt",
      contentType: "",
      bytes: new ArrayBuffer(0),
    });
    const body = "x".repeat(65_536);
    const message = await sealText(body, password);
    await expect(openSecret(message, password, "text")).resolves.toStrictEqual({
      kind: "text",
      body,
    });
  });

  it("rejects weak passwords and oversized input before encryption", async () => {
    await expect(sealText("private", "short")).rejects.toThrow("12–1024");
    await expect(sealText("🔒".repeat(20_000), password)).rejects.toThrow(
      "64 KiB"
    );
    const file = new File([], "large.txt");
    Object.defineProperty(file, "size", { value: maxSecretFileBytes + 1 });
    await expect(sealFile(file, password)).rejects.toThrow("100 MiB");
  });

  it("rejects unsupported versions, costly KDF parameters and malformed salts", async () => {
    const sealed = await sealText("private", password);
    expect(isSecret({ ...sealed.secret, version: 2 })).toBeFalsy();
    expect(isSecret({ ...sealed.secret, salt: "not base64" })).toBeFalsy();
    Object.assign(sealed.secret, { memory: 2_147_483_647 });
    await expect(openSecret(sealed, password, "text")).rejects.toThrow(
      "Unsupported"
    );
  });
});

describe("always-on v3 encryption", () => {
  it("encrypts without a password and derives the specified HKDF key", async () => {
    const sealed = await sealTextV3("private 🔒");
    expect(sealed.secret.password).toBeFalsy();
    expect(sealed.secret).not.toHaveProperty("salt");
    expect(sealed.secret).not.toHaveProperty("masterKey");
    await expect(
      openSecretV3(sealed, sealed.masterKey, undefined, "text")
    ).resolves.toStrictEqual({ kind: "text", body: "private 🔒" });
    const key = hkdfSync(
      "sha256",
      sealed.masterKey,
      Buffer.alloc(0),
      "anyshare:v3:content",
      32
    );
    const bytes = Buffer.from(sealed.ciphertext);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key),
      fromBase64(sealed.secret.iv)
    );
    decipher.setAAD(
      Buffer.from("anyshare:secrets:3:text:hkdf-sha256:aes-256-gcm:nopw:")
    );
    decipher.setAuthTag(bytes.subarray(-16));
    expect(
      Buffer.concat([
        decipher.update(bytes.subarray(0, -16)),
        decipher.final(),
      ]).toString()
    ).toBe("private 🔒");
  });

  it("rejects a wrong master key or content kind", async () => {
    const sealed = await sealTextV3("private 🔒");
    await expect(
      openSecretV3(sealed, new Uint8Array(32), undefined, "text")
    ).rejects.toThrow(unlockError);
    await expect(
      openSecretV3(sealed, sealed.masterKey, undefined, "file")
    ).rejects.toThrow(unlockError);
  });

  it("requires both the master key and optional password", async () => {
    const sealed = await sealTextV3("two locks", { password });
    await expect(
      openSecretV3(sealed, sealed.masterKey, password, "text")
    ).resolves.toStrictEqual({ kind: "text", body: "two locks" });
    await expect(
      openSecretV3(sealed, sealed.masterKey, "wrong password", "text")
    ).rejects.toThrow(unlockError);
    await expect(
      openSecretV3(sealed, sealed.masterKey, undefined, "text")
    ).rejects.toThrow(unlockError);
    const altered = {
      ...sealed,
      secret: { ...sealed.secret, password: false },
    };
    delete altered.secret.salt;
    await expect(
      openSecretV3(altered, sealed.masterKey, undefined, "text")
    ).rejects.toThrow(unlockError);
  });

  it("hides the filename and restores binary file bytes", async () => {
    const file = new File([new Uint8Array([0, 255, 42])], "private.svg", {
      type: "image/svg+xml",
    });
    const sealed = await sealFileV3(file);
    expect(new TextDecoder().decode(sealed.ciphertext)).not.toContain(
      file.name
    );
    await expect(
      openSecretV3(sealed, sealed.masterKey, undefined, "file")
    ).resolves.toStrictEqual({
      kind: "file",
      filename: file.name,
      contentType: file.type,
      bytes: await file.arrayBuffer(),
    });
    const bytes = new Uint8Array(sealed.ciphertext);
    bytes[0] = (bytes[0] + 1) % 256;
    await expect(
      openSecretV3(sealed, sealed.masterKey, undefined, "file")
    ).rejects.toThrow(unlockError);
  });
});
