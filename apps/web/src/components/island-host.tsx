import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { transferIslandActivity } from "#/components/island-transfers.tsx";
import {
  DynamicIsland,
  DynamicIslandIcon,
  DynamicIslandView,
} from "#/components/motion/dynamic-island.tsx";
import { AlertCircle, Check, X } from "#/components/rune-icons.tsx";
import {
  getFileTransfers,
  subscribeFileTransfers,
} from "#/lib/file-transfers.ts";
import {
  ISLAND_PRIORITY,
  dismissIslandNotice,
  getIslandState,
  setIslandActivity,
  subscribeIsland,
} from "#/lib/island.ts";
import type { IslandActivity, IslandState } from "#/lib/island.ts";

/** How long a notice stays before it leaves on its own. */
const NOTICE_MS = { success: 4000, error: 8000 } as const;

type Notice = NonNullable<IslandState["notice"]>;

/**
 * Keeps `source`'s activity on the island while the calling component is
 * mounted. Pass `null` to step off without unmounting.
 */
export function useIslandActivity(
  source: string,
  activity: IslandActivity | null
) {
  // No deps on purpose: the activity carries fresh elements every render.
  useLayoutEffect(() => {
    setIslandActivity(source, activity);
  });
  useLayoutEffect(
    () => () => {
      setIslandActivity(source, null);
    },
    [source]
  );
}

/**
 * The one island at the top of every page. Notices, requests, messages and
 * file transfers all come through here; the highest priority one shows.
 */
export function IslandHost() {
  const reduce = useReducedMotion();
  const { notice, activities } = useSyncExternalStore(
    subscribeIsland,
    getIslandState,
    getIslandState
  );
  const transfers = useSyncExternalStore(
    subscribeFileTransfers,
    getFileTransfers,
    getFileTransfers
  );
  // Transfers sit in the pill until opened; a newer transfer starts closed.
  const [openTransferId, setOpenTransferId] = useState<number | null>(null);
  const latestTransfer = transfers.at(-1);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = globalThis.setTimeout(() => {
      dismissIslandNotice(notice.id);
    }, NOTICE_MS[notice.kind]);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [notice]);

  const candidates = [...activities.values()];
  if (notice) {
    candidates.push(noticeActivity(notice));
  }
  const transferActivity = transferIslandActivity({
    transfers,
    expanded:
      latestTransfer !== undefined && openTransferId === latestTransfer.id,
    onToggle: (open) => {
      setOpenTransferId(open ? (latestTransfer?.id ?? null) : null);
    },
  });
  if (transferActivity) {
    candidates.push(transferActivity);
  }
  // Ties go to whoever arrived first.
  let active: IslandActivity | null = null;
  for (const candidate of candidates) {
    if (!active || candidate.priority > active.priority) {
      active = candidate;
    }
  }

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          key="island"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.9 }}
          transition={
            reduce
              ? { duration: 0.15 }
              : { type: "spring", duration: 0.5, bounce: 0.2 }
          }
          className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[10000] flex origin-top justify-center px-3"
        >
          <DynamicIsland
            className="pointer-events-auto"
            view={active.view ? active.id : null}
            compact={active.compact}
            compactId={`${active.id}-compact`}
          >
            <DynamicIslandView id={active.id} className={active.viewClassName}>
              {active.view}
            </DynamicIslandView>
          </DynamicIsland>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function noticeActivity(notice: Notice): IslandActivity {
  return {
    id: `notice-${notice.id}`,
    priority: ISLAND_PRIORITY.notice,
    // Sized to its words: a short "Link copied" stays a small island.
    viewClassName:
      "w-max max-w-[min(24rem,calc(100vw-1.5rem))] items-start gap-2",
    view: <NoticeView notice={notice} />,
  };
}

function NoticeView({ notice }: { notice: Notice }) {
  const error = notice.kind === "error";
  const Icon = error ? AlertCircle : Check;
  return (
    <>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <DynamicIslandIcon tone={error ? "red" : "green"}>
          <Icon aria-hidden="true" />
        </DynamicIslandIcon>
        <div
          className="flex min-h-10 min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5"
          role={error ? "alert" : undefined}
        >
          <p className="text-sm leading-5 font-medium">{notice.title}</p>
          {notice.description ? (
            <p className="text-muted-foreground text-xs leading-relaxed">
              {notice.description}
            </p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        className="text-muted-foreground hover:text-foreground grid size-10 shrink-0 cursor-pointer place-items-center rounded-full outline-offset-2 transition-colors hover:bg-white/10"
        onClick={() => {
          dismissIslandNotice(notice.id);
        }}
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </>
  );
}
