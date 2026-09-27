import { argon2Sync } from "node:crypto";

import sodium from "libsodium-wrappers";
import { describe, expect, it, vi } from "vitest";

import { maxFileBytes } from "./config.ts";
import { fromBase64, isSecret } from "./secret-format.ts";
import {
  encodeFileMetadata,
  secretRecordBytes,
  streamCipherSize,
} from "./secret-stream-format.ts";
import {
  openStreamV3,
  sealStreamV3,
  openStream,
  sealStream,
} from "./secret-stream.ts";

const password = "four random words for sharing";
const options = () => ({
  signal: new AbortController().signal,
  onProgress: () => null,
});

const seal = async (size: number) => {
  const bytes = Uint8Array.from({ length: size }, (_, index) => index % 251);
  const file = new File([bytes], "秘密.svg", { type: "image/svg+xml" });
  const parts: Uint8Array[] = [];
  const secret = await sealStream(
    file,
    password,
    new WritableStream({
      write: (part) => {
        parts.push(new Uint8Array(part));
      },
    }),
    options()
  );
  const cipher = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0)
  );
  let offset = 0;
  for (const part of parts) {
    cipher.set(part, offset);
    offset += part.length;
  }
  return { file, bytes, secret, cipher, parts };
};

const source = (bytes: Uint8Array, fragment = 65_537) => {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) {
        controller.close();
      } else {
        controller.enqueue(bytes.subarray(offset, offset + fragment));
        offset = Math.min(offset + fragment, bytes.length);
      }
    },
  });
};

const destination = () => {
  const parts: Uint8Array[] = [];
  const close = vi.fn<() => void>();
  const abort = vi.fn<() => void>();
  const sink = new WritableStream<Uint8Array>({
    write: (bytes) => {
      parts.push(new Uint8Array(bytes));
    },
    close,
    abort,
  });
  return { sink, parts, close, abort };
};

describe("streaming Secrets", () => {
  it.each([0, 1, secretRecordBytes, secretRecordBytes + 7])(
    "round-trips %i bytes through fragmented input",
    async (size) => {
      const sealed = await seal(size);
      const target = destination();
      const info = await openStream(
        source(sealed.cipher),
        sealed.secret,
        password,
        {
          ...options(),
          sink: target.sink,
          cipherBytes: sealed.cipher.length,
        }
      );
      expect(info).toMatchObject({
        filename: sealed.file.name,
        contentType: sealed.file.type,
        byteSize: size,
      });
      expect(Buffer.concat(target.parts)).toStrictEqual(
        Buffer.from(sealed.bytes)
      );
      expect([
        target.close.mock.calls.length,
        target.abort.mock.calls.length,
      ]).toStrictEqual([1, 0]);
      expect(sealed.cipher).toHaveLength(
        streamCipherSize(size, encodeFileMetadata(sealed.file).length)
      );
      expect(new TextDecoder().decode(sealed.cipher)).not.toContain(
        sealed.file.name
      );
    }
  );

  it("authenticates metadata with an independently derived native Argon2id key", async () => {
    const sealed = await seal(19);
    const key = argon2Sync("argon2id", {
      message: password,
      nonce: fromBase64(sealed.secret.salt),
      parallelism: 4,
      memory: 65_536,
      passes: 3,
      tagLength: 32,
    });
    // oxlint-disable-next-line import/no-named-as-default-member
    await sodium.ready;
    const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(
      sealed.cipher.subarray(8, 32),
      key
    );
    const aad = Buffer.concat([
      Buffer.from(
        `anyshare:secrets:2:file:argon2id:65536:3:4:secretstream-xchacha20poly1305:${sealed.secret.salt}:`
      ),
      sealed.cipher.subarray(0, 36),
    ]);
    const result = sodium.crypto_secretstream_xchacha20poly1305_pull(
      state,
      sealed.parts[1],
      aad
    );
    expect(result).not.toBeFalsy();
    if (!result) {
      throw new Error("Invalid metadata");
    }
    expect(JSON.parse(new TextDecoder().decode(result.message))).toStrictEqual({
      filename: "秘密.svg",
      contentType: "image/svg+xml",
      byteSize: 19,
    });
  });

  it("unlocks metadata without consuming the file and rejects changed headers on save", async () => {
    const sealed = await seal(secretRecordBytes + 2);
    const cancel = vi.fn<() => void>();
    const read = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(sealed.parts[0]);
        controller.enqueue(sealed.parts[1]);
      },
      cancel,
    });
    const info = await openStream(read, sealed.secret, password, {
      ...options(),
      cipherBytes: sealed.cipher.length,
    });
    expect(info.byteSize).toBe(sealed.bytes.length);
    expect(cancel).toHaveBeenCalledOnce();
    const target = destination();
    await expect(
      openStream(source(sealed.cipher), sealed.secret, password, {
        ...options(),
        cipherBytes: sealed.cipher.length,
        sink: target.sink,
        expectedPrefix: "changed",
      })
    ).rejects.toThrow("changed");
    expect(target.abort).toHaveBeenCalledOnce();
    expect(target.close).not.toHaveBeenCalled();
  });

  it("rejects wrong passwords and excessive KDF profiles", async () => {
    const sealed = await seal(32);
    for (const [profile, pass] of [
      [sealed.secret, "wrong password"],
      [{ ...sealed.secret, memory: 2 ** 30 }, password],
    ] as const) {
      const target = destination();
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        openStream(
          source(sealed.cipher),
          profile as typeof sealed.secret,
          pass,
          {
            ...options(),
            sink: target.sink,
            cipherBytes: sealed.cipher.length,
          }
        )
      ).rejects.toThrow(/Secret|unlock|aborted/u);
      expect(target.close).not.toHaveBeenCalled();
      expect(target.abort).toHaveBeenCalledOnce();
    }
    expect(isSecret({ ...sealed.secret, iv: "extra" })).toBeFalsy();
  });

  it("rejects corruption, truncation, reordered or duplicated records, and trailing bytes before committing", async () => {
    const sealed = await seal(2 * secretRecordBytes);
    const [prefix, meta, first, second, final] = sealed.parts;
    const corrupted = new Uint8Array(sealed.cipher);
    corrupted[corrupted.length - 25] = ((corrupted.at(-25) ?? 0) + 1) % 256;
    const candidates = [
      corrupted,
      sealed.cipher.subarray(0, -17),
      sealed.cipher.subarray(0, -1),
      Buffer.concat([prefix, meta, second, first, final]),
      Buffer.concat([prefix, meta, first, first, final]),
      Buffer.concat([prefix, meta, final]),
      Buffer.concat([sealed.cipher, new Uint8Array([0])]),
    ];
    for (const candidate of candidates) {
      const target = destination();
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        openStream(source(candidate), sealed.secret, password, {
          ...options(),
          sink: target.sink,
          cipherBytes: sealed.cipher.length,
        })
      ).rejects.toThrow(/Secret|unlock|aborted/u);
      expect(target.close).not.toHaveBeenCalled();
      expect(target.abort).toHaveBeenCalledOnce();
    }
  });

  it("rejects invalid length fields before requesting Argon2 or allocating records", async () => {
    const sealed = await seal(0);
    const bad = new Uint8Array(sealed.cipher);
    new DataView(bad.buffer).setUint32(32, 0xff_ff_ff_ff);
    await expect(
      openStream(source(bad, 1), sealed.secret, password, {
        ...options(),
        cipherBytes: bad.length,
      })
    ).rejects.toThrow("metadata length");
    await expect(
      openStream(source(sealed.cipher), sealed.secret, password, {
        ...options(),
        cipherBytes: sealed.cipher.length + 1,
      })
    ).rejects.toThrow("size does not match");
  });

  it("aborts an unfinished download on cancellation", async () => {
    const sealed = await seal(secretRecordBytes + 1);
    const controller = new AbortController();
    const close = vi.fn<() => void>();
    const abort = vi.fn<() => void>();
    const sink = new WritableStream<Uint8Array>({
      write() {
        controller.abort();
      },
      close,
      abort,
    });
    await expect(
      openStream(source(sealed.cipher), sealed.secret, password, {
        signal: controller.signal,
        onProgress: () => null,
        sink,
        cipherBytes: sealed.cipher.length,
      })
    ).rejects.toThrow(/Secret|unlock|aborted/u);
    expect(close).not.toHaveBeenCalled();
    expect(abort).toHaveBeenCalledOnce();
  });

  it("does not commit output after a disk write fails", async () => {
    const sealed = await seal(10);
    const close = vi.fn<() => void>();
    const sink = new WritableStream<Uint8Array>({
      write() {
        throw new Error("Disk full");
      },
      close,
    });
    await expect(
      openStream(source(sealed.cipher), sealed.secret, password, {
        ...options(),
        sink,
        cipherBytes: sealed.cipher.length,
      })
    ).rejects.toThrow("Disk full");
    expect(close).not.toHaveBeenCalled();
  });

  it("encrypts more than 100 MiB with one bounded read and write at a time", async () => {
    const size = 129 * secretRecordBytes + 3;
    const file = new File([], "large.bin");
    let writing = false;
    let written = 0;
    Object.defineProperties(file, {
      size: { value: size },
      arrayBuffer: {
        value: () => {
          throw new Error("Whole-file buffering");
        },
      },
      slice: {
        value: (start: number, end: number) => {
          expect(writing).toBeFalsy();
          expect(end - start).toBeLessThanOrEqual(secretRecordBytes);
          return new Blob([new Uint8Array(Math.min(end, size) - start)]);
        },
      },
    });
    const sink = new WritableStream<Uint8Array>({
      async write(bytes) {
        expect(writing).toBeFalsy();
        writing = true;
        expect(bytes.length).toBeLessThanOrEqual(secretRecordBytes + 17);
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
        written += bytes.length;
        writing = false;
      },
    });
    await sealStream(file, password, sink, options());
    expect(written).toBe(
      streamCipherSize(size, encodeFileMetadata(file).length)
    );
  }, 30_000);

  it("accounts for authentication overhead at the storage ceiling", () => {
    let low = 0;
    let high = maxFileBytes;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const size =
        middle + 4096 + 70 + 17 * Math.ceil(middle / secretRecordBytes);
      if (size <= maxFileBytes) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    expect(streamCipherSize(low, 4096)).toBeLessThanOrEqual(maxFileBytes);
    expect(() => streamCipherSize(low + 1, 4096)).toThrow("size limit");
    expect(() => streamCipherSize(Number.MAX_SAFE_INTEGER, 1)).toThrow(
      "size limit"
    );
    expect(() => streamCipherSize(0, 4097)).toThrow("size limit");
  });
});

describe("v3 streams", () => {
  it("shows every plaintext record to onPlaintext before wiping it", async () => {
    const bytes = Uint8Array.from(
      { length: secretRecordBytes + 5 },
      (_, index) => index % 251
    );
    const seen: Uint8Array<ArrayBuffer>[] = [];
    await sealStreamV3(
      new File([bytes], "private.bin"),
      crypto.getRandomValues(new Uint8Array(32)),
      destination().sink,
      { ...options(), onPlaintext: (chunk) => seen.push(new Uint8Array(chunk)) }
    );
    expect(seen).toHaveLength(2);
    expect(new Uint8Array(await new Blob(seen).arrayBuffer())).toStrictEqual(
      bytes
    );
  }, 30_000);

  it.each([undefined, password])(
    "round-trips with optional password %s",
    async (optionalPassword) => {
      const file = new File(
        [new Uint8Array(secretRecordBytes + 7).fill(42)],
        "private.bin",
        { type: "application/octet-stream" }
      );
      const masterKey = crypto.getRandomValues(new Uint8Array(32));
      const encrypted = destination();
      const secret = await sealStreamV3(file, masterKey, encrypted.sink, {
        ...options(),
        password: optionalPassword,
      });
      const cipher = new Uint8Array(
        await new Blob(
          encrypted.parts.map((part) => new Uint8Array(part))
        ).arrayBuffer()
      );
      const target = destination();
      const info = await openStreamV3(
        source(cipher),
        secret,
        masterKey,
        optionalPassword,
        { ...options(), sink: target.sink, cipherBytes: cipher.length }
      );
      expect(info.filename).toBe(file.name);
      expect(
        new Uint8Array(
          await new Blob(
            target.parts.map((part) => new Uint8Array(part))
          ).arrayBuffer()
        )
      ).toStrictEqual(new Uint8Array(await file.arrayBuffer()));
      await expect(
        openStreamV3(
          source(cipher),
          secret,
          new Uint8Array(32),
          optionalPassword,
          { ...options(), cipherBytes: cipher.length }
        )
      ).rejects.toThrow("Could not unlock");
      const truncated = destination();
      await expect(
        openStreamV3(
          source(cipher.subarray(0, -1)),
          secret,
          masterKey,
          optionalPassword,
          { ...options(), sink: truncated.sink, cipherBytes: cipher.length }
        )
      ).rejects.toThrow("incomplete");
      expect({
        closed: truncated.close.mock.calls.length,
        aborted: truncated.abort.mock.calls.length,
      }).toStrictEqual({ closed: 0, aborted: 1 });
    }
  );
});
