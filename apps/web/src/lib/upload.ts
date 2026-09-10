import {
  abortMultipartUpload,
  ApiError,
  completeTransfer,
  resolveAssetUrl,
  signUploadPart,
  startMultipartUpload,
} from "#/lib/api.ts";
import type { PartTarget, UploadedPart, UploadTarget } from "#/lib/api.ts";

const concurrency = 3;
const attempts = 3;
const partTimeout = 10 * 60 * 1000;

export const uploadFile = async (
  token: string,
  transferId: string,
  target: UploadTarget,
  file: File,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal
) => {
  const controller = new AbortController();
  const uploadSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;
  let completing = false;

  try {
    let parts: UploadedPart[] | undefined;
    if (target.type === "multipart") {
      parts = await uploadParts(
        token,
        transferId,
        file,
        onProgress,
        uploadSignal,
        controller
      );
    } else {
      await retry(
        () =>
          putBlob(
            target,
            file,
            (bytes) => onProgress(Math.min(bytes / file.size, 0.99)),
            uploadSignal
          ),
        uploadSignal
      );
    }

    uploadSignal.throwIfAborted();
    completing = true;
    const completed = await retry(
      () => completeTransfer(token, transferId, parts),
      uploadSignal
    );
    onProgress(1);
    return completed;
  } catch (error) {
    controller.abort(error);
    if (target.type === "multipart" && !completing) {
      try {
        await abortMultipartUpload(token, transferId);
      } catch {
        // The bucket lifecycle removes parts if cleanup cannot reach the backend.
      }
    }
    throw error;
  }
};

const uploadParts = async (
  token: string,
  transferId: string,
  file: File,
  onProgress: (ratio: number) => void,
  signal: AbortSignal,
  controller: AbortController
) => {
  const upload = await retry(
    () => startMultipartUpload(token, transferId, signal),
    signal
  );
  const { part_size: partSize, part_count: partCount } = upload;
  if (
    !Number.isSafeInteger(partSize) ||
    partSize < 5 * 1024 * 1024 ||
    partSize > 5 * 1024 ** 3 - 5 * 1024 ** 2 ||
    !Number.isSafeInteger(partCount) ||
    partCount < 1 ||
    partCount > 10_000 ||
    Math.ceil(file.size / partSize) !== partCount
  ) {
    throw new Error("Invalid multipart upload configuration");
  }

  const parts = new Array<UploadedPart>(partCount);
  const loaded = new Array<number>(partCount).fill(0);
  let nextPart = 0;
  let totalLoaded = 0;

  const worker = async () => {
    while (nextPart < partCount) {
      signal.throwIfAborted();
      const index = nextPart++;
      const chunk = file.slice(
        index * partSize,
        Math.min((index + 1) * partSize, file.size)
      );
      const progress = (bytes: number) => {
        totalLoaded += bytes - (loaded[index] ?? 0);
        loaded[index] = bytes;
        onProgress(Math.min(totalLoaded / file.size, 0.99));
      };

      // Each attempt signs just this part, so long uploads never depend on old URLs.
      // oxlint-disable-next-line no-await-in-loop
      const etag = await retry(async () => {
        progress(0);
        const target = await signUploadPart(
          token,
          transferId,
          index + 1,
          signal
        );
        const result = await putBlob(target, chunk, progress, signal);
        if (!result) {
          throw new Error("R2 did not expose the uploaded part ETag");
        }
        progress(chunk.size);
        return result;
      }, signal);
      parts[index] = { part_number: index + 1, etag };
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, partCount) },
    async () => {
      try {
        await worker();
      } catch (error) {
        controller.abort(error);
        throw error;
      }
    }
  );
  // Wait for every PUT to stop before aborting the remote upload.
  const results = await Promise.allSettled(workers);
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") {
    throw failed.reason;
  }
  return parts;
};

const retry = async <T>(
  operation: () => Promise<T>,
  signal: AbortSignal
): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try {
      // oxlint-disable-next-line no-await-in-loop
      return await operation();
    } catch (error) {
      signal.throwIfAborted();
      const permanent =
        error instanceof ApiError &&
        error.status < 500 &&
        ![403, 408, 429].includes(error.status);
      if (permanent || attempt >= attempts - 1) {
        throw error;
      }
      // oxlint-disable-next-line no-await-in-loop
      await delay(500 * 2 ** attempt, signal);
    }
  }
};

const delay = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
    }
  });

const putBlob = async (
  target: PartTarget,
  blob: Blob,
  onProgress: (bytes: number) => void,
  signal: AbortSignal
): Promise<string | null> => {
  signal.throwIfAborted();
  const timeoutSignal = AbortSignal.timeout(partTimeout);
  const requestSignal = AbortSignal.any([signal, timeoutSignal]);

  try {
    const response = await fetch(resolveAssetUrl(target.url), {
      method: "PUT",
      headers: target.headers,
      body: blob,
      signal: requestSignal,
    });

    if (!response.ok) {
      throw new ApiError(`Upload failed (${response.status})`, response.status);
    }

    onProgress(blob.size);
    return response.headers.get("ETag");
  } catch (error) {
    if (timeoutSignal.aborted && !signal.aborted) {
      throw new Error("Upload timed out");
    }
    throw error;
  }
};
