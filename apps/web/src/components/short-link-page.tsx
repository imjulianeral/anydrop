import { getRouteApi } from "@tanstack/react-router";
import { ArrowUpRight, Copy, Download, Send } from "lucide-react";
import { useScroll } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ExpiryCountdown } from "#/components/expiry-countdown.tsx";
import {
  MagneticButton,
  MagneticButtonLink,
} from "#/components/motion/button/magnetic.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { ScrollProgress } from "#/components/motion/scroll-progress.tsx";
import { ShaderBackground } from "#/components/motion/shader-background.tsx";
import { ThemeSwitch } from "#/components/theme-switch.tsx";
import FolderComponent from "#/components/ui/folder-component.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { resolveAssetUrl } from "#/lib/api.ts";
import { formatBytes } from "#/lib/media.ts";
import { toast } from "#/lib/toast.ts";
import { cn } from "#/lib/utils.ts";

const shortLinkRoute = getRouteApi("/s/$code");

export function ShortLinkPage() {
  const { short_link: drop } = shortLinkRoute.useLoaderData();

  useEffect(() => {
    if (drop.kind === "url" && drop.url) {
      globalThis.location.replace(drop.url);
    }
  }, [drop.kind, drop.url]);

  const copyMessage = async () => {
    if (!drop.body) {
      return;
    }
    try {
      await navigator.clipboard.writeText(drop.body);
      toast.add({ title: "Message copied", type: "success" });
    } catch {
      toast.add({ title: "Could not copy the message", type: "error" });
    }
  };

  if (drop.kind === "url") {
    return (
      <PageShell>
        <div
          className="flex min-h-64 items-center justify-center"
          role="status"
        >
          <Loader label="Opening link" variant="dots" />
        </div>
      </PageShell>
    );
  }

  if (drop.kind === "text") {
    return (
      <PageShell layout="split">
        <SharedMessage
          body={drop.body ?? ""}
          expiresAt={drop.expires_at}
          onCopy={() => {
            void copyMessage();
          }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell layout="split">
      <div className="short-link-body flex h-full min-h-0 flex-col gap-3 md:gap-4">
        <div className="flex shrink-0 flex-col gap-1.5 md:gap-2">
          <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
            Shared file
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance lg:text-4xl">
            {drop.track_download ? "Your file is here." : "Your shared file."}
          </h1>
          <p className="short-link-description text-muted-foreground text-sm leading-relaxed">
            Download it to keep a copy on your device.
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="short-link-folder mt-4 flex shrink-0 items-center justify-center md:min-h-0 md:flex-1">
            <FolderComponent className="h-auto" size="sm" />
          </div>
          <div
            aria-label="File name"
            className="short-link-scroll max-h-16 shrink-0 overflow-y-auto rounded-sm text-center focus-visible:outline-2 focus-visible:outline-offset-2"
            role="region"
            tabIndex={0}
          >
            <h2 className="text-lg leading-snug font-medium [overflow-wrap:anywhere]">
              {drop.filename || "Shared file"}
            </h2>
          </div>
          <Separator />
          <dl className="flex shrink-0 flex-col gap-2 text-sm">
            <div className="flex justify-between gap-6">
              <dt className="text-muted-foreground shrink-0">File size</dt>
              <dd className="text-right tabular-nums">
                {drop.byte_size === 0
                  ? "0 B"
                  : formatBytes(drop.byte_size) || "Not available"}
              </dd>
            </div>
            {drop.content_type ? (
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground shrink-0">File type</dt>
                <dd
                  className="min-w-0 truncate text-right"
                  title={drop.content_type}
                >
                  {drop.content_type}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-6">
              <dt className="text-muted-foreground shrink-0">Availability</dt>
              <dd className="text-right">
                <ExpiryCountdown expiresAt={drop.expires_at} />
              </dd>
            </div>
          </dl>
          <Separator />
        </div>
        <div className="flex shrink-0 flex-col gap-3">
          {drop.track_download ? (
            <MagneticButtonLink
              className="w-full focus-visible:outline-2 focus-visible:outline-offset-4"
              href={resolveAssetUrl(drop.track_download)}
              magneticClassName="w-full"
              rel="noopener"
              size="lg"
              target="_blank"
            >
              <Download aria-hidden="true" className="size-4" />
              Download file
            </MagneticButtonLink>
          ) : (
            <p className="text-muted-foreground text-sm" role="status">
              This file is not available to download.
            </p>
          )}
          <p className="short-link-description text-muted-foreground text-center text-xs leading-relaxed">
            This link is temporary. Save your file before it expires.
          </p>
        </div>
      </div>
    </PageShell>
  );
}

function SharedMessage({
  body,
  expiresAt,
  onCopy,
}: {
  body: string;
  expiresAt: string;
  onCopy: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: scrollRef });
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    const update = () => {
      setOverflows(node.scrollHeight - node.clientHeight > 1);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    for (const child of node.children) {
      observer.observe(child);
    }
    return () => {
      observer.disconnect();
    };
  }, [body]);

  return (
    <div className="short-link-body flex h-full min-h-0 flex-col gap-3 md:gap-4">
      <div className="flex shrink-0 flex-col gap-1.5 md:gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
          Shared message
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          A message for you.
        </h1>
      </div>
      <Separator />
      <div className="relative min-h-0 flex-1">
        {overflows ? (
          <ScrollProgress fixed={false} progress={scrollYProgress} />
        ) : null}
        <div
          ref={scrollRef}
          aria-label="Shared message"
          className="short-link-scroll h-full overflow-y-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          role="region"
          tabIndex={0}
        >
          <p className="text-base leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
            {body}
          </p>
        </div>
      </div>
      <ExpiryCountdown expiresAt={expiresAt} />
      <MagneticButton
        className="w-full focus-visible:outline-2 focus-visible:outline-offset-4"
        magneticClassName="w-full shrink-0"
        size="lg"
        type="button"
        onClick={onCopy}
      >
        <Copy aria-hidden="true" className="size-4" />
        Copy message
      </MagneticButton>
    </div>
  );
}

type PageShellLayout = "default" | "split";

function PageShell({
  children,
  layout = "default",
}: {
  children: ReactNode;
  layout?: PageShellLayout;
}) {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";
  const isSplit = layout === "split";

  return (
    <div
      className={cn(
        "short-link-page bg-background relative grid h-dvh overflow-hidden md:grid-cols-2 md:grid-rows-1",
        isSplit
          ? "grid-rows-[minmax(0,1fr)_minmax(0,2fr)]"
          : "grid-rows-[auto_minmax(0,1fr)]"
      )}
    >
      <aside
        className={cn(
          "bg-muted relative isolate flex min-h-0 flex-col justify-between overflow-hidden px-6 py-4 md:h-full md:p-10 lg:p-14",
          isSplit ? "h-full" : "h-[clamp(4rem,13dvh,7rem)]"
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
        >
          <ShaderBackground
            className="absolute inset-0"
            colorBack={isLight ? "#ffffff" : "#0a0a0a"}
            colorFront={isLight ? "#0a0a0a" : "#ffffff"}
            colorMid="#47a6ff"
            speed={0.4}
            variant="neuro-noise"
          />
          <div className="from-background/80 absolute inset-0 bg-linear-to-b via-transparent to-transparent" />
          <div className="from-background via-background/10 absolute inset-0 bg-linear-to-t to-transparent" />
        </div>
        <a
          className="flex w-fit items-center gap-2.5 rounded-sm text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4"
          href="/"
        >
          <Send aria-hidden="true" className="size-5 stroke-[1.5]" />
          AnyShare
        </a>
        <div
          className={cn(
            "short-link-tagline flex flex-col gap-3 md:gap-5 md:pb-6",
            isSplit ? "max-md:gap-2" : "max-md:hidden"
          )}
        >
          <p className="max-w-sm text-2xl leading-[1.05] font-medium tracking-tight text-balance md:text-5xl lg:text-6xl">
            Made to be shared.
          </p>
          <p className="text-muted-foreground hidden max-w-xs text-sm leading-relaxed md:block">
            A simple way to send something from your world to someone else’s.
          </p>
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="absolute top-4 right-6 z-10 md:right-10 lg:right-14">
          <ThemeSwitch />
        </header>
        <main className="flex min-h-0 flex-1 items-stretch px-6 py-3 md:items-center md:px-10 md:pt-16 md:pb-4 lg:px-16">
          <div className="mx-auto h-full max-h-[44rem] min-h-0 w-full max-w-md min-w-0">
            {children}
          </div>
        </main>
        <footer className="text-muted-foreground flex shrink-0 items-center justify-between gap-4 px-6 pb-3 text-xs md:px-10 lg:px-14">
          <span>Shared with AnyShare</span>
          <a
            className="hover:text-foreground flex items-center gap-1 rounded-sm py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4"
            href="/"
          >
            Share something{" "}
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </a>
        </footer>
      </div>
    </div>
  );
}
