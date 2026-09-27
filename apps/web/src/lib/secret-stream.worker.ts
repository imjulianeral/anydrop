import { createSignalHasher } from "./content-signals.ts";
import type { ContentSignals } from "./content-signals.ts";
import type { SealOptions } from "./secret-crypto.ts";
import type { StreamV3Secret, StreamSecret } from "./secret-format.ts";
import { maxSecretMetadataBytes } from "./secret-format.ts";
import {
  secretPrefixBytes,
  secretRecordOverhead,
} from "./secret-stream-format.ts";
import { openStream, openStreamV3, sealStreamV3 } from "./secret-stream.ts";
import type { SecretFileInfo } from "./secret-stream.ts";

interface OpenStreamTask {
  url: string;
  cipherBytes: number;
  handle?: FileSystemFileHandle;
  expectedPrefix?: string;
}

export type StreamTask =
  | ({
      action: "seal-file-v3";
      file: File;
      masterKey: ArrayBuffer;
      handle: FileSystemFileHandle;
    } & SealOptions)
  | ({
      action: "open";
      secret: StreamSecret;
      password: string;
    } & OpenStreamTask)
  | ({
      action: "open-v3";
      secret: StreamV3Secret;
      masterKey: ArrayBuffer;
      password?: string;
    } & OpenStreamTask);

export type StreamResult =
  | { action: "progress"; ratio: number }
  | { action: "sealed"; secret: StreamV3Secret; signals: ContentSignals }
  | { action: "opened"; info: SecretFileInfo; downloadUrl: string }
  | { action: "error"; message: string; name: string };

const controller = new AbortController();
let started = false;
let lastProgress = 0;
const report = (result: StreamResult) =>
  globalThis.postMessage(result, { transfer: [] });
const onProgress = (ratio: number) => {
  if (performance.now() - lastProgress >= 250 || ratio === 1) {
    lastProgress = performance.now();
    report({ action: "progress", ratio });
  }
};

globalThis.addEventListener(
  "message",
  async (event: MessageEvent<StreamTask | { action: "abort" }>) => {
    if (event.data.action === "abort") {
      controller.abort();
      return;
    }
    if (started) {
      return;
    }
    started = true;
    const task = event.data;
    const { signal } = controller;
    try {
      if (task.action === "seal-file-v3") {
        const hasher = await createSignalHasher();
        const secret = await sealStreamV3(
          task.file,
          new Uint8Array(task.masterKey),
          await task.handle.createWritable(),
          {
            signal,
            onProgress,
            onPlaintext: hasher.update,
            password: task.password,
            recipientPublicKey: task.recipientPublicKey,
          }
        );
        report({ action: "sealed", secret, signals: hasher.digest() });
        return;
      }
      const response = await fetch(task.url, {
        signal,
        cache: "no-store",
        headers: task.handle
          ? undefined
          : {
              Range: `bytes=0-${secretPrefixBytes + maxSecretMetadataBytes + secretRecordOverhead - 1}`,
            },
      });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error(
          "Could not download this Secret. Refresh the page and try again."
        );
      }
      try {
        const sink = await task.handle?.createWritable();
        const options = {
          signal,
          onProgress,
          sink,
          expectedPrefix: task.expectedPrefix,
          cipherBytes: task.cipherBytes,
        };
        const info =
          task.action === "open-v3"
            ? await openStreamV3(
                response.body,
                task.secret,
                new Uint8Array(task.masterKey),
                task.password,
                options
              )
            : await openStream(
                response.body,
                task.secret,
                task.password,
                options
              );
        report({ action: "opened", info, downloadUrl: response.url });
      } finally {
        if (!response.body.locked) {
          await response.body.cancel().catch(() => null);
        }
      }
    } catch (error) {
      report({
        action: "error",
        name: error instanceof Error ? error.name : "Error",
        message:
          error instanceof Error
            ? error.message
            : "Could not process this Secret.",
      });
    } finally {
      if ("masterKey" in task) {
        new Uint8Array(task.masterKey).fill(0);
      }
    }
  }
);
