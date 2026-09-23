import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { PromptInput } from "#/components/agents/prompt-input.tsx";
import { useAppSession } from "#/components/app-session.tsx";
import { EmptyState } from "#/components/empty-state.tsx";
import { ExpirationOptions } from "#/components/expiration-options.tsx";
import { ExpiryCountdown } from "#/components/expiry-countdown.tsx";
import { LinkDetails } from "#/components/link-details.tsx";
import { LinksActivityChart } from "#/components/links-activity-chart.tsx";
import { AnimatedBadge } from "#/components/motion/animated-badge.tsx";
import { Button } from "#/components/motion/button/index.tsx";
import { Input } from "#/components/motion/input.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { MorphingModal } from "#/components/motion/morphing-modal.tsx";
import { PasswordOptions } from "#/components/password-options.tsx";
import {
  ChevronLeft,
  Copy,
  Download,
  Eye,
  FileIcon,
  Link2,
  MessageSquare,
  Plus,
} from "#/components/rune-icons.tsx";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "#/components/ui/dialog.tsx";
import {
  createFileTransfer,
  createShortLink,
  createTextTransfer,
  listShortLinks,
} from "#/lib/api.ts";
import type { LinkStat, ShortLink } from "#/lib/api.ts";
import { maxFileBytes, maxTextBytes } from "#/lib/config.ts";
import { defaultExpiration } from "#/lib/expiration-options.ts";
import { limitReached } from "#/lib/expiry.ts";
import { withPreparedFile } from "#/lib/large-secrets.ts";
import {
  applyShortLinkEventToLink,
  applyShortLinkEventToStats,
  readShortLinkEvent,
  statsFromEvents,
} from "#/lib/link-events.ts";
import { linkPageUrl, rememberLinkKey } from "#/lib/link-keys.ts";
import { displayFilename } from "#/lib/media.ts";
import { prepareText } from "#/lib/secrets.ts";
import { toast } from "#/lib/toast.ts";
import { uploadFile } from "#/lib/upload.ts";
import { cn } from "#/lib/utils.ts";

type CreateView = "choose" | "message" | "link" | "file";

const reportError = (error: unknown, title: string) => {
  toast.add({
    description: error instanceof Error ? error.message : undefined,
    title,
    type: "error",
  });
};

const linkLabel = (link: ShortLink): string => {
  if (link.secret) {
    return link.kind === "file" ? "Secret file" : "Secret message";
  }
  if (link.kind === "url") {
    return link.url ?? "URL";
  }
  if (link.kind === "text") {
    const body = link.body?.trim();
    return body === undefined || body === "" ? "Message" : body;
  }
  return displayFilename(link.filename);
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

export function LinksPage() {
  const { token, subscribeToEvents } = useAppSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<CreateView | null>(null);
  const [shortInput, setShortInput] = useState("");
  const [message, setMessage] = useState("");
  const [expiration, setExpiration] = useState(defaultExpiration);
  const [password, setPassword] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const [shortening, setShortening] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState("Uploading");
  const upload = useRef<AbortController | null>(null);
  useEffect(() => () => upload.current?.abort(), []);
  const [dragging, setDragging] = useState(false);
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [stats, setStats] = useState<LinkStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const payload = await listShortLinks(token);
        if (!cancelled) {
          setLinks(payload.short_links);
          setStats(statsFromEvents(payload.events ?? []));
        }
      } catch (error) {
        if (!cancelled) {
          reportError(error, "Could not load links");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(
    () =>
      subscribeToEvents((payload) => {
        const event = readShortLinkEvent(payload);
        if (!event) {
          return;
        }
        setLinks((current) =>
          current.map((item) => applyShortLinkEventToLink(item, event))
        );
        setStats((current) => applyShortLinkEventToStats(current, event));
      }),
    [subscribeToEvents]
  );

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
  }, [view, sending, shortening]);

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
    setDragging(false);
  };

  const copyLink = async (code: string) => {
    const url = linkPageUrl(code);
    await navigator.clipboard.writeText(url);
    toast.add({ description: url, title: "Link copied", type: "success" });
  };

  const rememberLink = (link: ShortLink) => {
    setLinks((current) => [
      link,
      ...current.filter((item) => item.code !== link.code),
    ]);
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
  };

  const sendText = async (body: string) => {
    if (sendingRef.current) {
      return;
    }
    sendingRef.current = true;
    setSending(true);
    let masterKey: Uint8Array | undefined;
    try {
      const prepared = await prepareText(body);
      ({ masterKey } = prepared);
      const created = await createTextTransfer(token, {
        body: prepared.body,
        secret: prepared.secret,
        expiration,
      });
      if (!created.short_link) {
        throw new Error("Could not create link");
      }
      rememberLinkKey(created.short_link.code, masterKey);
      rememberLink(created.short_link);
    } catch (error) {
      reportError(error, "Could not send");
    } finally {
      masterKey?.fill(0);
      sendingRef.current = false;
      setSending(false);
    }
  };

  const sendFiles = async (files: File[]) => {
    if (sendingRef.current) {
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
    try {
      /* Sequential so the progress bar tracks one file at a time. */
      /* oxlint-disable eslint/no-await-in-loop */
      for (const file of allowed) {
        setProgress(0);
        setPhase("Encrypting");
        await withPreparedFile(
          file,
          {},
          async (prepared) => {
            setPhase("Uploading");
            setProgress(0);
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
              setProgress,
              controller.signal
            );
            if (!completed.short_link) {
              throw new Error("Could not create link");
            }
            rememberLinkKey(completed.short_link.code, prepared.masterKey);
            rememberLink(completed.short_link);
          },
          controller.signal,
          setProgress
        );
      }
      /* oxlint-enable eslint/no-await-in-loop */
    } catch (error) {
      reportError(error, "Upload failed");
    } finally {
      upload.current = null;
      sendingRef.current = false;
      setSending(false);
      setProgress(null);
    }
  };

  const shortenUrl = async () => {
    const url = shortInput.trim();
    if (url === "") {
      return;
    }
    if (password !== null && password.trim().length < 12) {
      toast.add({
        title: "Use a longer password",
        description: "Use a password or passphrase with 12–1024 characters.",
        type: "error",
      });
      return;
    }
    setShortening(true);
    try {
      const created = await createShortLink(
        token,
        url,
        expiration,
        password ?? undefined
      );
      rememberLink(created.short_link);
    } catch (error) {
      reportError(error, "Could not shorten");
    } finally {
      setShortening(false);
    }
  };

  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col gap-6 px-6 pt-8 pb-(--app-dock-space)">
      <header className="flex shrink-0 items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg">Links</h2>
          <p className="text-muted-foreground text-sm">
            Every message and file is encrypted. A short link can require a
            password before it opens.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setView("choose");
          }}
        >
          <Plus />
          Create
        </Button>
      </header>

      {loading || stats.length === 0 ? null : (
        <LinksActivityChart stats={stats} />
      )}

      <section className="border-border/70 bg-card/40 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border">
        {loading ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <Loader label="Loading links" variant="dots" />
          </div>
        ) : links.length === 0 ? (
          <EmptyState
            className="flex-1"
            description="Create a message, link, or file drop and it will show up here."
            icon={<Link2 />}
            title="No live links yet"
          />
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {links.map((item) => (
              <LinkListItem
                key={item.code}
                item={item}
                token={token}
                onCopy={copyLink}
              />
            ))}
          </ul>
        )}
      </section>

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
            <p className="text-muted-foreground text-sm">
              Files over 100 MiB need temporary disk space to send and a browser
              with file-save support to receive, such as desktop Chrome or Edge.
            </p>
            <div className="flex flex-col gap-3">
              <button
                className={cn(
                  "rounded-3xl border border-dashed px-6 py-10 text-center",
                  dragging
                    ? "border-foreground/40 bg-muted/60"
                    : "border-border"
                )}
                disabled={sending}
                type="button"
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                onDragLeave={() => {
                  setDragging(false);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  void sendFiles([...event.dataTransfer.files]);
                }}
              >
                <p className="font-medium">Drop files here</p>
                <p className="text-muted-foreground text-sm">
                  or click to browse
                </p>
              </button>
              {progress === null ? null : (
                <div className="bg-muted h-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full origin-left transition-transform"
                    style={{ transform: `scaleX(${progress})` }}
                  />
                </div>
              )}
              {sending ? (
                <div className="flex items-center justify-between gap-3">
                  <output className="text-muted-foreground text-sm">
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
              <input
                ref={fileInputRef}
                className="sr-only"
                disabled={sending}
                multiple
                type="file"
                onChange={(event) => {
                  void sendFiles([...(event.target.files ?? [])]);
                  event.target.value = "";
                }}
              />
            </div>
          </CreatePane>
        ) : null}
      </MorphingModal>
    </main>
  );
}

function LinkListItem({
  item,
  token,
  onCopy,
}: {
  item: ShortLink;
  token: string;
  onCopy: (code: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const label = linkLabel(item);

  return (
    <li className="border-border/70 bg-card/80 relative rounded-3xl border">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          aria-label={`View activity for ${label}`}
          className="hover:bg-muted/50 focus-visible:ring-ring/50 absolute inset-0 cursor-pointer rounded-3xl transition-colors focus-visible:ring-3 focus-visible:outline-none"
        />
        <div className="pointer-events-none relative flex items-start justify-between gap-4 p-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <AnimatedBadge showIcon={false} size="sm" status="neutral">
                {item.secret ? "Secret" : item.kind}
              </AnimatedBadge>
              <p className="truncate text-sm">{label}</p>
            </div>
            <p className="text-muted-foreground truncate font-mono text-xs">
              {linkPageUrl(item.code)}
            </p>
            <p className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs tabular-nums">
              <span className="flex items-center gap-1">
                <Eye aria-hidden="true" className="size-3.5" />
                {item.view_count ?? 0}
                <span className="sr-only"> views</span>
              </span>
              {item.kind === "file" ? (
                <span className="flex items-center gap-1">
                  <Download aria-hidden="true" className="size-3.5" />
                  {item.download_count ?? 0}
                  <span className="sr-only"> downloads</span>
                </span>
              ) : null}
              {item.password_protected ? <span>Password required</span> : null}
              <ExpiryCountdown
                createdAt={item.created_at}
                expiresAt={item.expires_at}
                expired={limitReached(
                  item.max_downloads,
                  item.kind === "file" ? item.download_count : item.view_count
                )}
              />
            </p>
          </div>
          <Button
            className="pointer-events-auto shrink-0"
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => {
              void onCopy(item.code);
            }}
          >
            <Copy aria-hidden="true" />
            Copy
          </Button>
        </div>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          {open ? (
            <LinkDetails label={label} link={item} token={token} />
          ) : null}
        </DialogContent>
      </Dialog>
    </li>
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
