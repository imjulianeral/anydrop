import { Copy, Link2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { ChatComposer } from "#/components/chat-composer.tsx";
import { EmptyState } from "#/components/empty-state.tsx";
import { FilePreview } from "#/components/file-preview.tsx";
import { AnimatedBadge } from "#/components/motion/animated-badge.tsx";
import { Button } from "#/components/motion/button/index.tsx";
import { Input } from "#/components/motion/input.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { toast } from "#/components/toast-host.tsx";
import {
  completeTransfer,
  createFileTransfer,
  createShortLink,
  createTextTransfer,
  listShortLinks,
  shortPageUrl,
  type ShortLink,
} from "#/lib/api.ts";
import { uploadFile } from "#/lib/upload.ts";

const reportError = (error: unknown, title: string) => {
  toast.add({
    description: error instanceof Error ? error.message : undefined,
    title,
    type: "error",
  });
};

const linkLabel = (link: ShortLink): string => {
  if (link.kind === "url") {
    return link.url ?? "URL";
  }
  if (link.kind === "text") {
    const body = link.body?.trim();
    return body === undefined || body === "" ? "Message" : body;
  }
  return link.filename ?? "File";
};

export function LinksPage() {
  const { token } = useAppSession();
  const [shortInput, setShortInput] = useState("");
  const [shortening, setShortening] = useState(false);
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const payload = await listShortLinks(token);
        if (!cancelled) {
          setLinks(payload.short_links);
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

  const copyLink = async (code: string) => {
    const url = shortPageUrl(code);
    await navigator.clipboard.writeText(url);
    toast.add({ description: url, title: "Link copied", type: "success" });
  };

  const rememberLink = async (link: ShortLink) => {
    setLinks((current) => [
      link,
      ...current.filter((item) => item.code !== link.code),
    ]);
    await copyLink(link.code);
  };

  const sendText = async (body: string) => {
    setSending(true);
    try {
      const created = await createTextTransfer(token, { body });
      await rememberLink(created.short_link);
    } catch (error) {
      reportError(error, "Could not send");
    } finally {
      setSending(false);
    }
  };

  const sendFiles = async (files: File[]) => {
    setSending(true);
    try {
      /* Sequential so the progress bar tracks one file at a time. */
      /* oxlint-disable eslint/no-await-in-loop */
      for (const file of files) {
        setProgress(0);
        const created = await createFileTransfer(token, {
          filename: file.name,
          byteSize: file.size,
          contentType: file.type || "application/octet-stream",
        });
        await uploadFile(
          created.upload.url,
          file,
          created.upload.headers,
          setProgress
        );
        const completed = await completeTransfer(token, created.transfer.id);
        await rememberLink(completed.short_link);
      }
      /* oxlint-enable eslint/no-await-in-loop */
    } catch (error) {
      reportError(error, "Upload failed");
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  const shortenUrl = async () => {
    const url = shortInput.trim();
    if (url === "") {
      return;
    }
    setShortening(true);
    try {
      const created = await createShortLink(token, url);
      const shortUrl = shortPageUrl(created.short_link.code);
      setLinks((current) => [
        created.short_link,
        ...current.filter((link) => link.code !== created.short_link.code),
      ]);
      setShortInput("");
      await navigator.clipboard.writeText(shortUrl);
      toast.add({ title: "Short link copied", type: "success" });
    } catch (error) {
      reportError(error, "Could not shorten");
    } finally {
      setShortening(false);
    }
  };

  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <header className="flex shrink-0 flex-col gap-1">
        <h2 className="font-heading text-lg">Links</h2>
        <p className="text-muted-foreground text-sm">
          Shorten a URL, or drop a file or message as a public link.
        </p>
      </header>

      <div className="flex shrink-0 items-end gap-2">
        <Input
          className="min-w-0 flex-1"
          id="shorten-url"
          label="Shorten a URL"
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
        <Button
          disabled={shortening || shortInput.trim() === ""}
          type="button"
          variant="outline"
          onClick={() => {
            void shortenUrl();
          }}
        >
          Shorten
        </Button>
      </div>

      <section className="flex shrink-0 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">Share a drop</h3>
          <p className="text-muted-foreground text-sm">
            Anyone with the link can open it. Drops expire after 24 hours.
          </p>
        </div>
        <ChatComposer
          progress={progress}
          sending={sending}
          variant="drop"
          onSendFiles={sendFiles}
          onSendText={sendText}
        />
      </section>

      <section className="border-border/70 bg-card/40 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border">
        {loading ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <Loader label="Loading links" variant="dots" />
          </div>
        ) : links.length === 0 ? (
          <EmptyState
            className="flex-1"
            description="Shorten a URL, or share a file or message, and it will show up here."
            icon={<Link2 />}
            title="No live links yet"
          />
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {links.map((link) => {
              const shortUrl = shortPageUrl(link.code);
              return (
                <li
                  key={link.code}
                  className="border-border/70 bg-card/80 flex flex-col gap-3 rounded-3xl border p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <AnimatedBadge
                          showIcon={false}
                          size="sm"
                          status="neutral"
                        >
                          {link.kind}
                        </AnimatedBadge>
                        <p className="truncate text-sm">{linkLabel(link)}</p>
                      </div>
                      <p className="text-muted-foreground truncate font-mono text-xs">
                        {shortUrl}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        void copyLink(link.code);
                      }}
                    >
                      <Copy />
                      Copy
                    </Button>
                  </div>
                  {link.kind === "file" ? (
                    <FilePreview
                      byteSize={link.byte_size}
                      contentType={link.content_type}
                      downloadUrl={link.download?.url}
                      filename={link.filename}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
