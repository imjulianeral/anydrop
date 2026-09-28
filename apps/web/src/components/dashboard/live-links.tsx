import { EmptyState } from "#/components/empty-state.tsx";
import { ExpiryCountdown } from "#/components/expiry-countdown.tsx";
import { AnimatedBadge } from "#/components/motion/animated-badge.tsx";
import { Button } from "#/components/motion/button/index.tsx";
import { Copy, Download, Eye, Link2 } from "#/components/rune-icons.tsx";
import type { ShortLink } from "#/lib/api.ts";
import { limitReached } from "#/lib/expiry.ts";
import { island } from "#/lib/island.ts";
import { linkPageUrl } from "#/lib/link-keys.ts";
import { linkLabel } from "#/lib/link-label.ts";

export type LinkSort = "recent" | "views";

const sorters: Record<LinkSort, (a: ShortLink, b: ShortLink) => number> = {
  recent: (a, b) => b.created_at.localeCompare(a.created_at),
  views: (a, b) =>
    b.view_count + b.download_count - (a.view_count + a.download_count),
};

const copyLink = async (code: string) => {
  const url = linkPageUrl(code);
  await navigator.clipboard.writeText(url);
  island.success("Link copied", url);
};

/** Live links in the dashboard's scope, already filtered by the dashboard. */
export function LiveLinks({
  links,
  sort,
  emptyTitle,
  emptyDescription,
  onOpen,
}: {
  links: ShortLink[];
  sort: LinkSort;
  emptyTitle: string;
  emptyDescription: string;
  onOpen: (link: ShortLink) => void;
}) {
  if (links.length === 0) {
    return (
      <EmptyState
        className="py-10"
        description={emptyDescription}
        icon={<Link2 />}
        title={emptyTitle}
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {links.toSorted(sorters[sort]).map((item) => (
        <LinkListItem
          key={item.code}
          item={item}
          onCopy={copyLink}
          onOpen={onOpen}
        />
      ))}
    </ul>
  );
}

function LinkListItem({
  item,
  onCopy,
  onOpen,
}: {
  item: ShortLink;
  onCopy: (code: string) => Promise<void>;
  onOpen: (link: ShortLink) => void;
}) {
  const label = linkLabel(item);

  return (
    <li className="border-border/70 bg-card/80 relative rounded-3xl border">
      <button
        type="button"
        aria-label={`View activity for ${label}`}
        className="hover:bg-muted/50 focus-visible:ring-ring/50 absolute inset-0 cursor-pointer rounded-3xl transition-colors focus-visible:ring-3 focus-visible:outline-none"
        onClick={() => onOpen(item)}
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
    </li>
  );
}
