import { afterEach, beforeEach, expect, it, vi } from "vitest";

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
const fetchMock = vi.fn<typeof fetch>();
const signedParts: number[] = [];
const receivedParts: number[] = [];
const abortedRequests: number[] = [];
let active = 0;
let peakActive = 0;
type UploadPlan = {
  delay?: number;
  error?: Error;
  etag?: string | null;
  status?: number;
};

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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  signedParts.length = 0;
  receivedParts.length = 0;
  abortedRequests.length = 0;
  active = 0;
  peakActive = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  behavior = (partNumber) => {
    return { delay: (6 - partNumber) * 10 };
  };
  fetchMock.mockImplementation(async (input, options) => {
    const url = String(input);
    if (url.startsWith("https://r2.test/")) {
      const partNumber = Number(new URL(url).pathname.split("/").at(-1));
      const body = options?.body instanceof Blob ? options.body : new Blob();
      const plan = behavior(partNumber, body);
      active++;
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
          active--;
          options?.signal?.removeEventListener("abort", abort);
          if (plan.error) {
            reject(plan.error);
            return;
          }
          const headers =
            plan.etag === null
              ? undefined
              : { ETag: plan.etag ?? `"${"a".repeat(32)}"` };
          resolve(new Response(null, { status: plan.status ?? 200, headers }));
        };
        const abort = () => {
          if (settled) {
            return;
          }
          settled = true;
          if (timer) {
            clearTimeout(timer);
          }
          active--;
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
      expect(active).toBe(0);
      return new Response(null, { status: 204 });
    }
    if (url.endsWith("/multipart/parts")) {
      const { part_number: number } = JSON.parse(String(options?.body)) as {
        part_number: number;
      };
      signedParts.push(number);
      return Response.json({
        url: `https://r2.test/parts/${number}`,
        headers: {},
      });
    }
    if (url.endsWith("/multipart")) {
      return Response.json(multipart);
    }
    return Response.json(completed);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("slices the file, limits concurrency, and completes with parts in order", async () => {
  const progress = vi.fn();
  const input = file();
  const promise = uploadFile("token", "transfer", multipart, input, progress);
  await vi.runAllTimersAsync();
  expect(await promise).toEqual(completed);
  expect(peakActive).toBe(3);
  expect(input.slice).toHaveBeenNthCalledWith(5, partSize * 4, fileSize);
  expect(receivedParts).toEqual([1, 2, 3, 4, 5]);
  const completion = fetchMock.mock.calls.find(([url]) =>
    String(url).endsWith("/complete")
  );
  const payload = JSON.parse(String(completion?.[1]?.body)) as {
    parts: { part_number: number }[];
  };
  expect(payload.parts.map((part) => part.part_number)).toEqual([
    1, 2, 3, 4, 5,
  ]);
  expect(progress).toHaveBeenLastCalledWith(1);
  expect(
    progress.mock.calls.slice(0, -1).every(([ratio]) => ratio >= 0 && ratio < 1)
  ).toBe(true);
  expect(
    fetchMock.mock.calls.some(([, options]) => options?.method === "DELETE")
  ).toBe(false);
});

it("uploads a virtual maximum-size R2 file without allocating file contents", async () => {
  expect(maxFileBytes).toBe(5 * 1024 ** 4 - 5 * 1024 ** 3);
  const size = 5 * 1024 ** 4 - 5 * 1024 ** 3;
  const largePartSize = 524 * 1024 ** 2;
  const input = file(size);
  fetchMock.mockResolvedValueOnce(
    Response.json({
      type: "multipart",
      part_size: largePartSize,
      part_count: 9996,
    })
  );
  behavior = () => {
    return { delay: 0 };
  };
  const promise = uploadFile("token", "transfer", multipart, input, vi.fn());
  await vi.runAllTimersAsync();
  expect(await promise).toEqual(completed);
  expect(input.slice).toHaveBeenCalledTimes(9996);
  expect(input.slice).toHaveBeenLastCalledWith(9995 * largePartSize, size);
  expect(peakActive).toBeLessThanOrEqual(3);
  const completion = fetchMock.mock.calls.find(([url]) =>
    String(url).endsWith("/complete")
  );
  const payload = JSON.parse(String(completion?.[1]?.body)) as {
    parts: { part_number: number }[];
  };
  expect(payload.parts).toHaveLength(9996);
  expect(payload.parts.at(-1)?.part_number).toBe(9996);
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
  expect(receivedParts.filter((number) => number !== 2)).toEqual([1, 3, 4, 5]);
});

it("stops other parts and aborts R2 after a permanent failure", async () => {
  behavior = (partNumber) => {
    if (partNumber === 1) {
      return { delay: 10, status: 400 };
    }
    return {};
  };
  const promise = uploadFile("token", "transfer", multipart, file(), vi.fn());
  const assertion = expect(promise).rejects.toThrow("Upload failed (400)");
  await vi.runAllTimersAsync();
  await assertion;
  expect(receivedParts).toHaveLength(3);
  expect(abortedRequests.sort()).toEqual([2, 3]);
  expect(
    fetchMock.mock.calls.some(([, options]) => options?.method === "DELETE")
  ).toBe(true);
  expect(
    fetchMock.mock.calls.some(([url]) => String(url).endsWith("/complete"))
  ).toBe(false);
});

it("bounds retries for timeouts and cleans up incomplete uploads", async () => {
  behavior = () => ({ delay: 10, error: new Error("Upload timed out") });
  const promise = uploadFile("token", "transfer", multipart, file(), vi.fn());
  const assertion = expect(promise).rejects.toThrow("Upload timed out");
  await vi.runAllTimersAsync();
  await assertion;
  expect(signedParts.filter((number) => number === 1)).toHaveLength(3);
  expect(
    fetchMock.mock.calls.some(([, options]) => options?.method === "DELETE")
  ).toBe(true);
});

it("rejects missing ETags instead of completing an invalid upload", async () => {
  behavior = () => ({ delay: 10, etag: null });
  const promise = uploadFile("token", "transfer", multipart, file(), vi.fn());
  const assertion = expect(promise).rejects.toThrow("ETag");
  await vi.runAllTimersAsync();
  await assertion;
  expect(
    fetchMock.mock.calls.some(([url]) => String(url).endsWith("/complete"))
  ).toBe(false);
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
  const assertion = expect(promise).rejects.toThrow("cancelled");
  await vi.advanceTimersByTimeAsync(0);
  expect(active).toBe(3);
  controller.abort(new Error("cancelled"));
  await vi.runAllTimersAsync();
  await assertion;
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
  expect(await promise).toEqual(completed);
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
  fetchMock.mockImplementation(async (input, options) => {
    if (String(input).endsWith("/complete")) {
      return Response.json({ error: "storage unavailable" }, { status: 503 });
    }
    if (!original) {
      throw new Error("Missing fetch implementation");
    }
    return original(input, options);
  });
  const progress = vi.fn();
  const promise = uploadFile("token", "transfer", multipart, file(), progress);
  const assertion = expect(promise).rejects.toThrow("storage unavailable");
  await vi.runAllTimersAsync();
  await assertion;
  expect(
    fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/complete"))
  ).toHaveLength(3);
  expect(
    fetchMock.mock.calls.some(([, options]) => options?.method === "DELETE")
  ).toBe(false);
  expect(progress).not.toHaveBeenCalledWith(1);
});
