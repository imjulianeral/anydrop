import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Fingerprint, UserPlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  AccountSessionProvider,
  useAccountSession,
} from "#/components/account-session.tsx";
import { GoogleIcon } from "#/components/account/google-icon.tsx";
import { PasskeyChooser } from "#/components/account/passkey-chooser.tsx";
import { Button } from "#/components/motion/button/base.tsx";
import { StatefulButton } from "#/components/motion/button/stateful.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { attempt } from "#/lib/attempt.ts";
import {
  signInWithPasskey,
  signUpWithPasskey,
  startGoogle,
} from "#/lib/auth.ts";
import type { PasskeyAuthenticator } from "#/lib/auth.ts";
import { acceptTeamInvitation, previewTeamInvitation } from "#/lib/team.ts";
import type { InvitationPreview } from "#/lib/team.ts";

export const Route = createFileRoute("/join/$token")({
  component: JoinPage,
});

function JoinPage() {
  return (
    <AccountSessionProvider>
      <main className="bg-background flex min-h-svh items-center justify-center p-5">
        <div className="bg-card flex w-full max-w-sm flex-col gap-6 rounded-3xl border p-6">
          <JoinTeam />
        </div>
      </main>
    </AccountSessionProvider>
  );
}

type Step = "choose" | "signup" | "signin";

const describe = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Try again.";

/**
 * Where an emailed team invitation lands. Someone without an account creates
 * one here (Google comes back to this page) and joins in the same step.
 */
function JoinTeam() {
  const { token } = Route.useParams();
  const { session, unavailable, refresh } = useAccountSession();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("choose");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoAccepted = useRef(false);
  const user = session?.user;
  const returnTo = `/join/${encodeURIComponent(token)}`;

  useEffect(() => {
    void attempt(
      async () => {
        const result = await previewTeamInvitation(token);
        setPreview(result.invitation);
      },
      { onError: (caught) => setInvalid(describe(caught)) }
    );
  }, [token]);

  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    await attempt(task, {
      onError: (caught) => setError(describe(caught)),
      onSettled: () => setBusy(false),
    });
  }, []);

  const accept = useCallback(
    () =>
      run(async () => {
        const current = await refresh();
        const result = await acceptTeamInvitation(current.csrf_token, token);
        setJoined(result.team.name);
      }),
    [run, refresh, token]
  );

  // Coming back from Google sign-up, finish joining without another click.
  useEffect(() => {
    if (!user || !session?.notice || !preview || autoAccepted.current) {
      return;
    }
    autoAccepted.current = true;
    void accept();
  }, [user, session?.notice, preview, accept]);

  const google = (intent: "sign_up" | "sign_in") =>
    run(async () => {
      const current = await refresh();
      await startGoogle(current.csrf_token, intent, returnTo);
    });

  const passkey = (
    flow: "signup" | "signin",
    authenticator: PasskeyAuthenticator
  ) =>
    run(async () => {
      const current = await refresh();
      await (flow === "signup"
        ? signUpWithPasskey(current.csrf_token, name.trim(), authenticator)
        : signInWithPasskey(current.csrf_token, authenticator, current.rp_id));
      const signedIn = await refresh();
      const result = await acceptTeamInvitation(signedIn.csrf_token, token);
      setJoined(result.team.name);
    });

  if (joined) {
    return (
      <>
        <Heading
          title={`You joined ${joined}`}
          description="Save your devices from Your devices in the dock. Teammates can reach saved devices from any network."
        />
        <Link
          to="/"
          className="bg-primary text-primary-foreground inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-medium"
        >
          Open Phemera
        </Link>
      </>
    );
  }

  if (invalid) {
    return (
      <>
        <Heading title="Invitation unavailable" description={invalid} />
        <Link to="/" className="text-sm underline underline-offset-4">
          Go to Phemera
        </Link>
      </>
    );
  }

  if (!preview || (!session && !unavailable)) {
    return <Loader label="Loading invitation" variant="dots" />;
  }

  const invitedBy = preview.invited_by ?? "Someone";

  return (
    <>
      <Heading
        title={`Join ${preview.team}`}
        description={`${invitedBy} invited ${preview.email} to their team on Phemera. Members can send to each other's saved devices from anywhere.`}
      />

      {user ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Signed in as {user.email ?? user.name}.
          </p>
          <StatefulButton
            state={busy ? "loading" : "idle"}
            loadingText="Joining"
            disabled={busy}
            onClick={() => void accept()}
          >
            Join {preview.team}
          </StatefulButton>
        </div>
      ) : null}

      {!user && step === "choose" ? (
        <GuestChoices
          googleEnabled={Boolean(session?.google_enabled)}
          busy={busy}
          onGoogle={(intent) => void google(intent)}
          onPasskey={setStep}
        />
      ) : null}

      {!user && step !== "choose" ? (
        <PasskeyChooser
          flow={step}
          name={name}
          busy={busy}
          onNameChange={setName}
          onCancel={() => setStep("choose")}
          onChoose={(authenticator) => void passkey(step, authenticator)}
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </>
  );
}

function GuestChoices({
  googleEnabled,
  busy,
  onGoogle,
  onPasskey,
}: {
  googleEnabled: boolean;
  busy: boolean;
  onGoogle: (intent: "sign_up" | "sign_in") => void;
  onPasskey: (step: Step) => void;
}) {
  const passkeysSupported = browserSupportsWebAuthn();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Create your account to join</p>
      {googleEnabled ? (
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => onGoogle("sign_up")}
        >
          <GoogleIcon />
          Sign up with Google
        </Button>
      ) : null}
      <Button
        variant="outline"
        className="w-full"
        disabled={busy || !passkeysSupported}
        onClick={() => onPasskey("signup")}
      >
        <UserPlus aria-hidden="true" className="size-4" />
        Create with a passkey
      </Button>
      <p className="text-muted-foreground pt-2 text-xs">
        Already have an account?
      </p>
      <div className="flex gap-2">
        {googleEnabled ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onGoogle("sign_in")}
          >
            <GoogleIcon />
            Sign in with Google
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || !passkeysSupported}
          onClick={() => onPasskey("signin")}
        >
          <Fingerprint aria-hidden="true" className="size-4" />
          Sign in with a passkey
        </Button>
      </div>
    </div>
  );
}

function Heading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground tracking-eyebrow text-xs uppercase">
        Phemera team
      </p>
      <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {description}
      </p>
    </div>
  );
}
