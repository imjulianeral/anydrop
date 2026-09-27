import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "#/components/motion/button/index.tsx";
import { Input } from "#/components/motion/input.tsx";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field.tsx";
import { resolveAssetUrl, savingDownloadUrl } from "#/lib/api.ts";
import { beginFileTransfer } from "#/lib/file-transfers.ts";
import type { FileTransferHandle } from "#/lib/file-transfers.ts";
import {
  pickSecretDestination,
  runStreamTask,
  supportsSecretSave,
} from "#/lib/large-secrets.ts";
import { formatBytes } from "#/lib/media.ts";
import type { StreamSecret, StreamV3Secret } from "#/lib/secret-format.ts";
import type { SecretFileInfo } from "#/lib/secret-stream.ts";
import type { StreamTask } from "#/lib/secret-stream.worker.ts";

export function LargeSecretContent({
  item,
  secret,
  masterKey,
}: {
  item: {
    byte_size?: number | null;
    download?: { url: string };
    expires_at: string;
  };
  secret: StreamSecret | StreamV3Secret;
  masterKey?: Uint8Array;
}) {
  const id = useId();
  const needsPassword = secret.version !== 3 || secret.password;
  const [password, setPassword] = useState("");
  const [info, setInfo] = useState<SecretFileInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [failure, setFailure] = useState("");
  const operation = useRef<AbortController | null>(null);
  const unlockedPassword = useRef("");
  const downloadUrl = useRef("");
  const supported = supportsSecretSave();

  useEffect(
    () => () => {
      operation.current?.abort();
      operation.current = null;
      unlockedPassword.current = "";
      downloadUrl.current = "";
    },
    []
  );

  const process = useCallback(
    async (save: boolean) => {
      if (operation.current) {
        return;
      }
      const controller = new AbortController();
      operation.current = controller;
      setBusy(true);
      setFailure("");
      setProgress(null);
      let transfer: FileTransferHandle | null = null;
      try {
        const download = validateDownload(item, supported);
        // The picker must run in the click handler, before other asynchronous work.
        const handle = save
          ? await pickSecretDestination(info?.filename ?? "Shared file")
          : undefined;
        controller.signal.throwIfAborted();
        if (save) {
          transfer = beginFileTransfer({
            direction: "download",
            name: info?.filename ?? "Shared file",
            totalBytes: info?.byteSize ?? download.bytes,
            phase: "Downloading",
            onCancel: () => controller.abort(),
          });
        }
        const source = resolveAssetUrl(
          save ? savingDownloadUrl(download.url) : download.url
        );
        const common = {
          url: save ? source : downloadUrl.current || source,
          cipherBytes: download.bytes,
          handle,
          expectedPrefix: save ? info?.prefix : undefined,
          password: save ? unlockedPassword.current : password,
        };
        let task: StreamTask;
        if (secret.version === 3) {
          if (!masterKey) {
            throw new Error("This link is missing its key.");
          }
          task = {
            ...common,
            action: "open-v3",
            secret,
            masterKey: new Uint8Array(masterKey).buffer,
          };
        } else {
          task = { ...common, action: "open", secret };
        }
        const result = await runStreamTask(task, controller.signal, (ratio) => {
          setProgress(ratio);
          transfer?.update("Downloading", ratio);
        });
        if (result.action !== "opened") {
          throw new Error("Could not unlock this Secret.");
        }
        if (operation.current !== controller) {
          return;
        }
        setInfo(result.info);
        // Reuse this download grant when saving after the metadata request.
        downloadUrl.current = result.downloadUrl;
        if (!save) {
          unlockedPassword.current = password;
        }
        setPassword("");
        setSaved(save);
        transfer?.done();
      } catch (error) {
        if (controller.signal.aborted) {
          transfer?.cancel();
        } else {
          transfer?.fail();
        }
        if (operation.current === controller) {
          setFailure(
            error instanceof Error && error.name !== "AbortError"
              ? error.message
              : "Cancelled."
          );
        }
      } finally {
        if (operation.current === controller) {
          operation.current = null;
          setBusy(false);
          setProgress(null);
        }
      }
    },
    [item, supported, info, secret, masterKey, password]
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void process(false);
      }}
    >
      {supported ? null : (
        <p className="text-muted-foreground text-sm">
          This browser cannot save large Secrets. Open this link in a browser
          with file-save support, such as desktop Chrome or Edge.
        </p>
      )}
      {info ? (
        <>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{info.filename}</p>
              <p className="text-muted-foreground text-xs">
                {formatBytes(info.byteSize)}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={busy}
              onClick={() => {
                void process(true);
              }}
            >
              Download
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            {saved
              ? "File saved and verified."
              : "Choose where to save the file. Keep this page open until it finishes."}
          </p>
          {needsPassword ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                unlockedPassword.current = "";
                downloadUrl.current = "";
                setInfo(null);
                setSaved(false);
                setFailure("");
              }}
            >
              Lock again
            </Button>
          ) : null}
        </>
      ) : (
        <>
          {needsPassword ? (
            <FieldGroup>
              <Field
                data-invalid={Boolean(failure)}
                data-disabled={busy || !supported}
              >
                <FieldLabel htmlFor={id}>Password</FieldLabel>
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={1024}
                  disabled={busy || !supported}
                  value={password}
                  error={Boolean(failure)}
                  aria-invalid={Boolean(failure)}
                  aria-describedby={failure ? `${id}-error` : undefined}
                  onChange={(value) => {
                    setPassword(value);
                    setFailure("");
                  }}
                />
              </Field>
            </FieldGroup>
          ) : null}
          {needsPassword ? (
            <Button
              type="submit"
              disabled={
                busy ||
                (needsPassword && password.trim().length < 12) ||
                !supported
              }
            >
              Unlock Secret
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy || !supported}
              onClick={() => {
                void process(true);
              }}
            >
              Download
            </Button>
          )}
        </>
      )}
      {failure ? (
        <FieldError id={`${id}-error`} role="alert">
          {failure}
        </FieldError>
      ) : null}
      {busy ? (
        <>
          <output className="text-muted-foreground text-sm">
            {progress === null
              ? "Processing…"
              : `Saving · ${Math.round(progress * 100)}%`}
          </output>
          {progress === null ? null : (
            <progress aria-label="Save Secret file" value={progress} max={1} />
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => operation.current?.abort()}
          >
            Cancel
          </Button>
        </>
      ) : null}
    </form>
  );
}

const validateDownload = (
  item: {
    download?: { url: string };
    byte_size?: number | null;
    expires_at: string;
  },
  supported: boolean
) => {
  if (!supported) {
    throw new Error(
      "This browser cannot save large Secrets. Use a browser with file-save support, such as desktop Chrome or Edge."
    );
  }
  const expiry = Date.parse(item.expires_at);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new Error("This Secret has expired.");
  }
  if (!item.download?.url || !item.byte_size) {
    throw new Error("This Secret file is not available yet.");
  }
  return { url: item.download.url, bytes: item.byte_size };
};
