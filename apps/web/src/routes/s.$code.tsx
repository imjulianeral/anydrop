import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";

import { ExpiryCountdown } from "#/components/expiry-countdown.tsx";
import {
  Button,
  MagneticButtonLink,
} from "#/components/motion/button/index.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { ShaderBackground } from "#/components/motion/shader-background.tsx";
import { ThemeSwitch } from "#/components/theme-switch.tsx";
import FolderComponent from "#/components/ui/folder-component.tsx";
import { getShortLink, resolveAssetUrl, type ShortLink } from "#/lib/api.ts";

export const Route = createFileRoute("/s/$code")({
  component: ShortLinkPage,
});

function NeuroPageBackground() {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";

  return (
    <ShaderBackground
      className="pointer-events-none absolute inset-0"
      colorBack={isLight ? "#ffffff" : "#000000"}
      colorFront={isLight ? "#0a0a0a" : "#ffffff"}
      colorMid="#47a6ff"
      speed={0.4}
      variant="neuro-noise"
    />
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background relative min-h-svh overflow-hidden">
      <NeuroPageBackground />
      <ThemeSwitch className="absolute top-4 right-4 z-10" />
      <div className="relative z-10">{children}</div>
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
          <ExpiryCountdown expiresAt={drop.expires_at} />
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
      <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center p-6">
        <div className="flex flex-col gap-4 rounded-2xl bg-black p-6 text-white">
          <FolderComponent className="h-auto" size="md" />
          {drop.filename ? (
            <p className="truncate text-center font-medium">{drop.filename}</p>
          ) : null}
          <ExpiryCountdown className="text-white/60" expiresAt={drop.expires_at} />
          {drop.track_download ? (
            <MagneticButtonLink
              className="w-full"
              href={resolveAssetUrl(drop.track_download)}
              magneticClassName="w-full"
              rel="noopener"
              target="_blank"
            >
              <Download aria-hidden="true" />
              Download
            </MagneticButtonLink>
          ) : null}
        </div>
      </main>
    </PageShell>
  );
}
