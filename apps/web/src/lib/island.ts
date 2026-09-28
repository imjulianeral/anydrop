import type { Transfer } from "#/lib/api.ts";

export interface IslandSentNotice {
  transfer: Transfer;
  peerName: string;
}

export const ISLAND_SENT_EVENT = "phemera:island-sent";
export const ISLAND_NOTICE_EVENT = "phemera:island-notice";

export interface IslandNotice {
  title: string;
  description: string;
  kind: "success" | "error";
}

export const island = {
  notice(notice: IslandNotice) {
    globalThis.dispatchEvent(
      new CustomEvent<IslandNotice>(ISLAND_NOTICE_EVENT, { detail: notice })
    );
  },
  error(title: string, error: unknown) {
    island.notice({
      title,
      description: error instanceof Error ? error.message : "Please try again.",
      kind: "error",
    });
  },
  sent(notice: IslandSentNotice) {
    globalThis.dispatchEvent(
      new CustomEvent<IslandSentNotice>(ISLAND_SENT_EVENT, { detail: notice })
    );
  },
};
