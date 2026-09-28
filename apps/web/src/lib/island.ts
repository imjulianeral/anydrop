import type { ReactNode } from "react";

import type { Transfer } from "#/lib/api.ts";

export interface IslandSentNotice {
  transfer: Transfer;
  peerName: string;
}

export const ISLAND_SENT_EVENT = "phemera:island-sent";

export interface IslandNotice {
  title: string;
  description?: string;
  kind: "success" | "error";
}

/**
 * Something that wants the island. Only the highest priority activity shows;
 * the others wait underneath it and come back when it leaves.
 */
export interface IslandActivity {
  /** Identifies the content; a new id morphs the island to the new view. */
  id: string;
  priority: number;
  /** The expanded view. `null` shows `compact` instead. */
  view: ReactNode | null;
  /** Classes for the expanded view's container (width, layout). */
  viewClassName?: string;
  compact?: ReactNode;
}

/** Highest first: a passing notice covers everything, then asks, then work. */
export const ISLAND_PRIORITY = {
  notice: 50,
  claim: 40,
  message: 30,
  transfer: 20,
  messageCompact: 10,
} as const;

export interface IslandState {
  notice: (IslandNotice & { id: number }) | null;
  activities: ReadonlyMap<string, IslandActivity>;
}

let state: IslandState = { notice: null, activities: new Map() };
let nextNoticeId = 0;
const listeners = new Set<() => void>();

const publish = (next: IslandState) => {
  state = next;
  for (const listener of listeners) {
    listener();
  }
};

export const subscribeIsland = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getIslandState = () => state;

/** Puts `source`'s activity on the island, or takes it off with `null`. */
export const setIslandActivity = (
  source: string,
  activity: IslandActivity | null
) => {
  const current = state.activities.get(source);
  if (current === activity || (!current && !activity)) {
    return;
  }
  const activities = new Map(state.activities);
  if (activity) {
    activities.set(source, activity);
  } else {
    activities.delete(source);
  }
  publish({ ...state, activities });
};

export const dismissIslandNotice = (id: number) => {
  if (state.notice?.id === id) {
    publish({ ...state, notice: null });
  }
};

export const island = {
  /** Shows a passing notice. A newer notice replaces the one on screen. */
  notice(notice: IslandNotice) {
    nextNoticeId += 1;
    publish({ ...state, notice: { ...notice, id: nextNoticeId } });
  },
  success(title: string, description?: string) {
    island.notice({ title, description, kind: "success" });
  },
  /** An error notice; the cause's message becomes the description. */
  error(title: string, cause?: unknown) {
    let description: string | undefined;
    if (cause instanceof Error) {
      description = cause.message;
    } else if (cause !== undefined) {
      description = "Please try again.";
    }
    island.notice({ title, description, kind: "error" });
  },
  sent(notice: IslandSentNotice) {
    globalThis.dispatchEvent(
      new CustomEvent<IslandSentNotice>(ISLAND_SENT_EVENT, { detail: notice })
    );
  },
};
