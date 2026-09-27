import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { maxFileBytes } from "./config.ts";
import { uploadFile } from "./upload.ts";

const partSize = 16 * 1024 * 1024;
const fileSize = partSize * 4 + 1;
const multipart = {
  type: "multipart",
  part_size: partSize,
  part_count: 5,
} as const;
const completed = { transfer: { id: "transfer", status: "uploaded" } };
const signals = { md5: "0".repeat(32), sha256: "0".repeat(64) };
const fetchMock = vi.fn<typeof fetch>();
const signedParts: number[] = [];
const receivedParts: number[] = [];
const abortedRequests: number[] = [];
let active = 0;
let peakActive = 0;
interface UploadPlan {
  delay?: number;
  error?: Error;
  etag?: string | null;
  status?: number;
}

let behavior: (partNumber: number, body: Blob) => UploadPlan;

const file = (size = fileSize) => {
  const value = new File([], "large.bin");
  Object.defineProperty(value, "size", { value: size });
  vi.spyOn(value, "slice").mockImplementation((start = 0, end = size) => {
    const blob = new Blob([]);
    Object.defineProperty(blob, "size", { value: end - start });
    return blob;
  });
  return value;
};

describe("file uploads", () => {
  beforeEach(() => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- Removes Temporal for this test.
    vi.stubGlobal("Temporal", undefined);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    signedParts.length = 0;
    receivedParts.length = 0;
    abortedRequests.length = 0;
    active = 0;
    peakActive = 0;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    behavior = (partNumber) => ({ delay: (6 - partNumber) * 10 });
    fetchMock.mockImplementation((input, options) => {
      const url = String(input);
      if (url.startsWith("https://r2.test/")) {
        const partNumber = Number(new URL(url).pathname.split("/").at(-1));
        const body = options?.body instanceof Blob ? options.body : new Blob();
        const plan = behavior(partNumber, body);
        active += 1;
        peakActive = Math.max(peakActive, active);
        receivedParts.push(partNumber);

        return new Promise<Response>((resolve, reject) => {
          let settled = false;
          let timer: ReturnType<typeof setTimeout> | undefined;
          const finish = () => {
            if (settled) {
              return;
            }
            settled = true;
            active -= 1;
            options?.signal?.removeEventListener("abort", abort);
            if (plan.error) {
              reject(plan.error);
              return;
            }
            const headers =
              plan.etag === null
                ? undefined
                : { ETag: plan.etag ?? `"${"a".repeat(32)}"` };
            resolve(
              new Response(null, { status: plan.status ?? 200, headers })
            );
          };
          const abort = () => {
            if (settled) {
              return;
            }
            settled = true;
            if (timer) {
              clearTimeout(timer);
            }
            active -= 1;
            abortedRequests.push(partNumber);
            reject(options?.signal?.reason ?? new Error("cancelled"));
          };

          options?.signal?.addEventListener("abort", abort, { once: true });
          if (plan.delay !== undefined) {
            timer = setTimeout(finish, plan.delay);
          }
        });
      }
      if (options?.method === "DELETE") {
        if (active !== 0) {
          return Promise.reject(
            new Error("Aborted the upload while parts were in flight")
          );
        }
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.endsWith("/multipart/parts")) {
        const { part_number: number } = JSON.parse(String(options?.body)) as {
          part_number: number;
        };
        signedParts.push(number);
        return Promise.resolve(
          Response.json({
            url: `https://r2.test/parts/${number}`,
            headers: {},
          })
        );
      }
      if (url.endsWith("/multipart")) {
        return Promise.resolve(Response.json(multipart));
      }
      return Promise.resolve(Response.json(completed));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("slices the file, limits concurrency, and completes with the password", async () => {
    const progress = vi.fn<(ratio: number) => void>();
    const input = file();
    const promise = uploadFile(
      "token",
      "transfer",
      multipart,
      input,
      progress,
      undefined,
      "four random words",
      signals
    );
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toStrictEqual(completed);
    expect(input.slice).toHaveBeenNthCalledWith(5, partSize * 4, fileSize);
    expect(progress).toHaveBeenLastCalledWith(1);
    const completion = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/complete")
    );
    const payload = JSON.parse(String(completion?.[1]?.body)) as {
      parts: { part_number: number }[];
      password: string;
      signals: unknown;
    };
    expect({
      peakActive,
      receivedParts,
      password: payload.password,
      signals: payload.signals,
      completedParts: payload.parts.map((part) => part.part_number),
      progressBeforeEnd: progress.mock.calls
        .slice(0, -1)
        .every(([ratio]) => ratio >= 0 && ratio < 1),
      aborted: fetchMock.mock.calls.some(
        ([, options]) => options?.method === "DELETE"
      ),
    }).toStrictEqual({
      peakActive: 3,
      receivedParts: [1, 2, 3, 4, 5],
      password: "four random words",
      signals,
      completedParts: [1, 2, 3, 4, 5],
      progressBeforeEnd: true,
      aborted: false,
    });
  });

  it("uploads a virtual maximum-size R2 file without allocating file contents", async () => {
    const size = 5 * 1024 ** 4 - 5 * 1024 ** 3;
    expect(maxFileBytes).toBe(size);
    const largePartSize = 524 * 1024 ** 2;
    const input = file(size);
    fetchMock.mockResolvedValueOnce(
      Response.json({
        type: "multipart",
        part_size: largePartSize,
        part_count: 9996,
      })
    );
    behavior = () => ({ delay: 0 });
    const promise = uploadFile("token", "transfer", multipart, input, vi.fn());
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toStrictEqual(completed);
    expect(input.slice).toHaveBeenCalledTimes(9996);
    expect(input.slice).toHaveBeenLastCalledWith(9995 * largePartSize, size);
    const completion = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/complete")
    );
    const payload = JSON.parse(String(completion?.[1]?.body)) as {
      parts: { part_number: number }[];
    };
    expect({
      withinConcurrency: peakActive <= 3,
      partCount: payload.parts.length,
      lastPart: payload.parts.at(-1)?.part_number,
    }).toStrictEqual({
      withinConcurrency: true,
      partCount: 9996,
      lastPart: 9996,
    });
  });

  it("retries only the failed part with a fresh signed URL", async () => {
    let failed = false;
    behavior = (partNumber) => {
      const status = partNumber === 2 && !failed ? 403 : 200;
      if (status === 403) {
        failed = true;
      }
      return { delay: 10, status };
    };
    const promise = uploadFile("token", "transfer", multipart, file(), vi.fn());
    await vi.runAllTimersAsync();
    await promise;
    expect(signedParts.filter((number) => number === 2)).toHaveLength(2);
    expect(receivedParts.filter((number) => number !== 2)).toStrictEqual([
      1, 3, 4, 5,
    ]);
  });

  it("stops other parts and aborts R2 after a permanent failure", async () => {
    behavior = (partNumber) => {
      if (partNumber === 1) {
        return { delay: 10, status: 400 };
      }
      return {};
    };
    const promise = uploadFile("token", "transfer", multipart, file(), vi.fn());
    void promise.catch(() => null);
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("Upload failed (400)");
    expect(receivedParts).toHaveLength(3);
    expect({
      abortedCount: abortedRequests.length,
      aborted: new Set(abortedRequests),
      cleanedUp: fetchMock.mock.calls.some(
        ([, options]) => options?.method === "DELETE"
      ),
      completed: fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("/complete")
      ),
    }).toStrictEqual({
      abortedCount: 2,
      aborted: new Set([2, 3]),
      cleanedUp: true,
      completed: false,
    });
  });

  it("bounds retries for timeouts and cleans up incomplete uploads", async () => {
    behavior = () => ({ delay: 10, error: new Error("Upload timed out") });
    const promise = uploadFile("token", "transfer", multipart, file(), vi.fn());
    void promise.catch(() => null);
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("Upload timed out");
    expect(signedParts.filter((number) => number === 1)).toHaveLength(3);
    expect(
      fetchMock.mock.calls.some(([, options]) => options?.method === "DELETE")
    ).toBeTruthy();
  });

  it("rejects missing ETags instead of completing an invalid upload", async () => {
    behavior = () => ({ delay: 10, etag: null });
    const promise = uploadFile("token", "transfer", multipart, file(), vi.fn());
    void promise.catch(() => null);
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("ETag");
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/complete"))
    ).toBeFalsy();
  });

  it("supports cancellation while parts are in flight", async () => {
    behavior = () => ({});
    const controller = new AbortController();
    const promise = uploadFile(
      "token",
      "transfer",
      multipart,
      file(),
      vi.fn(),
      controller.signal
    );
    void promise.catch(() => null);
    await vi.advanceTimersByTimeAsync(0);
    expect(active).toBe(3);
    controller.abort(new Error("cancelled"));
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("cancelled");
    expect(active).toBe(0);
    expect(abortedRequests).toHaveLength(3);
  });

  it("retains single PUT uploads for small files and local development", async () => {
    behavior = () => ({ delay: 10, etag: null });
    const promise = uploadFile(
      "token",
      "transfer",
      {
        type: "single",
        url: "https://r2.test/single/1",
        headers: { "Content-Type": "text/plain" },
      },
      new File(["hello"], "hello.txt"),
      vi.fn()
    );
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toStrictEqual(completed);
    expect(receivedParts).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith("https://r2.test/")
      )
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/complete"))
    ).toHaveLength(1);
  });

  it("does not abort an upload after an uncertain completion response", async () => {
    const original = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input, options) => {
      if (String(input).endsWith("/complete")) {
        return Promise.resolve(
          Response.json({ error: "storage unavailable" }, { status: 503 })
        );
      }
      if (!original) {
        return Promise.reject(new Error("Missing fetch implementation"));
      }
      return original(input, options);
    });
    const progress = vi.fn<(ratio: number) => void>();
    const promise = uploadFile(
      "token",
      "transfer",
      multipart,
      file(),
      progress
    );
    void promise.catch(() => null);
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("storage unavailable");
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/complete"))
    ).toHaveLength(3);
    expect(
      fetchMock.mock.calls.some(([, options]) => options?.method === "DELETE")
    ).toBeFalsy();
    expect(progress).not.toHaveBeenCalledWith(1);
  });
});
