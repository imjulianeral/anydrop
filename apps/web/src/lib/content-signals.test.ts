import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createSignalHasher, hashFile } from "./content-signals.ts";

const digest = (algorithm: string, bytes: Uint8Array) =>
  createHash(algorithm).update(bytes).digest("hex");

describe("content signal hashing", () => {
  it("hashes known vectors", async () => {
    await expect(hashFile(new Blob(["hello"]))).resolves.toStrictEqual({
      md5: "5d41402abc4b2a76b9719d911017c592",
      sha256:
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    });
    await expect(hashFile(new Blob([]))).resolves.toStrictEqual({
      md5: "d41d8cd98f00b204e9800998ecf8427e",
      sha256:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });
  });

  it("matches whole-file hashes across chunk boundaries", async () => {
    const bytes = new Uint8Array(9 * 1024 * 1024 + 13);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (index * 31) % 251;
    }
    const expected = {
      md5: digest("md5", bytes),
      sha256: digest("sha256", bytes),
    };
    await expect(hashFile(new Blob([bytes]))).resolves.toStrictEqual(expected);

    const hasher = await createSignalHasher();
    for (let offset = 0; offset < bytes.length; offset += 65_536) {
      hasher.update(bytes.subarray(offset, offset + 65_536));
    }
    expect(hasher.digest()).toStrictEqual(expected);
  });
});
