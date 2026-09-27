import { useCallback, useEffect, useId, useRef, useState } from "react";

import { EmptyState } from "#/components/empty-state.tsx";
import { FilePreview, startFileDownload } from "#/components/file-preview.tsx";
import { LargeSecretContent } from "#/components/large-secret-content.tsx";
import { Button } from "#/components/motion/button/index.tsx";
import { Input } from "#/components/motion/input.tsx";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field.tsx";
import { resolveAssetUrl, savingDownloadUrl } from "#/lib/api.ts";
import { loadDeviceKeyPair, unwrapMasterKey } from "#/lib/device-crypto.ts";
import { loadLinkKey } from "#/lib/link-keys.ts";
import type { OpenSecret } from "#/lib/secret-crypto.ts";
import {
  missingKeyError,
  parseFragmentKey,
  isSecret,
} from "#/lib/secret-format.ts";
import type { Secret } from "#/lib/secret-format.ts";
import { unlockSecret } from "#/lib/secrets.ts";
import { toast } from "#/lib/toast.ts";

interface SecretContentProps {
  viewerId?: string;
  allowStoredKey?: boolean;
  masterKey?: Uint8Array;
  item: {
    secret?: unknown;
    code?: string;
    recipient_id?: string | null;
    kind: "text" | "file" | "url";
    body?: string;
    download?: { url: string };
    expires_at: string;
    byte_size?: number | null;
    filename?: string | null;
    content_type?: string | null;
    status?: string;
  };
}

export function SecretContent({
  item,
  viewerId,
  allowStoredKey = false,
}: SecretContentProps) {
  const secret = isSecret(item.secret) ? item.secret : null;
  const outbound = Boolean(item.recipient_id && item.recipient_id !== viewerId);
  const { masterKey, failure } = useSecretKey(
    secret,
    outbound,
    item,
    allowStoredKey
  );

  if (secret?.version === 3 && outbound) {
    return (
      <p className="text-muted-foreground text-sm">
        {item.kind === "file" ? "Secret file" : "Secret message"}
      </p>
    );
  }
  if (failure) {
    return (
      <EmptyState
        title={
          failure === missingKeyError
            ? "This link is missing its key"
            : "Could not unlock this transfer."
        }
        description={failure}
      />
    );
  }
  if (item.kind === "file" && !item.download?.url) {
    return (
      <output className="text-muted-foreground text-sm">
        {item.status === "pending"
          ? "Uploading…"
          : "This file is no longer available."}
      </output>
    );
  }
  if (secret?.version === 3 && !masterKey) {
    return (
      <output className="text-muted-foreground text-sm">Preparing…</output>
    );
  }
  if (
    item.kind === "file" &&
    secret?.cipher === "secretstream-xchacha20poly1305"
  ) {
    return (
      <LargeSecretContent item={item} secret={secret} masterKey={masterKey} />
    );
  }
  return <BufferedSecretContent item={item} masterKey={masterKey} />;
}

function useSecretKey(
  secret: Secret | null,
  outbound: boolean,
  item: SecretContentProps["item"],
  allowStoredKey: boolean
) {
  const [loadedKey, setLoadedKey] = useState<{
    secret: Secret;
    bytes: Uint8Array;
  }>();
  const [failure, setFailure] = useState("");
  const masterKey = loadedKey?.secret === secret ? loadedKey.bytes : undefined;
  useEffect(() => {
    if (secret?.version !== 3 || outbound) {
      return;
    }
    let cancelled = false;
    let key: Uint8Array | null = null;
    const load = async () => {
      try {
        if (item.recipient_id) {
          if (!secret.wrap) {
            throw new Error("Could not unlock this transfer.");
          }
          const device = await loadDeviceKeyPair();
          key = await unwrapMasterKey(secret.wrap, device.privateKey);
        } else {
          key = parseFragmentKey(globalThis.location.hash);
          if (!key && allowStoredKey && item.code) {
            key = loadLinkKey(item.code);
          }
          if (!key) {
            throw new Error(missingKeyError);
          }
        }
        if (cancelled) {
          key.fill(0);
        } else {
          setLoadedKey({ secret, bytes: key });
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "Could not unlock this transfer.";
          setFailure(message);
          if (item.recipient_id) {
            toast.add({
              title: "Could not unlock this transfer.",
              type: "error",
            });
          }
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      key?.fill(0);
    };
  }, [secret, outbound, item.recipient_id, item.code, allowStoredKey]);

  return { masterKey, failure };
}

function BufferedSecretContent({ item, masterKey }: SecretContentProps) {
  const id = useId();
  const needsPassword =
    !isSecret(item.secret) || item.secret.version !== 3 || item.secret.password;
  const attempted = useRef(false);
  const [password, setPassword] = useState("");
  const [opened, setOpened] = useState<(OpenSecret & { url?: string }) | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const busyRef = useRef(false);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      if (opened?.url) {
        URL.revokeObjectURL(opened.url);
      }
    },
    [opened]
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const unlock = useCallback(async (): Promise<
    (OpenSecret & { url?: string }) | null
  > => {
    if (busyRef.current || item.kind === "url") {
      return null;
    }
    busyRef.current = true;
    setBusy(true);
    setUnlockError("");
    try {
      if (Date.parse(item.expires_at) <= Date.now()) {
        throw new Error("This Secret has expired.");
      }
      const result = await unlockSecret(
        {
          ...item,
          secret: item.secret,
          kind: item.kind,
          downloadUrl: item.download?.url
            ? savingDownloadUrl(resolveAssetUrl(item.download.url))
            : undefined,
          filename: item.filename,
          byteSize: item.byte_size,
        },
        needsPassword ? password : undefined,
        masterKey
      );
      if (!mounted.current) {
        return null;
      }
      // Download as binary so decrypted HTML and SVG cannot execute in this origin.
      const url =
        result.kind === "file"
          ? URL.createObjectURL(
              new Blob([result.bytes], { type: "application/octet-stream" })
            )
          : undefined;
      const value = { ...result, url };
      setOpened(value);
      setPassword("");
      return value;
    } catch (error) {
      setUnlockError(
        error instanceof Error ? error.message : "Could not unlock this Secret."
      );
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [item, masterKey, needsPassword, password]);

  useEffect(() => {
    if (!needsPassword && item.kind !== "file" && !attempted.current) {
      attempted.current = true;
      void unlock();
    }
  }, [item.kind, needsPassword, unlock]);

  if (!needsPassword && item.kind === "file") {
    const file = opened?.kind === "file" ? opened : null;
    return (
      <div className="flex flex-col gap-2">
        <FilePreview
          filename={file?.filename ?? item.filename ?? "Shared file"}
          contentType={file?.contentType ?? item.content_type}
          byteSize={file?.bytes.byteLength ?? item.byte_size}
          onDownload={async () => {
            const result = file ?? (await unlock());
            if (result?.kind !== "file" || !result.url) {
              return false;
            }
            startFileDownload(
              result.url,
              result.filename || "file",
              Boolean(file)
            );
            return true;
          }}
        />
        {unlockError ? (
          <FieldError role="alert">{unlockError}</FieldError>
        ) : null}
      </div>
    );
  }

  if (opened) {
    return (
      <div className="flex min-h-0 flex-col gap-3">
        {needsPassword ? (
          <p className="text-muted-foreground text-sm">Secret unlocked</p>
        ) : null}
        {opened.kind === "text" ? (
          <>
            <p className="max-h-[50dvh] overflow-y-auto text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
              {opened.body}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(opened.body);
                  toast.add({ title: "Message copied", type: "success" });
                } catch {
                  toast.add({
                    title: "Could not copy the message",
                    type: "error",
                  });
                }
              }}
            >
              Copy message
            </Button>
          </>
        ) : (
          <FilePreview
            filename={opened.filename}
            contentType={opened.contentType}
            byteSize={opened.bytes.byteLength}
            downloadUrl={opened.url}
          />
        )}
        {needsPassword ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setOpened(null);
            }}
          >
            Lock again
          </Button>
        ) : null}
      </div>
    );
  }

  if (!needsPassword) {
    return (
      <div className="flex flex-col gap-3">
        {unlockError ? (
          <>
            <FieldError role="alert">{unlockError}</FieldError>
            <Button type="button" disabled={busy} onClick={() => void unlock()}>
              {busy ? "Preparing…" : "Try again"}
            </Button>
          </>
        ) : (
          <output className="text-muted-foreground text-sm">Preparing…</output>
        )}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void unlock();
      }}
    >
      <p className="text-sm font-medium">
        {item.kind === "file" ? "Secret file" : "Secret message"}
      </p>
      <p className="text-muted-foreground text-sm">
        Enter the password from the sender to unlock this Secret on your device.
      </p>
      <FieldGroup>
        <Field data-invalid={Boolean(unlockError)} data-disabled={busy}>
          <FieldLabel htmlFor={id}>Password</FieldLabel>
          <Input
            id={id}
            type="password"
            autoComplete="current-password"
            required
            maxLength={1024}
            disabled={busy}
            value={password}
            error={Boolean(unlockError)}
            aria-invalid={Boolean(unlockError)}
            aria-describedby={unlockError ? `${id}-error` : undefined}
            onChange={(value) => {
              setPassword(value);
              setUnlockError("");
            }}
          />
          {unlockError ? (
            <FieldError id={`${id}-error`}>{unlockError}</FieldError>
          ) : null}
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={busy || password.trim().length < 12}>
        {busy ? "Unlocking…" : "Unlock Secret"}
      </Button>
    </form>
  );
}
