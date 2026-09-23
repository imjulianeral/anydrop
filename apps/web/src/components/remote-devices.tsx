import { useRef, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { DeviceIdentity } from "#/components/device-identity.tsx";
import { Button } from "#/components/motion/button/base.tsx";
import { StatefulButton } from "#/components/motion/button/stateful.tsx";
import { Input } from "#/components/motion/input.tsx";
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from "#/components/motion/popover-morph.tsx";
import { Link2 } from "#/components/rune-icons.tsx";
import { Field, FieldDescription, FieldGroup } from "#/components/ui/field.tsx";
import { sendInvitation } from "#/lib/api.ts";
import { invitationError } from "#/lib/invitations.ts";
import { island } from "#/lib/island.ts";

export function RemoteDevices() {
  const { token, self, connected, invitations, respondToInvitation } =
    useAppSession();
  const [target, setTarget] = useState("");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const busyRef = useRef(false);

  const send = async () => {
    if (sendingRef.current) {
      return;
    }
    if (!target.trim()) {
      island.error(
        "Invitation not sent",
        new Error("Enter an exact nickname or user ID.")
      );
      return;
    }
    sendingRef.current = true;
    setSending(true);
    try {
      const { invitation } = await sendInvitation(token, target.trim());
      island.notice({
        title: "Invitation sent",
        description: `Waiting for ${invitation.recipient.display_name} to accept. Invitations expire in 10 minutes.`,
        kind: "success",
      });
      setTarget("");
    } catch (error) {
      island.error("Invitation not sent", invitationError(error));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const disconnect = async (id: string) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusyId(id);
    try {
      await respondToInvitation(id, "disconnect");
      island.notice({
        title: "Remote device disconnected",
        description: "A new invitation is needed to reconnect remotely.",
        kind: "success",
      });
    } catch (error) {
      island.error("Could not disconnect", invitationError(error));
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  return (
    <MorphPopover>
      <MorphPopoverTrigger>
        <Button variant="secondary" size="sm">
          <Link2 />
          Invite a device
        </Button>
      </MorphPopoverTrigger>
      <MorphPopoverContent
        align="start"
        className="max-h-[70dvh] w-[min(23rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <section
          className="flex flex-col gap-5 p-5"
          aria-label="Remote devices"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-medium">Share from anywhere</h2>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Nearby devices appear automatically. Invite someone on another
              network to share files and messages after they accept.
            </p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <FieldGroup>
              <Field>
                <Input
                  label="Exact nickname or user ID"
                  placeholder="Amber Fox or their full user ID"
                  value={target}
                  onChange={setTarget}
                  maxLength={160}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={sending}
                  aria-describedby="remote-invite-help"
                />
                <FieldDescription id="remote-invite-help">
                  Nicknames are case-sensitive. They must have AnyShare open. No
                  partial matches or public device directory.
                </FieldDescription>
              </Field>
              <StatefulButton
                type="submit"
                state={sending ? "loading" : "idle"}
                loadingText="Sending invite"
                disabled={sending || !connected}
              >
                Send invitation
              </StatefulButton>
            </FieldGroup>
          </form>
          <DeviceIdentity device={self} />
          {invitations.length > 0 && (
            <ul
              className="flex flex-col gap-3"
              aria-label="Invitations and connections"
            >
              {invitations.map((invitation) => {
                const outgoing = invitation.sender.id === self.id;
                const peer = outgoing
                  ? invitation.recipient
                  : invitation.sender;
                return (
                  <li
                    key={invitation.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm">
                        {peer.display_name}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {invitationStatus(invitation.status, outgoing)}
                      </span>
                    </span>
                    {invitation.status === "accepted" && (
                      <StatefulButton
                        variant="ghost"
                        size="sm"
                        state={busyId === invitation.id ? "loading" : "idle"}
                        disabled={busyId !== null}
                        onClick={() => {
                          void disconnect(invitation.id);
                        }}
                      >
                        Disconnect
                      </StatefulButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </MorphPopoverContent>
    </MorphPopover>
  );
}

function invitationStatus(status: string, outgoing: boolean) {
  if (status === "accepted") {
    return "Remote sharing enabled";
  }
  return outgoing ? "Waiting for acceptance" : "Invitation received";
}
