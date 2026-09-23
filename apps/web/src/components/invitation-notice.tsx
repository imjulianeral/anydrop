import { useRef, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { Button } from "#/components/motion/button/base.tsx";
import { StatefulButton } from "#/components/motion/button/stateful.tsx";
import {
  DynamicIsland,
  DynamicIslandView,
} from "#/components/motion/dynamic-island.tsx";
import { Check, Link2, X } from "#/components/rune-icons.tsx";
import type { DeviceInvitation } from "#/lib/api.ts";
import { invitationError } from "#/lib/invitations.ts";
import { island } from "#/lib/island.ts";
import type { IslandNotice } from "#/lib/island.ts";

export function InvitationNotice({
  invitation,
  notice,
  onDismiss,
}: {
  invitation?: DeviceInvitation;
  notice: IslandNotice | null;
  onDismiss: () => void;
}) {
  const { respondToInvitation } = useAppSession();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const busyRef = useRef(false);

  const respond = async (action: "accept" | "decline") => {
    if (!invitation || busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(action);
    try {
      await respondToInvitation(invitation.id, action);
      island.notice({
        title:
          action === "accept" ? "You are connected" : "Invitation declined",
        description:
          action === "accept"
            ? `Select ${invitation.sender.display_name} to share a file or message.`
            : "This device has not been added to your remote connections.",
        kind: "success",
      });
    } catch (error) {
      island.error("Could not answer invitation", invitationError(error));
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const id = notice ? "invite-notice" : (invitation?.id ?? "invitation");
  let Icon = Link2;
  if (notice) {
    Icon = notice.kind === "error" ? X : Check;
  }

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
              <p className="text-sm font-medium">
                {notice?.title ?? "Invitation to share"}
              </p>
              <p className="text-xs leading-relaxed opacity-80">
                {notice?.description ??
                  `${invitation?.sender.display_name} wants to share files and messages with this device, even on another network.`}
              </p>
              {!notice && invitation && (
                <p className="font-mono text-[10px] break-all opacity-60">
                  User ID: {invitation.sender.id}
                </p>
              )}
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
          {!notice && invitation && (
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
                Accept invitation
              </StatefulButton>
            </div>
          )}
        </DynamicIslandView>
      </DynamicIsland>
    </div>
  );
}
