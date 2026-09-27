import type { ContentSignals } from "./content-signals.ts";
import { beginFileTransfer } from "./file-transfers.ts";
import type { SealOptions, OpenSecret } from "./secret-crypto.ts";
import {
  missingKeyError,
  fromBase64,
  isSecret,
  maxSecretCipherBytes,
  toBase64,
} from "./secret-format.ts";
import type { Secret } from "./secret-format.ts";
import type { SecretResult, SecretTask } from "./secret.worker.ts";

export const prepareText = async (body: string, options: SealOptions = {}) => {
  const result = await runTask({ action: "seal-text-v3", body, ...options });
  if (result.action !== "seal") {
    throw new Error("Could not encrypt the message.");
  }
  return {
    body: toBase64(new Uint8Array(result.value.ciphertext)),
    secret: result.value.secret,
    masterKey: result.value.masterKey,
  };
};

export const prepareFile = async (
  file: File,
  options: SealOptions & { signal?: AbortSignal } = {}
): Promise<{
  file: File;
  secret: Secret;
  masterKey: Uint8Array;
  signals: ContentSignals;
}> => {
  const { signal, ...sealOptions } = options;
  const result = await runTask(
    { action: "seal-file-v3", file, ...sealOptions },
    signal
  );
  if (result.action !== "seal" || !result.signals) {
    throw new Error("Could not encrypt the file.");
  }
  return {
    file: new File([result.value.ciphertext], "secret.anyshare", {
      type: "application/octet-stream",
    }),
    secret: result.value.secret,
    masterKey: result.value.masterKey,
    signals: result.signals,
  };
};

export const unlockSecret = async (
  input: {
    secret: unknown;
    kind: "text" | "file";
    body?: string;
    downloadUrl?: string;
    filename?: string | null;
    byteSize?: number | null;
  },
  password?: string,
  masterKey?: Uint8Array
): Promise<OpenSecret> => {
  if (!isSecret(input.secret) || input.secret.cipher !== "aes-256-gcm") {
    throw new Error("Unsupported or invalid Secret format.");
  }
  if (input.secret.version === 3 && !masterKey) {
    throw new Error(missingKeyError);
  }
  const ciphertext =
    input.kind === "text"
      ? decodeText(input.body)
      : await fetchCiphertext(
          input.downloadUrl,
          input.filename,
          input.byteSize
        );
  let task: SecretTask;
  if (input.secret.version === 3) {
    if (!masterKey) {
      throw new Error(missingKeyError);
    }
    task = {
      action: "open-v3",
      sealed: { secret: input.secret, ciphertext },
      password,
      kind: input.kind,
      masterKey: new Uint8Array(masterKey).buffer,
    };
  } else {
    task = {
      action: "open",
      sealed: { secret: input.secret, ciphertext },
      password: password ?? "",
      kind: input.kind,
    };
  }
  const result = await runTask(task);
  if (result.action !== "open") {
    throw new Error("Could not unlock this Secret.");
  }
  return result.value;
};

const decodeText = (body?: string): ArrayBuffer => {
  if (!body || body.length > 87_404) {
    throw new Error("Invalid Secret message.");
  }
  return fromBase64(body).buffer;
};

const fetchCiphertext = async (
  url?: string,
  filename?: string | null,
  expectedBytes?: number | null
): Promise<ArrayBuffer> => {
  if (!url) {
    throw new Error("This Secret file is not available yet.");
  }
  const controller = new AbortController();
  const transfer = beginFileTransfer({
    direction: "download",
    name: filename || "Secret file",
    totalBytes: expectedBytes ?? undefined,
    phase: "Downloading",
    onCancel: () => controller.abort(),
  });
  try {
    const response = await fetch(url, {
      signal: AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(120_000),
      ]),
      cache: "no-store",
    });
    if (!response.ok || !response.body) {
      throw new Error(
        "Could not download this Secret. Refresh the page and try again."
      );
    }
    const contentLength = Number(response.headers.get("Content-Length"));
    const totalBytes =
      Number.isFinite(contentLength) && contentLength > 0
        ? contentLength
        : (expectedBytes ?? null);
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      while (true) {
        // Bound the response even when the server omits Content-Length.
        // oxlint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        size += value.byteLength;
        if (size > maxSecretCipherBytes) {
          throw new Error("Secret files must be 100 MiB or smaller.");
        }
        chunks.push(value);
        transfer.update(
          "Downloading",
          totalBytes ? Math.min(size / totalBytes, 1) : null,
          totalBytes ?? undefined
        );
      }
      const data = await new Blob(chunks).arrayBuffer();
      transfer.done();
      return data;
    } finally {
      await reader.cancel();
    }
  } catch (error) {
    if (controller.signal.aborted) {
      transfer.cancel();
    } else {
      transfer.fail();
    }
    throw error;
  }
};

const runTask = (
  task: SecretTask,
  signal?: AbortSignal
): Promise<Extract<SecretResult, { ok: true }>> =>
  new Promise((resolve, reject) => {
    if (!globalThis.crypto?.subtle) {
      reject(new Error("Secrets require HTTPS or localhost."));
      return;
    }
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("secret.worker.ts", import.meta.url), {
      type: "module",
    });
    let settled = false;
    const timeout = setTimeout(() => {
      fail(new Error("Secret processing timed out. Try again on this device."));
    }, 120_000);
    const abort = () => {
      fail(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const finish = () => {
      if (settled) {
        return false;
      }
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      return true;
    };
    const fail = (reason: unknown) => {
      if (finish()) {
        reject(reason);
      }
    };
    worker.addEventListener("message", (event: MessageEvent<SecretResult>) => {
      const { data } = event;
      if (!data || typeof data.ok !== "boolean") {
        return;
      }
      if (finish()) {
        if (data.ok) {
          resolve(data);
        } else {
          reject(new Error(data.error));
        }
      }
    });
    worker.addEventListener("error", () => {
      fail(new Error("This browser could not process the Secret."));
    });
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const transfers: Transferable[] = [];
      if (task.action === "open" || task.action === "open-v3") {
        transfers.push(task.sealed.ciphertext);
      }
      if (task.action === "open-v3") {
        transfers.push(task.masterKey);
      }
      worker.postMessage(task, transfers);
    } catch (error) {
      fail(error);
    }
  });
