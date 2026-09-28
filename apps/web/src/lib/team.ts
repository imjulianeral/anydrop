import { authRequest } from "#/lib/auth.ts";

export type TeamRole = "owner" | "member";

export interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  role: TeamRole;
  joined_at: string;
}

export interface TeamInvitation {
  id: string;
  email: string;
  status: "pending" | "accepted" | "revoked";
  expires_at: string;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  role: TeamRole;
  members: TeamMember[];
  /** Only the owner sees pending invitations. */
  invitations: TeamInvitation[];
}

export interface InvitationPreview {
  team: string;
  invited_by: string | null;
  /** Partly hidden, such as `j•••@example.com`. */
  email: string;
  expires_at: string;
}

export const getTeam = () => authRequest<{ team: Team | null }>("team");

export const createTeam = (csrfToken: string, name: string) =>
  authRequest<{ team: Team }>("team", csrfToken, { name });

export const renameTeam = (csrfToken: string, name: string) =>
  authRequest<{ team: Team }>("team", csrfToken, { name }, "PATCH");

export const deleteTeam = (csrfToken: string) =>
  authRequest("team", csrfToken, undefined, "DELETE");

export const leaveTeam = (csrfToken: string) =>
  authRequest("team/leave", csrfToken);

/** Emails the invitation and returns its link, to share another way if needed. */
export const inviteToTeam = (csrfToken: string, email: string) =>
  authRequest<{ invitation: TeamInvitation; url: string }>(
    "team/invitations",
    csrfToken,
    { email }
  );

export const revokeTeamInvitation = (csrfToken: string, id: string) =>
  authRequest(
    `team/invitations/${encodeURIComponent(id)}`,
    csrfToken,
    undefined,
    "DELETE"
  );

export const removeTeamMember = (csrfToken: string, userId: string) =>
  authRequest(
    `team/members/${encodeURIComponent(userId)}`,
    csrfToken,
    undefined,
    "DELETE"
  );

export const previewTeamInvitation = (token: string) =>
  authRequest<{ invitation: InvitationPreview }>(
    `team/join/${encodeURIComponent(token)}`
  );

export const acceptTeamInvitation = (csrfToken: string, token: string) =>
  authRequest<{ team: { id: string; name: string } }>(
    `team/join/${encodeURIComponent(token)}`,
    csrfToken
  );
