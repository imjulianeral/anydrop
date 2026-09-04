import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { FilePreview } from "#/components/file-preview.tsx";
import { Button } from "#/components/motion/button/index.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { ThemeSwitch } from "#/components/theme-switch.tsx";
import { getShortLink, type ShortLink } from "#/lib/api.ts";

export const Route = createFileRoute("/s/$code")({
  component: ShortLinkPage,
});

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background relative min-h-svh">
      <ThemeSwitch className="absolute top-4 right-4" />
      {children}
    </div>
  );
}

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
          setError(caught instanceof Error ? caught.message : "Link not found");
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
      <PageShell>
        <main className="flex min-h-svh items-center justify-center p-6">
          <p className="text-muted-foreground text-sm">{error}</p>
        </main>
      </PageShell>
    );
  }

  if (!drop) {
    return (
      <PageShell>
        <main className="flex min-h-svh items-center justify-center p-6">
          <Loader label="Opening link" variant="dots" />
        </main>
      </PageShell>
    );
  }

  if (drop.kind === "text") {
    return (
      <PageShell>
        <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center gap-4 p-6">
          <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">
            Message
          </p>
          <p className="text-lg whitespace-pre-wrap">{drop.body}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void copyMessage();
            }}
          >
            Copy
          </Button>
        </main>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center gap-4 p-6">
        <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">
          File
        </p>
        <FilePreview
          byteSize={drop.byte_size}
          contentType={drop.content_type}
          downloadUrl={drop.download?.url}
          filename={drop.filename}
        />
      </main>
    </PageShell>
  );
}
