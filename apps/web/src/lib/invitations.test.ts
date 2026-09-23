import { describe, expect, it } from "vitest";

import { ApiError } from "./api.ts";
import type { DeviceInvitation } from "./api.ts";
import {
  activeInvitations,
  invitationError,
  mergeInvitation,
} from "./invitations.ts";

const invitation = {
  id: "invite",
  status: "pending",
  expires_at: "2099-01-01T00:00:00Z",
} as DeviceInvitation;

describe("remote invitations", () => {
  it("drops expired requests but keeps accepted connections", () => {
    const expired = { ...invitation, expires_at: "2000-01-01T00:00:00Z" };
    expect(activeInvitations([expired])).toStrictEqual([]);
    expect(
      activeInvitations([{ ...expired, status: "accepted" }])
    ).toHaveLength(1);
  });

  it("merges repeated socket events and removes declined or disconnected devices", () => {
    const pending = mergeInvitation([invitation], invitation);
    expect(pending).toHaveLength(1);
    const accepted = mergeInvitation(pending, {
      ...invitation,
      status: "accepted",
    });
    expect(accepted[0]?.status).toBe("accepted");
    expect(
      mergeInvitation(accepted, { ...invitation, status: "disconnected" })
    ).toStrictEqual([]);
    expect(
      mergeInvitation(pending, { ...invitation, status: "declined" })
    ).toStrictEqual([]);
  });

  it("preserves server errors and explains network failures and uncertain timeouts", () => {
    const missing = new ApiError("No device found", 404);
    expect(invitationError(missing)).toBe(missing);
    expect(invitationError(new TypeError("Failed to fetch")).message).toContain(
      "Check your connection"
    );
    expect(
      invitationError(new DOMException("Timed out", "TimeoutError")).message
    ).toContain("Check your invitations");
  });
});
