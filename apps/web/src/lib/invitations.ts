import type { DeviceInvitation } from "./api.ts";

export const activeInvitations = (
  invitations: DeviceInvitation[],
  now = Date.now()
) =>
  invitations.filter(
    (invitation) =>
      invitation.status === "accepted" ||
      (invitation.status === "pending" &&
        Date.parse(invitation.expires_at) > now)
  );

export const mergeInvitation = (
  invitations: DeviceInvitation[],
  invitation: DeviceInvitation
) =>
  activeInvitations([
    ...invitations.filter((item) => item.id !== invitation.id),
    invitation,
  ]);

export const invitationError = (error: unknown): Error => {
  if (error instanceof Error && error.name === "TimeoutError") {
    return new Error(
      "The request timed out. Check your invitations before trying again."
    );
  }
  if (error instanceof TypeError) {
    return new Error(
      "Could not reach AnyShare. Check your connection and try again."
    );
  }
  return error instanceof Error
    ? error
    : new Error("Could not send the invitation. Please try again.");
};
