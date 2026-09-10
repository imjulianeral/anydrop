import { Clock, Download, Eye } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { ExpiryCountdown } from "#/components/expiry-countdown.tsx";
import { FilePreview } from "#/components/file-preview.tsx";
import { LinksActivityChart } from "#/components/links-activity-chart.tsx";
import { Button } from "#/components/motion/button/index.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import {
  getShortLinkStats,
  shortPageUrl,
  type LinkStat,
  type ShortLink,
} from "#/lib/api.ts";
import {
  applyShortLinkEventToStats,
  readShortLinkEvent,
  statsFromEvents,
} from "#/lib/link-events.ts";
import { cn } from "#/lib/utils.ts";

type Activity =
  | { status: "loading" }
  | { status: "ready"; stats: LinkStat[] }
  | { status: "error" };

interface LinkDetailsProps {
  link: ShortLink;
  label: string;
  token: string;
}

export function LinkDetails({ link, label, token }: LinkDetailsProps) {
  const { subscribeToEvents } = useAppSession();
  const [activity, setActivity] = useState<Activity>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const isFile = link.kind === "file";
  const views = link.view_count ?? 0;
  const downloads = link.download_count ?? 0;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const payload = await getShortLinkStats(token, link.code);
        if (!cancelled) {
          setActivity({
            status: "ready",
            stats: statsFromEvents(payload.events ?? []),
          });
        }
      } catch {
        if (!cancelled) {
          setActivity({ status: "error" });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [link.code, token, attempt]);

  useEffect(() => {
    return subscribeToEvents((payload) => {
      const event = readShortLinkEvent(payload);
      if (!event || event.code !== link.code) {
        return;
      }
      setActivity((current) => {
        if (current.status !== "ready") {
          return current;
        }
        return {
          status: "ready",
          stats: applyShortLinkEventToStats(current.stats, event),
        };
      });
    });
  }, [link.code, subscribeToEvents]);

  return (
    <>
      <DialogHeader className="min-w-0 pr-8">
        <DialogTitle className="truncate">{label}</DialogTitle>
        <DialogDescription className="break-all">
          {shortPageUrl(link.code)}
        </DialogDescription>
      </DialogHeader>

      <section className="flex flex-col gap-3">
        <h3 className="font-heading text-sm">Totals</h3>
        <dl
          className={cn(
            "grid gap-3",
            isFile ? "sm:grid-cols-3" : "sm:grid-cols-2"
          )}
        >
          <TotalStat
            icon={<Eye aria-hidden="true" className="size-4" />}
            label="Views"
            value={views}
          />
          {isFile ? (
            <TotalStat
              icon={<Download aria-hidden="true" className="size-4" />}
              label="Downloads"
              value={downloads}
            />
          ) : null}
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Clock aria-hidden="true" className="size-4" />
              Time remaining
            </dt>
            <dd>
              <ExpiryCountdown
                className="text-foreground text-sm"
                expiresAt={link.expires_at}
                format="duration"
              />
            </dd>
          </div>
        </dl>
      </section>

      {activity.status === "loading" ? (
        <div className="flex h-60 items-center justify-center" role="status">
          <Loader label="Loading activity" variant="dots" />
        </div>
      ) : null}
      {activity.status === "error" ? (
        <div className="flex h-60 flex-col items-center justify-center gap-3">
          <p role="alert">Could not load this link's activity.</p>
          <Button
            variant="outline"
            onClick={() => {
              setActivity({ status: "loading" });
              setAttempt((current) => current + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {activity.status === "ready" ? (
        <>
          <LinksActivityChart
            description="Views for this link, last 7 days."
            framed={false}
            metrics={["views"]}
            stats={activity.stats}
            title="Views"
          />
          {isFile ? (
            <LinksActivityChart
              description="Downloads for this file, last 7 days."
              framed={false}
              metrics={["downloads"]}
              stats={activity.stats}
              title="Downloads"
            />
          ) : null}
        </>
      ) : null}

      {isFile ? (
        <FilePreview
          byteSize={link.byte_size}
          contentType={link.content_type}
          downloadUrl={link.download?.url}
          filename={link.filename}
          trackDownloadUrl={link.track_download}
        />
      ) : null}
    </>
  );
}

function TotalStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {icon}
        {label}
      </dt>
      <dd className="text-sm tabular-nums">{value}</dd>
    </div>
  );
}
