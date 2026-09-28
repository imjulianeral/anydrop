import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { ExpirationOptions } from "#/components/expiration-options.tsx";
import { ActionSwapCascadeButton } from "#/components/motion/action-swap-cascade.tsx";
import type { ActionSwapItem } from "#/components/motion/action-swap-cascade.tsx";
import { AttachmentUpload } from "#/components/motion/attachment-upload.tsx";
import type { AttachmentUploadItem } from "#/components/motion/attachment-upload.tsx";
import { Input } from "#/components/motion/input.tsx";
import { MorphingView } from "#/components/motion/morphing-modal.tsx";
import { PasswordOptions } from "#/components/password-options.tsx";
import {
  Check,
  Copy,
  FileIcon,
  Link2,
  MessageSquare,
  X,
} from "#/components/rune-icons.tsx";
import {
  createFileTransfer,
  createShortLink,
  createTextTransfer,
} from "#/lib/api.ts";
import type { ShortLink } from "#/lib/api.ts";
import { attempt } from "#/lib/attempt.ts";
import { maxFileBytes, maxTextBytes } from "#/lib/config.ts";
import { defaultExpiration } from "#/lib/expiration-options.ts";
import type { ExpirationOptions as ExpirationSettings } from "#/lib/expiration-options.ts";
import { beginFileTransfer } from "#/lib/file-transfers.ts";
import { island } from "#/lib/island.ts";
import { withPreparedFile } from "#/lib/large-secrets.ts";
import { linkPageUrl, rememberLinkKey } from "#/lib/link-keys.ts";
import { prepareText } from "#/lib/secrets.ts";
import { uploadFile } from "#/lib/upload.ts";

type LinkKind = "url" | "text" | "file";

const choices = [
  {
    kind: "url",
    label: "Shorten URL",
    description: "Turn a long URL into a short link.",
    icon: Link2,
  },
  {
    kind: "text",
    label: "Message",
    description: "Share an encrypted message with a link.",
    icon: MessageSquare,
  },
  {
    kind: "file",
    label: "File",
    description: "Share an encrypted file with a link.",
    icon: FileIcon,
  },
] as const;

const copyLinkItems: ActionSwapItem[] = [
  {
    id: "copy",
    label: "Copy your latest link",
    icon: <Copy className="size-4" />,
  },
  {
    id: "copied",
    label: "Copied link",
    icon: <Check className="size-4" />,
  },
];

const closeButtonClass =
  "text-muted-foreground hover:bg-foreground/[0.06] inline-flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const cancelButtonClass =
  "bg-foreground/[0.06] text-foreground inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded-full px-4 text-sm font-medium transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none";
const actionButtonClass =
  "bg-foreground text-background inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none";

const reportError = (error: unknown, title: string) => {
  island.error(title, error);
};

interface LinkFormProps {
  busy: boolean;
  expiration: ExpirationSettings;
  onExpirationChange: (value: ExpirationSettings) => void;
  password: string | null;
  onPasswordChange: (password: string | null) => void;
  passwordTooShort: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

/** The copy button waits until a started file link is either sent or dropped. */
function showCopyLink(
  kind: LinkKind | null,
  draft: { file: File | null; password: string | null; busy: boolean }
) {
  if (kind !== "file") {
    return true;
  }
  return draft.file === null && draft.password === null && !draft.busy;
}

function PanelHeader({
  selected,
  busy,
  backButton,
  onBack,
  onClose,
}: {
  selected: (typeof choices)[number] | undefined;
  busy: boolean;
  backButton: RefObject<HTMLButtonElement | null>;
  onBack: () => void;
  onClose: () => void;
}) {
  if (!selected) {
    return (
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-foreground text-base font-semibold">
          Create a link
        </h2>
        <button
          type="button"
          className={closeButtonClass}
          aria-label="Close create link modal"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    );
  }
  const DetailIcon = selected.icon;
  return (
    <>
      <div className="mb-3 flex items-start justify-between">
        <DetailIcon aria-hidden="true" className="text-foreground size-5" />
        <button
          ref={backButton}
          type="button"
          className={closeButtonClass}
          aria-label="Back to link options"
          disabled={busy}
          onClick={onBack}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <h2 className="text-foreground text-xl font-semibold tracking-tight">
        {selected.label}
      </h2>
      <p className="text-muted-foreground mt-2 text-sm">
        {selected.description}
      </p>
      <hr className="border-border my-4" />
    </>
  );
}

function UrlLinkForm({
  busy,
  expiration,
  onExpirationChange,
  password,
  onPasswordChange,
  passwordTooShort,
  value,
  onValueChange,
  onCancel,
  onSubmit,
}: LinkFormProps) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Input
        label="Destination URL"
        type="url"
        placeholder="https://"
        value={value}
        onChange={onValueChange}
        disabled={busy}
        required
      />
      <ExpirationOptions
        value={expiration}
        onChange={onExpirationChange}
        disabled={busy}
        kind="url"
      />
      <PasswordOptions
        password={password}
        onChange={onPasswordChange}
        disabled={busy}
      />
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          className={cancelButtonClass}
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={actionButtonClass}
          disabled={busy || value.trim() === "" || passwordTooShort}
          aria-busy={busy}
        >
          {busy ? "Shortening…" : "Shorten URL"}
        </button>
      </div>
    </form>
  );
}

function MessageLinkForm({
  id,
  busy,
  expiration,
  onExpirationChange,
  password,
  onPasswordChange,
  passwordTooShort,
  value,
  onValueChange,
  onCancel,
  onSubmit,
}: LinkFormProps & { id: string }) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        Message
      </label>
      <textarea
        id={id}
        className="border-border bg-background min-h-28 w-full resize-y rounded-2xl border p-3 text-sm outline-none focus-visible:ring-2"
        placeholder="Write a message"
        value={value}
        maxLength={maxTextBytes}
        disabled={busy}
        required
        onChange={(event) => onValueChange(event.target.value)}
      />
      <ExpirationOptions
        value={expiration}
        onChange={onExpirationChange}
        disabled={busy}
        kind="text"
      />
      <PasswordOptions
        password={password}
        onChange={onPasswordChange}
        disabled={busy}
      />
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          className={cancelButtonClass}
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={actionButtonClass}
          disabled={busy || value.trim() === "" || passwordTooShort}
          aria-busy={busy}
        >
          {busy ? "Creating…" : "Create message link"}
        </button>
      </div>
    </form>
  );
}

function UploadProgress({
  phase,
  progress,
  onCancel,
}: {
  phase: string;
  progress: number | null;
  onCancel: () => void;
}) {
  const ratio = progress ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <progress
        className="h-1 w-full"
        max={1}
        value={ratio}
        aria-label={`${phase} file`}
      />
      <output aria-live="polite" className="text-muted-foreground text-xs">
        {phase} · {Math.round(ratio * 100)}%
      </output>
      <button type="button" className={cancelButtonClass} onClick={onCancel}>
        Cancel upload
      </button>
    </div>
  );
}

export function CreateLinkPanel({
  created,
  onCreated,
  onBusyChange,
  onClose,
  onViewHistory,
}: {
  created: ShortLink | null;
  onCreated: (link: ShortLink) => void;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onViewHistory: () => void;
}) {
  const { token } = useAppSession();
  const messageId = useId();
  const backButton = useRef<HTMLButtonElement>(null);
  const optionButtons = useRef<Record<LinkKind, HTMLButtonElement | null>>({
    url: null,
    text: null,
    file: null,
  });
  const previousKind = useRef<LinkKind | null>(null);
  const upload = useRef<AbortController | null>(null);
  const copyResetTimer = useRef(0);
  const busyRef = useRef(false);
  const [kind, setKind] = useState<LinkKind | null>(null);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<AttachmentUploadItem | null>(
    null
  );
  const file = attachment?.file ?? null;
  const [expiration, setExpiration] = useState(defaultExpiration);
  const [password, setPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"copy" | "copied">("copy");
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState("Encrypting");
  const passwordTooShort = password !== null && password.trim().length < 12;
  const selected = choices.find((choice) => choice.kind === kind);

  useEffect(() => () => upload.current?.abort(), []);
  useEffect(() => () => clearTimeout(copyResetTimer.current), []);

  useEffect(() => {
    if (kind) {
      backButton.current?.focus({ preventScroll: true });
    } else if (previousKind.current) {
      optionButtons.current[previousKind.current]?.focus({
        preventScroll: true,
      });
    }
    previousKind.current = kind;
  }, [kind]);

  const start = () => {
    if (busyRef.current) {
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    onBusyChange(true);
    return true;
  };

  const stop = () => {
    busyRef.current = false;
    setBusy(false);
    onBusyChange(false);
  };

  const finish = (link: ShortLink, title: string) => {
    clearTimeout(copyResetTimer.current);
    setCopyStatus("copy");
    onCreated(link);
    setExpiration(defaultExpiration);
    setPassword(null);
    island.success(title);
  };

  const checkPassword = () => {
    if (!passwordTooShort) {
      return true;
    }
    reportError(
      new Error("Use a password or passphrase with 12–1024 characters."),
      "Use a longer password"
    );
    return false;
  };

  const shorten = async () => {
    const destination = url.trim();
    if (destination === "" || busyRef.current) {
      return;
    }
    if (!checkPassword()) {
      return;
    }
    if (!start()) {
      return;
    }
    await attempt(
      async () => {
        const { short_link: link } = await createShortLink(
          token,
          destination,
          expiration,
          password ?? undefined
        );
        finish(link, "Short link created");
        setUrl("");
      },
      {
        onError: (error) => reportError(error, "Could not shorten URL"),
        onSettled: stop,
      }
    );
  };

  const createMessage = async () => {
    const body = message.trim();
    if (body === "" || busyRef.current) {
      return;
    }
    if (new TextEncoder().encode(body).length > maxTextBytes) {
      reportError(
        new Error("The message is too long."),
        "Could not create link"
      );
      return;
    }
    if (!checkPassword()) {
      return;
    }
    if (!start()) {
      return;
    }
    let masterKey: Uint8Array | undefined;
    await attempt(
      async () => {
        const prepared = await prepareText(body);
        ({ masterKey } = prepared);
        const { short_link: link } = await createTextTransfer(token, {
          body: prepared.body,
          secret: prepared.secret,
          expiration,
          password: password ?? undefined,
        });
        if (!link) {
          throw new Error("Could not create link");
        }
        rememberLinkKey(link.code, masterKey);
        finish(link, "Message link created");
        setMessage("");
      },
      {
        onError: (error) => reportError(error, "Could not create message link"),
        onSettled: () => {
          masterKey?.fill(0);
          stop();
        },
      }
    );
  };

  const createFile = async () => {
    if (!file || !checkPassword() || !start()) {
      return;
    }
    const controller = new AbortController();
    upload.current = controller;
    const progressTransfer = beginFileTransfer({
      direction: "upload",
      name: file.name,
      totalBytes: file.size,
      phase: "Encrypting",
      onCancel: () => controller.abort(),
    });
    setPhase("Encrypting");
    setProgress(0);
    await attempt(
      async () => {
        await withPreparedFile(
          file,
          {},
          async (prepared) => {
            setPhase("Uploading");
            setProgress(0);
            progressTransfer.update("Uploading", 0, prepared.file.size);
            const transfer = await createFileTransfer(token, {
              filename: prepared.file.name,
              byteSize: prepared.file.size,
              contentType: prepared.file.type || "application/octet-stream",
              secret: prepared.secret,
              expiration,
            });
            const completed = await uploadFile(
              token,
              transfer.transfer.id,
              transfer.upload,
              prepared.file,
              (ratio) => {
                setProgress(ratio);
                progressTransfer.update("Uploading", ratio, prepared.file.size);
              },
              controller.signal,
              password ?? undefined,
              prepared.signals
            );
            if (!completed.short_link) {
              throw new Error("Could not create link");
            }
            rememberLinkKey(completed.short_link.code, prepared.masterKey);
            finish(completed.short_link, "File link created");
            setAttachment(null);
          },
          controller.signal,
          (ratio) => {
            setProgress(ratio);
            progressTransfer.update("Encrypting", ratio, file.size);
          }
        );
        progressTransfer.done();
      },
      {
        onError: (error) => {
          if (controller.signal.aborted) {
            progressTransfer.cancel();
          } else {
            progressTransfer.fail();
            reportError(error, "Could not create file link");
          }
        },
        onSettled: () => {
          upload.current = null;
          setProgress(null);
          stop();
        },
      }
    );
  };

  const copy = async () => {
    if (!created) {
      return;
    }
    try {
      await navigator.clipboard.writeText(linkPageUrl(created.code));
      setCopyStatus("copied");
      clearTimeout(copyResetTimer.current);
      copyResetTimer.current = window.setTimeout(() => {
        setCopyStatus("copy");
      }, 2000);
    } catch (error) {
      reportError(error, "Could not copy link");
    }
  };

  const formProps = {
    busy,
    expiration,
    onExpirationChange: setExpiration,
    password,
    onPasswordChange: setPassword,
    passwordTooShort,
    onCancel: () => setKind(null),
  };

  return (
    <section className="min-w-0" aria-label="Create a link">
      <MorphingView viewId={kind ?? "choose"}>
        <div className="flex min-w-0 flex-col">
          <PanelHeader
            selected={selected}
            busy={busy}
            backButton={backButton}
            onBack={() => setKind(null)}
            onClose={onClose}
          />
          {kind === null ? (
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="sr-only">Link type</legend>
              {choices.map((choice) => {
                const Icon = choice.icon;
                return (
                  <button
                    ref={(node) => {
                      optionButtons.current[choice.kind] = node;
                    }}
                    key={choice.kind}
                    type="button"
                    className="bg-foreground/[0.04] text-foreground hover:bg-foreground/[0.08] flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] motion-reduce:transform-none"
                    onClick={() => setKind(choice.kind)}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {choice.label}
                  </button>
                );
              })}
            </fieldset>
          ) : null}
          {kind === "url" ? (
            <UrlLinkForm
              {...formProps}
              value={url}
              onValueChange={setUrl}
              onSubmit={() => void shorten()}
            />
          ) : null}
          {kind === "text" ? (
            <MessageLinkForm
              {...formProps}
              id={messageId}
              value={message}
              onValueChange={setMessage}
              onSubmit={() => void createMessage()}
            />
          ) : null}
          {kind === "file" ? (
            <div className="flex flex-col gap-4">
              <div inert={busy}>
                <AttachmentUpload
                  value={attachment ? [attachment] : []}
                  onValueChange={(items) => setAttachment(items[0] ?? null)}
                  multiple={false}
                  maxFiles={1}
                  maxFileSize={maxFileBytes}
                  disabled={busy}
                  title="Choose or drop a file"
                  description="Choose one file to encrypt and share"
                  attachmentsLabel="Selected file"
                  classNames={{ dropzone: "min-h-44 rounded-2xl py-6" }}
                  onFilesRejected={(rejected, reason) => {
                    reportError(
                      new Error(rejected.map((item) => item.name).join(", ")),
                      reason === "too-large"
                        ? "File too large"
                        : "Too many files"
                    );
                  }}
                />
              </div>
              {file && file.size > 100 * 1024 ** 2 ? (
                <p className="text-muted-foreground text-xs leading-snug">
                  Over 100 MiB: saving needs disk space and file-save support
                  (e.g. Chrome or Edge).
                </p>
              ) : null}
              {busy ? (
                <UploadProgress
                  phase={phase}
                  progress={progress}
                  onCancel={() => upload.current?.abort()}
                />
              ) : (
                <>
                  <ExpirationOptions
                    value={expiration}
                    onChange={setExpiration}
                    kind="file"
                    compact
                  />
                  <PasswordOptions
                    password={password}
                    onChange={setPassword}
                    compact
                  />
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      className={cancelButtonClass}
                      onClick={() => setKind(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={actionButtonClass}
                      disabled={!file || passwordTooShort}
                      onClick={() => {
                        void createFile();
                      }}
                    >
                      Create file link
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}
          {created && showCopyLink(kind, { file, password, busy }) ? (
            <ActionSwapCascadeButton
              aria-live="polite"
              className="mt-5 w-full"
              cycle={false}
              items={copyLinkItems}
              size="lg"
              value={copyStatus}
              variant="secondary"
              onClick={() => {
                void copy();
              }}
            />
          ) : null}
          {busy ? null : (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground mt-4 cursor-pointer self-start text-xs underline underline-offset-2"
              onClick={onViewHistory}
            >
              View link history
            </button>
          )}
        </div>
      </MorphingView>
    </section>
  );
}
