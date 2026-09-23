import type { SealOptions } from "./secret-crypto.ts";
import { maxSecretFileBytes } from "./secret-format.ts";
import type { Secret } from "./secret-format.ts";
import {
  encodeFileMetadata,
  streamCipherSize,
} from "./secret-stream-format.ts";
import type { StreamResult, StreamTask } from "./secret-stream.worker.ts";
import { prepareFile } from "./secrets.ts";

interface PreparedFile {
  file: File;
  secret: Secret;
  masterKey: Uint8Array;
}

const stagingName = "anyshare-secret-staging";
const cleanupWait = 2000;

export const withPreparedFile = async <T>(
  file: File,
  options: SealOptions & { signal?: AbortSignal },
  consume: (prepared: PreparedFile) => Promise<T>,
  signal: AbortSignal,
  onProgress: (ratio: number) => void
): Promise<T> => {
  signal.throwIfAborted();
  if (file.size <= maxSecretFileBytes) {
    const prepared = await prepareFile(file, { ...options, signal });
    try {
      signal.throwIfAborted();
      return await consume(prepared);
    } finally {
      prepared.masterKey.fill(0);
    }
  }
  const size = streamCipherSize(file.size, encodeFileMetadata(file).length);
  if (
    !globalThis.isSecureContext ||
    !navigator.storage?.getDirectory ||
    !navigator.locks ||
    typeof FileSystemFileHandle === "undefined" ||
    !("createWritable" in FileSystemFileHandle.prototype)
  ) {
    throw new Error(
      "This browser cannot send Secrets larger than 100 MiB. Use a browser with private file storage support."
    );
  }
  return await navigator.locks.request(
    stagingName,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) {
        throw new Error(
          "Another large Secret is being sent in this browser. Wait for it to finish."
        );
      }
      const root = await navigator.storage.getDirectory();
      await removeStaging(root);
      const estimate = await navigator.storage.estimate();
      if (
        estimate.quota !== undefined &&
        size > estimate.quota - (estimate.usage ?? 0)
      ) {
        throw new Error(
          "Not enough temporary browser storage. Free disk space or use a smaller file."
        );
      }
      const masterKey = crypto.getRandomValues(new Uint8Array(32));
      try {
        signal.throwIfAborted();
        const directory = await root.getDirectoryHandle(stagingName, {
          create: true,
        });
        const handle = await directory.getFileHandle("secret.anyshare", {
          create: true,
        });
        const result = await runStreamTask(
          {
            action: "seal-file-v3",
            file,
            password: options.password,
            recipientPublicKey: options.recipientPublicKey,
            masterKey: new Uint8Array(masterKey).buffer,
            handle,
          },
          signal,
          onProgress
        );
        if (result.action !== "sealed") {
          throw new Error("Could not encrypt the file.");
        }
        const encrypted = await handle.getFile();
        if (encrypted.size !== size) {
          throw new Error("The encrypted file is incomplete.");
        }
        signal.throwIfAborted();
        return await consume({
          file: encrypted,
          secret: result.secret,
          masterKey,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "QuotaExceededError") {
          throw new Error(
            "Temporary browser storage is full. Free disk space or use a smaller file.",
            { cause: error }
          );
        }
        throw error;
      } finally {
        masterKey.fill(0);
        // Deleting the staging file can hang if the browser still holds it.
        void removeStaging(root).catch(() => null);
      }
    }
  );
};

export const supportsSecretSave = (): boolean =>
  globalThis.isSecureContext && "showSaveFilePicker" in globalThis;

export const pickSecretDestination = async (
  filename: string
): Promise<FileSystemFileHandle> => {
  if (!supportsSecretSave()) {
    throw new Error(
      "This browser cannot save large Secrets. Open this link in a browser with file-save support, such as desktop Chrome or Edge."
    );
  }
  const picker = globalThis as typeof globalThis & {
    showSaveFilePicker: (options: {
      suggestedName: string;
    }) => Promise<FileSystemFileHandle>;
  };
  return await picker.showSaveFilePicker({ suggestedName: filename || "file" });
};

export const runStreamTask = (
  task: StreamTask,
  signal: AbortSignal,
  onProgress: (ratio: number) => void = () => null
): Promise<Exclude<StreamResult, { action: "progress" | "error" }>> =>
  new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(
      new URL("secret-stream.worker.ts", import.meta.url),
      { type: "module" }
    );
    let timer: ReturnType<typeof setTimeout>;
    let abortTimer: ReturnType<typeof setTimeout> | undefined;
    let stopReason: unknown;
    const finish = () => {
      clearTimeout(timer);
      clearTimeout(abortTimer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const stop = (reason: unknown) => {
      if (stopReason) {
        return;
      }
      stopReason = reason;
      worker.postMessage({ action: "abort" }, []);
      clearTimeout(timer);
      abortTimer = setTimeout(() => {
        finish();
        reject(reason);
      }, 5000);
    };
    const abort = () => stop(signal.reason);
    const resetTimeout = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        stop(new Error("Secret processing stalled. Try again."));
      }, 120_000);
    };
    worker.addEventListener("message", (event: MessageEvent<StreamResult>) => {
      const result = event.data;
      if (result.action === "progress") {
        if (!stopReason) {
          resetTimeout();
          onProgress(result.ratio);
        }
        return;
      }
      finish();
      if (result.action === "error") {
        const error = new Error(result.message);
        error.name = result.name;
        reject(stopReason ?? error);
      } else {
        // A completed disk commit wins a cancellation that arrives afterward.
        resolve(result);
      }
    });
    worker.addEventListener("error", () => {
      finish();
      reject(new Error("This browser could not process the Secret."));
    });
    signal.addEventListener("abort", abort, { once: true });
    resetTimeout();
    try {
      worker.postMessage(task, "masterKey" in task ? [task.masterKey] : []);
    } catch (error) {
      finish();
      reject(error);
    }
  });

const removeStaging = async (root: FileSystemDirectoryHandle) => {
  try {
    await Promise.race([
      root.removeEntry(stagingName, { recursive: true }),
      new Promise<void>((resolve) => {
        setTimeout(resolve, cleanupWait);
      }),
    ]);
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "NotFoundError") {
      throw error;
    }
  }
};
