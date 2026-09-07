import type { LinkStat, ShortLink } from "#/lib/api.ts";

export interface ShortLinkEvent {
  code: string;
  kind: "view" | "download";
  viewCount: number;
  downloadCount: number;
  date: string;
}

export const readShortLinkEvent = (
  payload: Record<string, unknown>
): ShortLinkEvent | null => {
  if (payload.type !== "short_link_event") {
    return null;
  }
  if (typeof payload.code !== "string" || payload.code === "") {
    return null;
  }
  if (payload.kind !== "view" && payload.kind !== "download") {
    return null;
  }
  if (
    typeof payload.view_count !== "number" ||
    typeof payload.download_count !== "number"
  ) {
    return null;
  }
  if (typeof payload.date !== "string" || payload.date === "") {
    return null;
  }
  return {
    code: payload.code,
    kind: payload.kind,
    viewCount: payload.view_count,
    downloadCount: payload.download_count,
    date: payload.date,
  };
};

export const applyShortLinkEventToLink = (
  link: ShortLink,
  event: ShortLinkEvent
): ShortLink => {
  if (link.code !== event.code) {
    return link;
  }
  return {
    ...link,
    view_count: event.viewCount,
    download_count: event.downloadCount,
  };
};

export const applyShortLinkEventToStats = (
  stats: LinkStat[],
  event: ShortLinkEvent
): LinkStat[] =>
  stats.map((row) => {
    if (row.date !== event.date) {
      return row;
    }
    if (event.kind === "view") {
      return { ...row, views: row.views + 1 };
    }
    return { ...row, downloads: row.downloads + 1 };
  });
