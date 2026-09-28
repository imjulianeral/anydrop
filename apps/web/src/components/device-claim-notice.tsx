import { useRef, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { Button } from "#/components/motion/button/base.tsx";
import { StatefulButton } from "#/components/motion/button/stateful.tsx";
import {
  DynamicIsland,
  DynamicIslandView,
} from "#/components/motion/dynamic-island.tsx";
import { Check, Monitor, X } from "#/components/rune-icons.tsx";
import type { DeviceClaim } from "#/lib/api.ts";
import { attempt } from "#/lib/attempt.ts";
import { island } from "#/lib/island.ts";
import type { IslandNotice } from "#/lib/island.ts";

/**
 * The island that shows notices, and asks this device to confirm when a nearby
 * account wants to save it. Accepting doesn't sign anyone in here; it only
 * adds the device to that person's saved devices.
 */
export function DeviceClaimNotice({
  claim,
  notice,
  onDismiss,
}: {
  claim?: DeviceClaim;
  notice: IslandNotice | null;
  onDismiss: () => void;
}) {
  const { respondToClaim } = useAppSession();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const busyRef = useRef(false);

  const respond = async (action: "accept" | "decline") => {
    if (!claim || busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(action);
    await attempt(
      async () => {
        await respondToClaim(claim.id, action);
        island.notice(
          action === "accept"
            ? {
                title: "Device saved",
                description: `This device is now “${claim.name}” on ${claim.requester.name}'s account.`,
                kind: "success",
              }
            : {
                title: "Request declined",
                description: "This device was not saved to their account.",
                kind: "success",
              }
        );
      },
      {
        onError: (error) => island.error("Could not answer the request", error),
        onSettled: () => {
          busyRef.current = false;
          setBusy(null);
        },
      }
    );
  };

  const { id, Icon, title, description, requester } = islandCopy(notice, claim);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[10000] flex justify-center px-3">
      <DynamicIsland className="pointer-events-auto" view={id}>
        <DynamicIslandView
          id={id}
          className="w-[min(26rem,calc(100vw-1.5rem))] flex-col gap-3 px-5 py-4"
        >
          <div className="flex w-full items-start gap-3">
            <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div
              className="flex min-w-0 flex-1 flex-col gap-1"
              role={notice?.kind === "error" ? "alert" : undefined}
            >
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs leading-relaxed opacity-80">
                {description}
              </p>
              {requester ? (
                <p className="text-xs opacity-60">Requested from {requester}</p>
              ) : null}
            </div>
            {notice && (
              <button
                type="button"
                aria-label="Dismiss notification"
                className="flex size-8 shrink-0 items-center justify-center rounded-full outline-offset-2"
                onClick={onDismiss}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
          {!notice && claim && (
            <div className="flex w-full justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  void respond("decline");
                }}
              >
                Decline
              </Button>
              <StatefulButton
                variant="secondary"
                size="sm"
                state={busy === "accept" ? "loading" : "idle"}
                disabled={busy !== null}
                onClick={() => {
                  void respond("accept");
                }}
              >
                Save device
              </StatefulButton>
            </div>
          )}
        </DynamicIslandView>
      </DynamicIsland>
    </div>
  );
}

/** What the island says: a passing notice, or the request waiting here. */
function islandCopy(notice: IslandNotice | null, claim?: DeviceClaim) {
  if (notice) {
    return {
      id: "island-notice",
      Icon: notice.kind === "error" ? X : Check,
      title: notice.title,
      description: notice.description,
      requester: null,
    };
  }
  return {
    id: claim?.id ?? "device-claim",
    Icon: Monitor,
    title: "Save this device?",
    description: `${claim?.requester.name} wants to save this device to their account as “${claim?.name}”. Their saved devices will be able to reach it from any network.`,
    requester: claim?.requested_by?.display_name ?? null,
  };
}
