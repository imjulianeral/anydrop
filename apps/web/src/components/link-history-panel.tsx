import { BarChart3, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { ExpiryCountdown } from "#/components/expiry-countdown.tsx";
import { ActionSwapCascadeButton } from "#/components/motion/action-swap-cascade.tsx";
import type { ActionSwapItem } from "#/components/motion/action-swap-cascade.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from "#/components/motion/popover-morph.tsx";
import { PullToRefresh } from "#/components/motion/pull-to-refresh.tsx";
import { SwipeableList } from "#/components/motion/swipeable-list.tsx";
import type { SwipeableListItem } from "#/components/motion/swipeable-list.tsx";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Eye,
  FileIcon,
  Link2,
  MessageSquare,
} from "#/components/rune-icons.tsx";
import { deleteShortLink, listShortLinks } from "#/lib/api.ts";
import type { ShortLink } from "#/lib/api.ts";
import { attempt } from "#/lib/attempt.ts";
import { limitReached } from "#/lib/expiry.ts";
import { island } from "#/lib/island.ts";
import {
  applyShortLinkEventToLink,
  readShortLinkEvent,
} from "#/lib/link-events.ts";
import { forgetLinkKey, linkPageUrl } from "#/lib/link-keys.ts";
import { linkLabel } from "#/lib/link-label.ts";

interface LinkHistoryPanelProps {
  onBack: () => void;
  onDeleted: (code: string) => void;
  onStats: (link: ShortLink) => void;
}

const linkIcons = {
  url: Link2,
  text: MessageSquare,
  file: FileIcon,
} as const;

const copyActionItems: ActionSwapItem[] = [
  {
    id: "copy",
    label: "Copy link",
    icon: <Copy aria-hidden="true" className="size-4" />,
  },
  {
    id: "copied",
    label: "Copied link",
    icon: <Check aria-hidden="true" className="size-4" />,
  },
];

export function LinkHistoryPanel({
  onBack,
  onDeleted,
  onStats,
}: LinkHistoryPanelProps) {
  const { token, subscribeToEvents } = useAppSession();
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const deletedCodes = useRef(new Set<string>());
  const copyResetTimer = useRef(0);

  useEffect(() => () => clearTimeout(copyResetTimer.current), []);

  const refresh = useCallback(async () => {
    await attempt(
      async () => {
        const payload = await listShortLinks(token);
        setLinks(
          payload.short_links.filter(
            (link) => !deletedCodes.current.has(link.code)
          )
        );
        setLoadFailed(false);
      },
      {
        onError: (cause) => {
          setLoadFailed(true);
          island.error("Could not load links", cause);
        },
        onSettled: () => {
          setLoading(false);
        },
      }
    );
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      subscribeToEvents((payload) => {
        const event = readShortLinkEvent(payload);
        if (event) {
          setLinks((current) =>
            current.map((link) => applyShortLinkEventToLink(link, event))
          );
        }
      }),
    [subscribeToEvents]
  );

  const remove = async (link: ShortLink) => {
    if (deletingCode) {
      return;
    }
    setDeletingCode(link.code);
    await attempt(
      async () => {
        await deleteShortLink(token, link.code);
        deletedCodes.current.add(link.code);
        setLinks((current) =>
          current.filter((item) => item.code !== link.code)
        );
        onDeleted(link.code);
        try {
          forgetLinkKey(link.code);
        } catch {
          // The link is revoked even if this browser cannot write local storage.
        }
        island.success("Link deleted");
      },
      {
        onError: (cause) => {
          island.error("Could not delete link", cause);
        },
        onSettled: () => {
          setDeletingCode(null);
        },
      }
    );
  };

  const copy = async (link: ShortLink) => {
    try {
      await navigator.clipboard.writeText(linkPageUrl(link.code));
      setCopiedCode(link.code);
      clearTimeout(copyResetTimer.current);
      copyResetTimer.current = window.setTimeout(() => {
        setCopiedCode(null);
      }, 2000);
      island.success("Link copied");
    } catch (error) {
      island.error("Could not copy link", error);
    }
  };

  const items: SwipeableListItem[] = links.map((link) => {
    const Icon = linkIcons[link.kind];
    const label = linkLabel(link);
    const isFile = link.kind === "file";
    const expired = limitReached(
      link.max_downloads,
      isFile ? link.download_count : link.view_count
    );

    return {
      id: link.code,
      ariaLabel: label,
      leftActions: [
        {
          id: "delete",
          label: `Delete ${label}`,
          icon: <Trash2 aria-hidden="true" className="size-5" />,
          tone: "danger",
          disabled: deletingCode !== null,
          onClick: () => {
            void remove(link);
          },
        },
      ],
      rightActions: [
        {
          id: "charts",
          label: `View charts for ${label}`,
          icon: <BarChart3 aria-hidden="true" className="size-5" />,
          tone: "info",
          onClick: () => onStats(link),
        },
        {
          id: "copy",
          label: `Copy ${label}`,
          closeOnAction: false,
          onClick: () => {
            void copy(link);
          },
          renderButton: ({ actionWidth, focusable, side, onClick }) => (
            <div
              className="flex h-full w-(--action-width) shrink-0 items-center justify-center"
              style={{ "--action-width": `${actionWidth}px` }}
            >
              <ActionSwapCascadeButton
                data-swipe-action={side}
                aria-label={
                  copiedCode === link.code ? `Copied ${label}` : `Copy ${label}`
                }
                className="text-muted-foreground hover:bg-background size-9 bg-transparent"
                cycle={false}
                items={copyActionItems}
                size="icon"
                tabIndex={focusable ? 0 : -1}
                value={copiedCode === link.code ? "copied" : "copy"}
                variant="ghost"
                onClick={onClick}
              />
            </div>
          ),
        },
      ],
      content: (
        <article className="flex min-w-0 items-start gap-3">
          <div className="border-border bg-card text-muted-foreground grid size-9 shrink-0 place-items-center rounded-xl border shadow-sm">
            <Icon aria-hidden="true" className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-sm font-medium">
              {label}
            </p>
            <p className="text-muted-foreground text-2xs mt-0.5 truncate font-mono">
              {linkPageUrl(link.code)}
            </p>
            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
              <LinkUsage
                count={isFile ? link.download_count : link.view_count}
                kind={isFile ? "download" : "view"}
                limit={link.max_downloads}
              />
              <ExpiryCountdown
                createdAt={link.created_at}
                expiresAt={link.expires_at}
                expired={expired}
              />
            </div>
          </div>
        </article>
      ),
    };
  });

  return (
    <section
      aria-label="Link history"
      className="-m-5 overflow-hidden rounded-3xl"
    >
      <PullToRefresh
        ariaLabel="Link history"
        className="h-[min(34rem,calc(100dvh-8rem))]"
        onRefresh={refresh}
      >
        <header className="border-border bg-background/90 sticky top-0 z-10 flex items-center gap-3 border-b px-5 py-4 backdrop-blur-md">
          <button
            type="button"
            aria-label="Back to create link"
            className="text-muted-foreground hover:text-foreground grid size-8 shrink-0 cursor-pointer place-items-center rounded-full focus-visible:outline-2"
            onClick={onBack}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-foreground text-sm font-semibold">
              Link history
            </h2>
            <p className="text-muted-foreground truncate text-xs">
              Pull to refresh · Swipe for actions
            </p>
          </div>
          <span className="bg-muted text-muted-foreground text-3xs rounded-full px-2.5 py-1 font-mono">
            {loading ? "…" : `${links.length} links`}
          </span>
        </header>

        {loading ? (
          <output
            aria-live="polite"
            className="flex h-44 items-center justify-center"
          >
            <Loader label="Loading links" variant="dots" />
          </output>
        ) : null}
        {!loading && loadFailed && links.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center gap-3 px-5 text-center">
            <p className="text-muted-foreground text-sm">
              Could not load link history.
            </p>
            <button
              type="button"
              className="text-foreground cursor-pointer text-sm font-medium underline underline-offset-2"
              onClick={() => {
                void refresh();
              }}
            >
              Try again
            </button>
          </div>
        ) : null}
        {!loading && !loadFailed && links.length === 0 ? (
          <div className="flex h-44 items-center justify-center px-5 text-center">
            <p className="text-muted-foreground text-sm">
              Your links will appear here.
            </p>
          </div>
        ) : null}
        {links.length > 0 ? (
          <SwipeableList
            items={items}
            classNames={{
              root: "gap-0 px-2 pb-3",
              item: "rounded-none border-b border-border/70 bg-background",
              rail: "rounded-none",
              surface:
                "min-h-0 rounded-none border-0 bg-background px-3 py-4 shadow-none",
            }}
          />
        ) : null}
      </PullToRefresh>
    </section>
  );
}

function LinkUsage({
  count,
  kind,
  limit,
}: {
  count: number;
  kind: "download" | "view";
  limit?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const Icon = kind === "download" ? Download : Eye;
  const unlimited = limit === null || limit === undefined;
  const label = unlimited
    ? `${count} ${kind}${count === 1 ? "" : "s"}, unlimited`
    : `${count} of ${limit} ${kind}${limit === 1 ? "" : "s"}`;
  const value = (
    <>
      <Icon aria-hidden="true" className="size-3.5" />
      <span aria-hidden="true" className="tabular-nums">
        {count}
        {unlimited ? null : `/${limit}`}
      </span>
    </>
  );

  if (!unlimited) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs"
        aria-label={label}
      >
        {value}
      </span>
    );
  }

  return (
    <MorphPopover open={open} onOpenChange={setOpen}>
      <MorphPopoverTrigger>
        <button
          type="button"
          aria-label={label}
          className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 rounded-md text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
          onKeyDown={(event) => {
            if (open && event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
            }
          }}
        >
          {value}
        </button>
      </MorphPopoverTrigger>
      <MorphPopoverContent
        side="top"
        align="center"
        sideOffset={6}
        radius={12}
        className="text-foreground px-3 py-2 text-xs"
      >
        Unlimited {kind === "download" ? "downloads" : "views"}
      </MorphPopoverContent>
    </MorphPopover>
  );
}
