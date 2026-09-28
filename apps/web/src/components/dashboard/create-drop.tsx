import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { PromptInput } from "#/components/agents/prompt-input.tsx";
import { useAppSession } from "#/components/app-session.tsx";
import { ExpirationOptions } from "#/components/expiration-options.tsx";
import { AttachmentUpload } from "#/components/motion/attachment-upload.tsx";
import type { AttachmentUploadItem } from "#/components/motion/attachment-upload.tsx";
import { Button } from "#/components/motion/button/index.tsx";
import { Input } from "#/components/motion/input.tsx";
import { MorphingModal } from "#/components/motion/morphing-modal.tsx";
import { PasswordOptions } from "#/components/password-options.tsx";
import {
  ChevronLeft,
  FileIcon,
  Link2,
  MessageSquare,
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
import { beginFileTransfer } from "#/lib/file-transfers.ts";
import type { FileTransferHandle } from "#/lib/file-transfers.ts";
import { withPreparedFile } from "#/lib/large-secrets.ts";
import { linkPageUrl, rememberLinkKey } from "#/lib/link-keys.ts";
import { prepareText } from "#/lib/secrets.ts";
import { toast } from "#/lib/toast.ts";
import { uploadFile } from "#/lib/upload.ts";

export type CreateView = "choose" | "message" | "link" | "file";

const reportError = (error: unknown, title: string) => {
  toast.add({
    description: error instanceof Error ? error.message : undefined,
    title,
    type: "error",
  });
};

export const copyLink = async (code: string) => {
  const url = linkPageUrl(code);
  await navigator.clipboard.writeText(url);
  toast.add({ description: url, title: "Link copied", type: "success" });
};

const choices = [
  {
    id: "message" as const,
    title: "Message",
    description: "Share text as a public drop.",
    icon: MessageSquare,
  },
  {
    id: "link" as const,
    title: "Link",
    description: "Shorten a URL and optionally require a password.",
    icon: Link2,
  },
  {
    id: "file" as const,
    title: "File",
    description: "Upload a file and get a download link.",
    icon: FileIcon,
  },
];

/** The message, URL and file drop flow, in a modal driven by `view`. */
export function CreateDrop({
  view,
  onViewChange: setView,
  onCreated,
}: {
  view: CreateView | null;
  onViewChange: (view: CreateView | null) => void;
  onCreated: (link: ShortLink) => void;
}) {
  const { token } = useAppSession();
  const [attachments, setAttachments] = useState<AttachmentUploadItem[]>([]);
  const [shortInput, setShortInput] = useState("");
  const [message, setMessage] = useState("");
  const [expiration, setExpiration] = useState(defaultExpiration);
  const [password, setPassword] = useState<string | null>(null);
  const passwordTooShort = password !== null && password.trim().length < 12;
  const sendingRef = useRef(false);
  const [shortening, setShortening] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState("Uploading");
  const upload = useRef<AbortController | null>(null);
  useEffect(() => () => upload.current?.abort(), []);

  useEffect(() => {
    if (view === null) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !sending &&
        !shortening
      ) {
        setView(null);
        setExpiration(defaultExpiration);
        setPassword(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [view, sending, shortening, setView]);

  const closeCreate = () => {
    if (sending || shortening) {
      return;
    }
    setView(null);
    setExpiration(defaultExpiration);
    setPassword(null);
    setShortInput("");
    setMessage("");
    setProgress(null);
    setAttachments([]);
  };

  const rememberLink = (link: ShortLink) => {
    onCreated(link);
    void copyLink(link.code).catch(() => {
      toast.add({
        title: "Link created",
        description: "Use Copy to copy your link.",
        type: "success",
      });
    });
    setView(null);
    setExpiration(defaultExpiration);
    setPassword(null);
    setShortInput("");
    setMessage("");
    setProgress(null);
    setAttachments([]);
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

  const sendText = async (body: string) => {
    if (sendingRef.current) {
      return;
    }
    if (!checkPassword()) {
      return;
    }
    sendingRef.current = true;
    setSending(true);
    let masterKey: Uint8Array | undefined;
    await attempt(
      async () => {
        const prepared = await prepareText(body);
        ({ masterKey } = prepared);
        const created = await createTextTransfer(token, {
          body: prepared.body,
          secret: prepared.secret,
          expiration,
          password: password ?? undefined,
        });
        if (!created.short_link) {
          throw new Error("Could not create link");
        }
        rememberLinkKey(created.short_link.code, masterKey);
        rememberLink(created.short_link);
      },
      {
        onError: (error) => {
          reportError(error, "Could not send");
        },
        onSettled: () => {
          masterKey?.fill(0);
          sendingRef.current = false;
          setSending(false);
        },
      }
    );
  };

  const sendFiles = async (files: File[]) => {
    if (sendingRef.current) {
      return;
    }
    if (!checkPassword()) {
      return;
    }
    const allowed = files.filter((file) => file.size <= maxFileBytes);
    if (allowed.length === 0) {
      return;
    }
    sendingRef.current = true;
    setSending(true);
    const controller = new AbortController();
    upload.current = controller;
    let currentTransfer: FileTransferHandle | null = null;
    await attempt(
      async () => {
        /* Sequential so the progress bar tracks one file at a time. */
        /* oxlint-disable eslint/no-await-in-loop */
        for (const file of allowed) {
          currentTransfer = beginFileTransfer({
            direction: "upload",
            name: file.name,
            totalBytes: file.size,
            phase: "Encrypting",
            onCancel: () => controller.abort(),
          });
          const transferProgress = currentTransfer;
          setProgress(0);
          setPhase("Encrypting");
          await withPreparedFile(
            file,
            {},
            async (prepared) => {
              setPhase("Uploading");
              setProgress(0);
              transferProgress.update("Uploading", 0, prepared.file.size);
              const created = await createFileTransfer(token, {
                filename: prepared.file.name,
                byteSize: prepared.file.size,
                contentType: prepared.file.type || "application/octet-stream",
                secret: prepared.secret,
                expiration,
              });
              const completed = await uploadFile(
                token,
                created.transfer.id,
                created.upload,
                prepared.file,
                (ratio) => {
                  setProgress(ratio);
                  transferProgress.update(
                    "Uploading",
                    ratio,
                    prepared.file.size
                  );
                },
                controller.signal,
                password ?? undefined,
                prepared.signals
              );
              if (!completed.short_link) {
                throw new Error("Could not create link");
              }
              rememberLinkKey(completed.short_link.code, prepared.masterKey);
              rememberLink(completed.short_link);
            },
            controller.signal,
            (ratio) => {
              setProgress(ratio);
              transferProgress.update("Encrypting", ratio, file.size);
            }
          );
          transferProgress.done();
          currentTransfer = null;
        }
        /* oxlint-enable eslint/no-await-in-loop */
      },
      {
        onError: (error) => {
          if (controller.signal.aborted) {
            currentTransfer?.cancel();
          } else {
            currentTransfer?.fail();
            reportError(error, "Upload failed");
          }
        },
        onSettled: () => {
          upload.current = null;
          sendingRef.current = false;
          setSending(false);
          setProgress(null);
        },
      }
    );
  };

  const shortenUrl = async () => {
    const url = shortInput.trim();
    if (url === "") {
      return;
    }
    if (!checkPassword()) {
      return;
    }
    setShortening(true);
    await attempt(
      async () => {
        const created = await createShortLink(
          token,
          url,
          expiration,
          password ?? undefined
        );
        rememberLink(created.short_link);
      },
      {
        onError: (error) => {
          reportError(error, "Could not shorten");
        },
        onSettled: () => {
          setShortening(false);
        },
      }
    );
  };

  return (
    <MorphingModal
      className="max-h-full max-w-md overflow-y-auto"
      placement="bottom"
      viewId={view}
      onClose={closeCreate}
    >
      {view === "choose" ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-lg">Create a drop</h3>
            <p className="text-muted-foreground text-sm">
              Choose what you want to share.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {choices.map((choice) => {
              const Icon = choice.icon;
              return (
                <button
                  key={choice.id}
                  className="bg-foreground/[0.04] hover:bg-foreground/[0.08] flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                  type="button"
                  onClick={() => {
                    setView(choice.id);
                  }}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span>{choice.title}</span>
                    <span className="text-muted-foreground text-sm font-normal">
                      {choice.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === "message" ? (
        <CreatePane
          title="Message"
          onBack={() => {
            setView("choose");
          }}
        >
          <ExpirationOptions
            value={expiration}
            onChange={setExpiration}
            disabled={sending}
            kind="text"
          />
          <PasswordOptions
            password={password}
            onChange={setPassword}
            disabled={sending}
          />
          <PromptInput
            disabled={sending}
            loading={sending}
            maxLength={maxTextBytes}
            maxRows={8}
            minRows={3}
            placeholder="Write a message"
            value={message}
            onSubmit={(body) => {
              void sendText(body);
            }}
            onValueChange={setMessage}
          />
        </CreatePane>
      ) : null}

      {view === "link" ? (
        <CreatePane
          title="Link"
          onBack={() => {
            setView("choose");
          }}
        >
          <div className="flex flex-col gap-3">
            <ExpirationOptions
              value={expiration}
              onChange={setExpiration}
              disabled={shortening}
              kind="url"
            />
            <PasswordOptions
              password={password}
              onChange={setPassword}
              disabled={shortening}
            />
            <Input
              label="URL"
              placeholder="https://"
              value={shortInput}
              onChange={setShortInput}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void shortenUrl();
                }
              }}
            />
            <button
              className="bg-foreground text-background inline-flex h-10 w-full items-center justify-center rounded-full text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
              disabled={
                shortening ||
                shortInput.trim() === "" ||
                (password !== null && password.trim().length < 12)
              }
              type="button"
              onClick={() => {
                void shortenUrl();
              }}
            >
              Shorten
            </button>
          </div>
        </CreatePane>
      ) : null}

      {view === "file" ? (
        <CreatePane
          title="File"
          onBack={() => {
            setView("choose");
          }}
        >
          <ExpirationOptions
            value={expiration}
            onChange={setExpiration}
            disabled={sending}
            kind="file"
          />
          <PasswordOptions
            password={password}
            onChange={setPassword}
            disabled={sending}
          />
          <p className="text-muted-foreground text-sm">
            Files over 100 MiB need temporary disk space to send and a browser
            with file-save support to receive, such as desktop Chrome or Edge.
          </p>
          <div className="flex flex-col gap-3">
            <div inert={sending}>
              <AttachmentUpload
                value={attachments}
                onValueChange={setAttachments}
                onFilesAdded={(_, files) => {
                  void sendFiles(files);
                }}
                onFilesRejected={(rejected, reason) => {
                  reportError(
                    new Error(rejected.map((file) => file.name).join(", ")),
                    reason === "too-large" ? "File too large" : "Too many files"
                  );
                }}
                maxFiles={Number.MAX_SAFE_INTEGER}
                maxFileSize={maxFileBytes}
                disabled={sending}
                title="Choose or drop files"
                description="Files upload when added"
                attachmentsLabel="Files"
                classNames={{ dropzone: "min-h-36 rounded-2xl" }}
              />
            </div>
            {progress === null ? null : (
              <div className="bg-muted h-1 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full origin-left scale-x-(--progress) transition-transform"
                  style={{ "--progress": progress }}
                />
              </div>
            )}
            {sending ? (
              <div className="flex items-center justify-between gap-3">
                <output
                  aria-live="polite"
                  className="text-muted-foreground text-sm"
                >
                  {phase} · {Math.round((progress ?? 0) * 100)}%
                </output>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => upload.current?.abort()}
                >
                  Cancel
                </Button>
              </div>
            ) : null}
          </div>
        </CreatePane>
      ) : null}
    </MorphingModal>
  );
}

function CreatePane({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <Button
          aria-label="Back"
          size="icon"
          type="button"
          variant="ghost"
          onClick={onBack}
        >
          <ChevronLeft />
        </Button>
        <h3 className="font-heading text-lg">{title}</h3>
      </div>
      {children}
    </div>
  );
}
