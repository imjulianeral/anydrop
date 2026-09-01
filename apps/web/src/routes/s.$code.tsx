import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "#/components/ui/button.tsx";
import { getShortLink, resolveAssetUrl, type ShortLink } from "#/lib/api.ts";

export const Route = createFileRoute("/s/$code")({
  component: ShortLinkPage,
});

function ShortLinkPage() {
  const { code } = Route.useParams();
  const [error, setError] = useState<string | null>(null);
  const [drop, setDrop] = useState<ShortLink | null>(null);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      try {
        const payload = await getShortLink(code);
        if (cancelled) {
          return;
        }
        if (payload.short_link.kind === "url" && payload.short_link.url) {
          globalThis.location.replace(payload.short_link.url);
          return;
        }
        setDrop(payload.short_link);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Link not found"
          );
        }
      }
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const copyMessage = async () => {
    if (!drop?.body) {
      return;
    }
    await navigator.clipboard.writeText(drop.body);
  };

  if (error) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">{error}</p>
      </main>
    );
  }

  if (!drop) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">Opening link…</p>
      </main>
    );
  }

  if (drop.kind === "text") {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center gap-4 p-6">
        <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">
          Message
        </p>
        <p className="whitespace-pre-wrap text-lg">{drop.body}</p>
        <Button
          variant="outline"
          onClick={() => {
            void copyMessage();
          }}
        >
          Copy
        </Button>
      </main>
    );
  }

  const downloadUrl = drop.download?.url
    ? resolveAssetUrl(drop.download.url)
    : null;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center gap-4 p-6">
      <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">
        File
      </p>
      <p className="text-lg">{drop.filename ?? "File"}</p>
      {downloadUrl ? (
        <a className={buttonVariants()} href={downloadUrl} rel="noopener">
          Download
        </a>
      ) : (
        <p className="text-muted-foreground text-sm">This file is not ready.</p>
      )}
    </main>
  );
}
