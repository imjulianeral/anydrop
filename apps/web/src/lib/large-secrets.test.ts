import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runStreamTask, withPreparedFile } from "./large-secrets.ts";
import { maxSecretFileBytes } from "./secret-format.ts";
import {
  encodeFileMetadata,
  streamCipherSize,
} from "./secret-stream-format.ts";
import type { StreamResult, StreamTask } from "./secret-stream.worker.ts";
import { readTransfer } from "./transfer-events.ts";

const task: StreamTask = {
  action: "open",
  url: "https://example.test/cipher",
  password: "four random words for sharing",
  cipherBytes: 100,
  secret: {
    version: 2,
    kdf: "argon2id",
    memory: 65_536,
    iterations: 3,
    parallelism: 4,
    cipher: "secretstream-xchacha20poly1305",
    salt: "AAAAAAAAAAAAAAAAAAAAAA==",
  },
};

const signals = { md5: "0".repeat(32), sha256: "0".repeat(64) };

const opened: StreamResult = {
  action: "opened",
  downloadUrl: "https://example.test/granted-download",
  info: {
    filename: "file.bin",
    byteSize: 0,
    contentType: "",
    prefix: "header",
  },
};

class TestWorker extends EventTarget {
  static latest: TestWorker;
  postMessage = vi.fn<(message: unknown, transfer: Transferable[]) => void>();
  terminate = vi.fn<() => void>();
  constructor() {
    super();
    TestWorker.latest = this;
  }
  reply(data: StreamResult) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

describe("large Secret operation lifecycle", () => {
  beforeEach(() => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- Removes Temporal for this test.
    vi.stubGlobal("Temporal", undefined);
    vi.useFakeTimers();
    vi.stubGlobal("Worker", TestWorker);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps an active transfer alive beyond two minutes", async () => {
    const result = runStreamTask(task, new AbortController().signal);
    const worker = TestWorker.latest;
    await vi.advanceTimersByTimeAsync(119_000);
    worker.reply({ action: "progress", ratio: 0.1 });
    await vi.advanceTimersByTimeAsync(119_000);
    expect(worker.postMessage).toHaveBeenCalledOnce();
    worker.reply(opened);
    await expect(result).resolves.toStrictEqual(opened);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives cancellation time to abort the disk writer before terminating", async () => {
    const controller = new AbortController();
    const result = runStreamTask(task, controller.signal);
    const rejected = Promise.allSettled([result]);
    const worker = TestWorker.latest;
    controller.abort();
    expect(worker.postMessage).toHaveBeenLastCalledWith(
      { action: "abort" },
      []
    );
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.reply({ action: "error", name: "AbortError", message: "Aborted" });
    await expect(rejected).resolves.toMatchObject([
      { status: "rejected", reason: { name: "AbortError" } },
    ]);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a completed disk commit when cancellation arrives after completion", async () => {
    const controller = new AbortController();
    const result = runStreamTask(task, controller.signal);
    controller.abort();
    TestWorker.latest.reply(opened);
    await expect(result).resolves.toStrictEqual(opened);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("terminates a stalled worker after allowing its writer to abort", async () => {
    const result = runStreamTask(task, new AbortController().signal);
    const rejected = Promise.allSettled([result]);
    const worker = TestWorker.latest;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(worker.postMessage).toHaveBeenLastCalledWith(
      { action: "abort" },
      []
    );
    expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(rejected).resolves.toMatchObject([
      {
        status: "rejected",
        reason: { message: "Secret processing stalled. Try again." },
      },
    ]);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("keeps encryption metadata on events and rejects unknown formats", () => {
    const event = {
      id: "file",
      kind: "file",
      sender_id: "sender",
      secret: task.secret,
    };
    expect(readTransfer(event)?.secret).toStrictEqual(task.secret);
    expect(
      readTransfer({ ...event, secret: { ...task.secret, version: 99 } })
    ).toBeNull();
    expect(readTransfer({ ...event, secret: null })?.secret).toBeUndefined();
  });

  it("reports a timeout when a stalled worker acknowledges the abort", async () => {
    const result = runStreamTask(task, new AbortController().signal);
    const rejected = Promise.allSettled([result]);
    await vi.advanceTimersByTimeAsync(120_000);
    TestWorker.latest.reply({
      action: "error",
      name: "AbortError",
      message: "Aborted",
    });
    await expect(rejected).resolves.toMatchObject([
      {
        status: "rejected",
        reason: { message: "Secret processing stalled. Try again." },
      },
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("finishes the send when staging cleanup never completes", async () => {
    const source = new File(["x"], "video.bin", {
      type: "application/octet-stream",
    });
    Object.defineProperty(source, "size", { value: maxSecretFileBytes + 1 });
    const encrypted = new File(["x"], "secret.anyshare", {
      type: "application/octet-stream",
    });
    Object.defineProperty(encrypted, "size", {
      value: streamCipherSize(source.size, encodeFileMetadata(source).length),
    });
    vi.stubGlobal("FileSystemFileHandle", {
      prototype: { createWritable: () => Promise.resolve({}) },
    });
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", {
      locks: {
        request: (
          _name: string,
          _options: unknown,
          whileLocked: (lock: object) => Promise<unknown>
        ) => whileLocked({}),
      },
      storage: {
        estimate: () =>
          Promise.resolve({ quota: Number.MAX_SAFE_INTEGER, usage: 0 }),
        getDirectory: () =>
          Promise.resolve({
            getDirectoryHandle: () =>
              Promise.resolve({
                getFileHandle: () =>
                  Promise.resolve({
                    getFile: () => Promise.resolve(encrypted),
                  }),
              }),
            removeEntry: () =>
              new Promise<void>(() => {
                // Never settles, like a cleanup the browser leaves hanging.
              }),
          }),
      },
    });
    const send = withPreparedFile(
      source,
      {},
      (prepared) => {
        expect(prepared.signals).toStrictEqual(signals);
        return Promise.resolve("uploaded");
      },
      new AbortController().signal,
      () => null
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(TestWorker.latest.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "seal-file-v3",
        masterKey: expect.any(ArrayBuffer),
        password: undefined,
      }),
      expect.any(Array)
    );
    TestWorker.latest.reply({
      action: "sealed",
      secret: {
        version: 3,
        kdf: "hkdf-sha256",
        password: false,
        cipher: "secretstream-xchacha20poly1305",
      },
      signals,
    });
    await expect(send).resolves.toBe("uploaded");
  });
});
