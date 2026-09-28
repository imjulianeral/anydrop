import { useRef, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { useIslandActivity } from "#/components/island-host.tsx";
import { Button } from "#/components/motion/button/base.tsx";
import { StatefulButton } from "#/components/motion/button/stateful.tsx";
import { DynamicIslandIcon } from "#/components/motion/dynamic-island.tsx";
import { Monitor } from "#/components/rune-icons.tsx";
import type { DeviceClaim } from "#/lib/api.ts";
import { attempt } from "#/lib/attempt.ts";
import { ISLAND_PRIORITY, island } from "#/lib/island.ts";

type ClaimAction = "accept" | "decline";

/**
 * Puts a pending request on the island, asking this device to confirm when a
 * nearby account wants to save it. Accepting doesn't sign anyone in here; it
 * only adds the device to that person's saved devices.
 */
export function DeviceClaimIsland() {
  const { self, claims, respondToClaim } = useAppSession();
  const [busy, setBusy] = useState<ClaimAction | null>(null);
  const busyRef = useRef(false);
  const claim = claims.find(
    (item) => item.status === "pending" && item.target.id === self.id
  );

  const respond = async (action: ClaimAction) => {
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

  useIslandActivity(
    "device-claim",
    claim
      ? {
          id: claim.id,
          priority: ISLAND_PRIORITY.claim,
          viewClassName:
            "w-[min(26rem,calc(100vw-1.5rem))] flex-col items-stretch gap-3",
          view: (
            <ClaimView
              claim={claim}
              busy={busy}
              onRespond={(action) => {
                void respond(action);
              }}
            />
          ),
        }
      : null
  );

  return null;
}

function ClaimView({
  claim,
  busy,
  onRespond,
}: {
  claim: DeviceClaim;
  busy: ClaimAction | null;
  onRespond: (action: ClaimAction) => void;
}) {
  const requester = claim.requested_by?.display_name;
  return (
    <>
      <div className="flex w-full items-start gap-3">
        <DynamicIslandIcon tone="amber">
          <Monitor aria-hidden="true" />
        </DynamicIslandIcon>
        <div className="flex min-h-10 min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5 pr-2">
          <p className="text-sm leading-5 font-medium">Save this device?</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {`${claim.requester.name} wants to save this device to their account as “${claim.name}”. Their saved devices will be able to reach it from any network.`}
          </p>
          {requester ? (
            <p className="text-2xs text-muted-foreground/70 mt-0.5">
              Requested from {requester}
            </p>
          ) : null}
        </div>
      </div>
      {/* h-10 buttons at 8px padding keep the bottom corners concentric. */}
      <div className="grid w-full grid-cols-2 gap-2">
        <Button
          variant="secondary"
          size="md"
          disabled={busy !== null}
          onClick={() => onRespond("decline")}
        >
          Decline
        </Button>
        <StatefulButton
          variant="primary"
          size="md"
          state={busy === "accept" ? "loading" : "idle"}
          disabled={busy !== null}
          onClick={() => onRespond("accept")}
        >
          Save device
        </StatefulButton>
      </div>
    </>
  );
}
