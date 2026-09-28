import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAccountSession } from "#/components/account-session.tsx";
import { InlineRename } from "#/components/account/inline-rename.tsx";
import { Button } from "#/components/motion/button/base.tsx";
import { StatefulButton } from "#/components/motion/button/stateful.tsx";
import { Input } from "#/components/motion/input.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { Copy } from "#/components/rune-icons.tsx";
import { attempt } from "#/lib/attempt.ts";
import { island } from "#/lib/island.ts";
import {
  createTeam,
  deleteTeam,
  getTeam,
  inviteToTeam,
  leaveTeam,
  removeTeamMember,
  renameTeam,
  revokeTeamInvitation,
} from "#/lib/team.ts";
import type { Team } from "#/lib/team.ts";

const MAX_TEAM_NAME_LENGTH = 80;

/**
 * Enterprise teams: the owner invites people by email, and every member can
 * reach every other member's saved devices from anywhere.
 */
export function TeamPanel() {
  const { session, refresh: refreshAccount } = useAccountSession();
  const [team, setTeam] = useState<Team | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const enterprise = session?.user?.plan === "enterprise";

  const load = useCallback(
    () =>
      attempt(
        async () => {
          const result = await getTeam();
          setTeam(result.team);
        },
        {
          onError: (caught) => island.error("Could not load your team", caught),
          onSettled: () => setLoaded(true),
        }
      ),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs a team change with a fresh CSRF token, then reloads the team. */
  const change = <T,>(
    task: (csrf: string) => Promise<T>,
    failure: string
  ): Promise<T | null> => {
    setBusy(true);
    return attempt(
      async () => {
        const account = await refreshAccount();
        const result = await task(account.csrf_token);
        await load();
        await refreshAccount();
        return result;
      },
      {
        onError: (caught) => {
          island.error(failure, caught);
          return null;
        },
        onSettled: () => setBusy(false),
      }
    );
  };

  if (!loaded) {
    return (
      <section aria-label="Team" className="p-4">
        <Loader label="Loading your team" variant="dots" />
      </section>
    );
  }

  return (
    <section
      aria-label="Team"
      className="flex max-h-[min(36rem,calc(100dvh-var(--app-dock-space)-4rem))] flex-col gap-6 overflow-y-auto p-4"
    >
      {team ? (
        <TeamDetails team={team} busy={busy} change={change} />
      ) : (
        <CreateTeam enterprise={enterprise} busy={busy} change={change} />
      )}
    </section>
  );
}

type Change = <T>(
  task: (csrf: string) => Promise<T>,
  failure: string
) => Promise<T | null>;

function CreateTeam({
  enterprise,
  busy,
  change,
}: {
  enterprise: boolean;
  busy: boolean;
  change: Change;
}) {
  const [name, setName] = useState("");

  if (!enterprise) {
    return (
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">Team</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          You’re not on a team. Teams are part of the enterprise plan; ask your
          team’s owner for an invitation.
        </p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void change(
          (csrf) => createTeam(csrf, name.trim()),
          "Could not create the team"
        );
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">Create your team</h2>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Invite people by email. Everyone on the team can send to each other’s
          saved devices from any network.
        </p>
      </div>
      <Input
        label="Team name"
        value={name}
        onChange={setName}
        maxLength={MAX_TEAM_NAME_LENGTH}
        disabled={busy}
        autoComplete="organization"
      />
      <StatefulButton
        type="submit"
        state={busy ? "loading" : "idle"}
        loadingText="Creating"
        disabled={busy || !name.trim()}
      >
        Create team
      </StatefulButton>
    </form>
  );
}

function TeamDetails({
  team,
  busy,
  change,
}: {
  team: Team;
  busy: boolean;
  change: Change;
}) {
  const { session } = useAccountSession();
  const [confirming, setConfirming] = useState(false);
  const owner = team.role === "owner";
  const selfId = session?.user?.id;
  const exitLabel = owner ? "Delete team" : "Leave team";

  return (
    <>
      <div className="flex flex-col gap-1">
        {owner ? (
          <InlineRename
            value={team.name}
            label="team name"
            busy={busy}
            onSave={async (next) =>
              (await change(
                (csrf) => renameTeam(csrf, next),
                "Could not rename the team"
              )) !== null
            }
          >
            <h2 className="truncate text-base font-medium">{team.name}</h2>
          </InlineRename>
        ) : (
          <h2 className="truncate text-base font-medium">{team.name}</h2>
        )}
        <p className="text-muted-foreground text-xs leading-relaxed">
          Members reach each other’s saved devices from any network, and the
          team appears as a group you can send to.
        </p>
      </div>

      {owner ? <InviteForm team={team} busy={busy} change={change} /> : null}

      <div className="flex flex-col gap-3">
        <h3 className="text-muted-foreground tracking-eyebrow text-xs uppercase">
          Members · {team.members.length}
        </h3>
        <ul className="flex flex-col gap-3" aria-label="Team members">
          {team.members.map((member) => (
            <li key={member.id} className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-sm font-medium">
                  {member.name}
                  {member.id === selfId ? " (you)" : ""}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {member.role === "owner" ? "Owner" : "Member"}
                  {member.email ? ` · ${member.email}` : ""}
                </p>
              </div>
              {owner && member.role !== "owner" ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${member.name} from the team`}
                  disabled={busy}
                  onClick={() =>
                    void change(
                      (csrf) => removeTeamMember(csrf, member.id),
                      "Could not remove the member"
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {owner && team.invitations.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-muted-foreground tracking-eyebrow text-xs uppercase">
            Pending invitations
          </h3>
          <ul className="flex flex-col gap-3" aria-label="Pending invitations">
            {team.invitations.map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate text-sm">{invitation.email}</p>
                  <p className="text-muted-foreground text-xs">
                    Expires{" "}
                    {new Date(invitation.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void change(
                      (csrf) => revokeTeamInvitation(csrf, invitation.id),
                      "Could not revoke the invitation"
                    )
                  }
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs leading-relaxed">
            {owner
              ? "Everyone loses access to each other's devices, and pending invitations stop working."
              : "You'll lose access to your teammates' devices until someone invites you again."}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              className="bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive flex-1"
              disabled={busy}
              onClick={() =>
                void change(
                  (csrf) => (owner ? deleteTeam(csrf) : leaveTeam(csrf)),
                  owner
                    ? "Could not delete the team"
                    : "Could not leave the team"
                )
              }
            >
              {exitLabel}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          className="bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive w-full"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          {exitLabel}
        </Button>
      )}
    </>
  );
}

function InviteForm({
  team,
  busy,
  change,
}: {
  team: Team;
  busy: boolean;
  change: Change;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ email: string; url: string } | null>(null);

  const invite = async () => {
    const address = email.trim();
    const result = await change(
      (csrf) => inviteToTeam(csrf, address),
      "Could not send the invitation"
    );
    if (result) {
      setSent({ email: result.invitation.email, url: result.url });
      setEmail("");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void invite();
        }}
      >
        <Input
          label={`Invite to ${team.name}`}
          type="email"
          placeholder="name@company.com"
          value={email}
          onChange={setEmail}
          disabled={busy}
          autoComplete="email"
        />
        <StatefulButton
          type="submit"
          state={busy ? "loading" : "idle"}
          loadingText="Inviting"
          disabled={busy || !email.trim()}
        >
          Send invitation
        </StatefulButton>
      </form>
      {sent ? (
        <div className="bg-primary/5 flex flex-col gap-2 rounded-2xl p-3">
          <p className="text-xs leading-relaxed">
            Invitation sent to {sent.email}. If it doesn’t arrive, send them
            this link instead. It works once and expires in 7 days.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void copyLink(sent.url)}
          >
            <Copy />
            Copy invitation link
          </Button>
        </div>
      ) : null}
    </div>
  );
}

async function copyLink(url: string) {
  await attempt(
    async () => {
      await navigator.clipboard.writeText(url);
      island.notice({
        title: "Link copied",
        description: "Send it to the person you invited.",
        kind: "success",
      });
    },
    { onError: (caught) => island.error("Could not copy", caught) }
  );
}
