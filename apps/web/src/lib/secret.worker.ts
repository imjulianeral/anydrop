import { hashFile } from "./content-signals.ts";
import type { ContentSignals } from "./content-signals.ts";
import {
  openSecret,
  openSecretV3,
  sealFileV3,
  sealTextV3,
} from "./secret-crypto.ts";
import type {
  OpenSecret,
  SealedSecret,
  SealedV3Secret,
  SealOptions,
} from "./secret-crypto.ts";
import type { BufferedV3Secret } from "./secret-format.ts";

export type SecretTask =
  | ({ action: "seal-text-v3"; body: string } & SealOptions)
  | ({ action: "seal-file-v3"; file: File } & SealOptions)
  | {
      action: "open";
      sealed: SealedSecret;
      password: string;
      kind: "text" | "file";
    }
  | {
      action: "open-v3";
      sealed: { secret: BufferedV3Secret; ciphertext: ArrayBuffer };
      masterKey: ArrayBuffer;
      password?: string;
      kind: "text" | "file";
    };

export type SecretResult =
  | {
      ok: true;
      action: "seal";
      value: SealedV3Secret;
      signals?: ContentSignals;
    }
  | { ok: true; action: "open"; value: OpenSecret }
  | { ok: false; error: string };

globalThis.addEventListener(
  "message",
  async (event: MessageEvent<SecretTask>) => {
    const task = event.data;
    try {
      if (task.action === "open" || task.action === "open-v3") {
        const value =
          task.action === "open"
            ? await openSecret(task.sealed, task.password, task.kind)
            : await openSecretV3(
                task.sealed,
                new Uint8Array(task.masterKey),
                task.password,
                task.kind
              );
        globalThis.postMessage(
          { ok: true, action: "open", value } satisfies SecretResult,
          { transfer: value.kind === "file" ? [value.bytes] : [] }
        );
      } else {
        const isFile = task.action === "seal-file-v3";
        const signals = isFile ? await hashFile(task.file) : undefined;
        const value = isFile
          ? await sealFileV3(task.file, task)
          : await sealTextV3(task.body, task);
        globalThis.postMessage(
          { ok: true, action: "seal", value, signals } satisfies SecretResult,
          { transfer: [value.ciphertext, value.masterKey.buffer] }
        );
      }
    } catch (error) {
      globalThis.postMessage(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not process this Secret.",
        } satisfies SecretResult,
        { transfer: [] }
      );
    } finally {
      if (task.action === "open-v3") {
        new Uint8Array(task.masterKey).fill(0);
      }
    }
  }
);
