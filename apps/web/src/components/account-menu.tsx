import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import {
  ArrowLeft,
  ArrowRight,
  Fingerprint,
  LogOut,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AccountAvatar } from "#/components/account-avatar.tsx";
import { useAccountSession } from "#/components/account-session.tsx";
import type { GuestTab } from "#/components/account-session.tsx";
import { GoogleIcon } from "#/components/account/google-icon.tsx";
import { InlineRename } from "#/components/account/inline-rename.tsx";
import {
  PasskeyChooser,
  passkeyFlowCopy,
} from "#/components/account/passkey-chooser.tsx";
import type { PasskeyFlow } from "#/components/account/passkey-chooser.tsx";
import { SecurityPanel } from "#/components/account/security-panel.tsx";
import { Button as ActionButton } from "#/components/motion/button/base.tsx";
import { MorphingModal } from "#/components/motion/morphing-modal.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "#/components/motion/tabs.tsx";
import { CircleUser } from "#/components/rune-icons.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog.tsx";
import { attempt } from "#/lib/attempt.ts";
import {
  addPasskey,
  deleteAccount,
  isAccountNotFound,
  isReauthRequired,
  logout,
  reauthenticateWithPasskey,
  removePasskey,
  renamePasskey,
  signalAccount,
  signInWithPasskey,
  signUpWithPasskey,
  startGoogle,
  unlinkGoogle,
  updateProfile,
} from "#/lib/auth.ts";
import type {
  AccountSession,
  AccountUser,
  PasskeyAuthenticator,
} from "#/lib/auth.ts";

type View = "home" | "security" | PasskeyFlow;

/** Remembers which view to reopen after a Google redirect. */
const RESUME_KEY = "phemera:account-view";

const resumableViews = new Set<View>(["security", "add"]);

function rememberView(view: View) {
  try {
    sessionStorage.setItem(RESUME_KEY, view);
  } catch {
    // Storage can be unavailable; the menu then reopens on the profile.
  }
}

function takeRememberedView(): View | null {
  try {
    const view = sessionStorage.getItem(RESUME_KEY) as View | null;
    sessionStorage.removeItem(RESUME_KEY);
    return view && resumableViews.has(view) ? view : null;
  } catch {
    return null;
  }
}

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : "Sign-in failed. Please try again.";

/** Google and passkey options for one guest tab. */
function GuestOptions({
  mode,
  session,
  busy,
  passkeysSupported,
  onGoogle,
  onPasskey,
}: {
  mode: GuestTab;
  session: AccountSession | null;
  busy: boolean;
  passkeysSupported: boolean;
  onGoogle: () => void;
  onPasskey: () => void;
}) {
  const signingIn = mode === "signin";
  return (
    <>
      {session?.google_enabled ? (
        <ActionButton className="w-full" disabled={busy} onClick={onGoogle}>
          <GoogleIcon />
          {signingIn ? "Sign in with Google" : "Sign up with Google"}
        </ActionButton>
      ) : null}
      {session && !session.google_enabled ? (
        <p className="text-muted-foreground text-sm">
          Google sign-in is currently unavailable.
        </p>
      ) : null}
      <ActionButton
        variant="outline"
        className="w-full"
        disabled={busy || !passkeysSupported}
        onClick={onPasskey}
      >
        {signingIn ? (
          <Fingerprint aria-hidden="true" className="size-4" />
        ) : (
          <UserPlus aria-hidden="true" className="size-4" />
        )}
        {signingIn ? "Sign in with a passkey" : "Create with a passkey"}
      </ActionButton>
      {!passkeysSupported && (
        <p className="text-muted-foreground text-sm">
          This browser does not support passkeys. Try a supported browser over
          HTTPS.
        </p>
      )}
    </>
  );
}

/** What the header says for each view. */
function headerCopy(
  view: View,
  user: AccountUser | null | undefined,
  guestTab: GuestTab
) {
  if (view === "signin" || view === "signup" || view === "add") {
    return passkeyFlowCopy[view];
  }
  if (view === "security") {
    return {
      title: "Sign-in & security",
      description: "Passkeys and accounts you can sign in with.",
    };
  }
  if (user) {
    return { title: "Your profile", description: "Your account, at a glance." };
  }
  return guestTab === "signin"
    ? {
        title: "Welcome back",
        description: "Sign in with Google or a passkey.",
      }
    : {
        title: "Create your Phemera account",
        description: "Use Google, or just a name and a passkey.",
      };
}

/** "2 passkeys · Google": the ways this account can sign in. */
function signInSummary(user: AccountUser) {
  const count = user.passkeys.length;
  const methods: string[] = [];
  if (count > 0) {
    methods.push(`${count} ${count === 1 ? "passkey" : "passkeys"}`);
  }
  if (user.google) {
    methods.push("Google");
  }
  return methods.join(" · ");
}

function AccountHome({
  user,
  busy,
  passkeysSupported,
  onRename,
  onAddPasskey,
  onOpenSecurity,
  onSignOut,
}: {
  user: AccountUser;
  busy: boolean;
  passkeysSupported: boolean;
  onRename: (name: string) => Promise<boolean>;
  onAddPasskey: () => void;
  onOpenSecurity: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex flex-col gap-5" aria-busy={busy}>
      <div className="flex items-center gap-4 py-2">
        <AccountAvatar className="size-12" picture={user.google?.picture} />
        <div className="min-w-0 flex-1">
          <InlineRename
            value={user.name}
            label="your name"
            busy={busy}
            onSave={onRename}
          >
            <p className="truncate font-medium">{user.name}</p>
            <p className="text-muted-foreground truncate text-sm">
              {user.email ?? "Passkey account"}
            </p>
          </InlineRename>
        </div>
      </div>
      {user.passkeys.length === 0 && passkeysSupported && (
        <div className="bg-primary/5 flex flex-col gap-3 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Fingerprint
              aria-hidden="true"
              className="text-primary mt-0.5 size-5 shrink-0"
            />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Create a passkey</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Sign in faster with your fingerprint, face or screen lock — and
                without Google.
              </p>
            </div>
          </div>
          <ActionButton
            className="w-full"
            disabled={busy}
            onClick={onAddPasskey}
          >
            Create a passkey
          </ActionButton>
        </div>
      )}
      <ActionButton
        variant="secondary"
        className="h-auto w-full justify-between py-2.5"
        onClick={onOpenSecurity}
      >
        <ShieldCheck aria-hidden="true" className="size-4" />
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
          <span>Sign-in & security</span>
          <span className="text-muted-foreground text-xs font-normal">
            {signInSummary(user)}
          </span>
        </span>
        <ArrowRight aria-hidden="true" className="size-4" />
      </ActionButton>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Your transfer history stays with this browser. Signing in does not
        restore another device’s history.
      </p>
      <ActionButton
        variant="ghost"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive w-full"
        disabled={busy}
        onClick={onSignOut}
      >
        <LogOut aria-hidden="true" className="size-4" />
        Sign out
      </ActionButton>
    </div>
  );
}

function isPasskeyFlow(view: View): view is PasskeyFlow {
  return view === "signin" || view === "signup" || view === "add";
}

function TriggerIcon({ user }: { user: AccountUser | null | undefined }) {
  if (!user) {
    return <CircleUser className="size-5" />;
  }
  return <AccountAvatar picture={user.google?.picture} />;
}

function AccountMessages({
  error,
  notice,
}: {
  error: string | null;
  notice: string | null;
}) {
  return (
    <>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {notice ? (
        <output aria-live="polite" className="text-muted-foreground text-sm">
          {notice}
        </output>
      ) : null}
    </>
  );
}

export function AccountMenu() {
  const { session, unavailable, refresh, registerAccountMenu } =
    useAccountSession();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("home");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signupName, setSignupName] = useState("");
  const [guestTab, setGuestTab] = useState<GuestTab>("signin");
  const passkeysSupported = browserSupportsWebAuthn();
  const user = session?.user;
  const { title, description } = headerCopy(view, user, guestTab);

  // The page's first session can reopen the menu with a Google result or an
  // error, and other parts of the app (such as Your devices) open it too.
  useEffect(
    () =>
      registerAccountMenu({
        open: (tab) => {
          setErrorMessage(null);
          setNotice(null);
          setView("home");
          if (tab) {
            setGuestTab(tab);
          }
          setOpen(true);
        },
        loaded: (current) => {
          if (current.user) {
            signalAccount(current.rp_id, current.user);
          }
          const resumeView = takeRememberedView();
          if (current.error_code === "account_not_found") {
            setGuestTab("signup");
          }
          if (current.error || current.notice) {
            setErrorMessage(current.error);
            setNotice(current.notice);
            setView(current.user && resumeView ? resumeView : "home");
            setOpen(true);
          }
        },
      }),
    [registerAccountMenu]
  );

  const shownError =
    errorMessage ??
    (unavailable
      ? "Account service is unavailable. Guest sharing is still available."
      : null);

  const go = (next: View) => {
    setErrorMessage(null);
    setNotice(null);
    setView(next);
  };

  /**
   * Runs an account action with the latest session. The action returns the
   * success message to show, or null when it navigated away (Google).
   */
  const run = async (
    action: (current: AccountSession) => Promise<string | null>,
    nextView?: View
  ) => {
    setBusy(true);
    setErrorMessage(null);
    setNotice(null);
    await attempt(
      async () => {
        const message = await action(await refresh());
        if (message === null) {
          return;
        }
        const updated = await refresh();
        if (updated.user) {
          signalAccount(updated.rp_id, updated.user);
        }
        setNotice(message);
        if (nextView) {
          setView(nextView);
        }
      },
      {
        onError: (error) => setErrorMessage(describeError(error)),
        onSettled: () => setBusy(false),
      }
    );
  };

  /**
   * Performs a sensitive change. When the server asks for a fresh check, the
   * person confirms with one of their passkeys (or Google, if they have none)
   * and the change is retried — no separate "verify" step to manage.
   */
  const sensitive = async (
    current: AccountSession,
    change: (csrfToken: string) => Promise<unknown>,
    resumeView: View
  ): Promise<boolean> => {
    try {
      await change(current.csrf_token);
      return true;
    } catch (error) {
      if (!(isReauthRequired(error) && current.user)) {
        throw error;
      }
    }
    if (current.user?.passkeys.length) {
      await reauthenticateWithPasskey(current.csrf_token);
      await change(current.csrf_token);
      return true;
    }
    rememberView(resumeView);
    await startGoogle(current.csrf_token, "reauth");
    return false;
  };

  const choosePasskey = (
    flow: PasskeyFlow,
    authenticator: PasskeyAuthenticator
  ) =>
    run(
      async (current) => {
        if (flow === "signup") {
          await signUpWithPasskey(
            current.csrf_token,
            signupName.trim(),
            authenticator
          );
          setSignupName("");
          return "Account created. Welcome to Phemera!";
        }
        if (flow === "signin") {
          try {
            await signInWithPasskey(
              current.csrf_token,
              authenticator,
              current.rp_id
            );
          } catch (error) {
            if (isAccountNotFound(error)) {
              setGuestTab("signup");
              setView("home");
            }
            throw error;
          }
          return "Signed in with your passkey.";
        }
        const done = await sensitive(
          current,
          (csrf) => addPasskey(csrf, authenticator),
          "add"
        );
        return done
          ? "Passkey added. You can use it the next time you sign in."
          : null;
      },
      flow === "add" ? "security" : "home"
    );

  const renameWith =
    (change: (csrf: string, name: string) => Promise<unknown>) =>
    async (name: string) => {
      let saved = false;
      await run(async (current) => {
        await change(current.csrf_token, name);
        saved = true;
        return "Saved.";
      });
      return saved;
    };

  const isFlowView = isPasskeyFlow(view);
  const triggerLabel = user ? "Your account" : "Sign in";
  const modalViewId = `${user ? "user" : "guest"}-${view}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          go("home");
        }
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={triggerLabel}
            title={triggerLabel}
            className="focus-visible:ring-ring focus-visible:ring-offset-background flex size-full cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          />
        }
      >
        <TriggerIcon user={user} />
      </DialogTrigger>
      <DialogPortal keepMounted>
        <MorphingModal
          viewId={open ? modalViewId : null}
          onClose={() => setOpen(false)}
          placement="bottom"
          className="max-h-full"
        >
          <DialogPrimitive.Popup className="-m-5 flex max-h-[min(36rem,calc(100dvh-var(--app-dock-space)-2rem))] flex-col gap-5 overflow-y-auto p-6 outline-none">
            <div className="flex items-start gap-3">
              {view !== "home" && !isFlowView && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Back"
                  onClick={() => go("home")}
                >
                  <ArrowLeft />
                </Button>
              )}
              <div className="min-w-0 flex-1">
                <DialogHeader>
                  <DialogTitle>{title}</DialogTitle>
                  <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
              </div>
              <DialogClose
                render={<Button variant="ghost" size="icon" />}
                aria-label="Close account"
              >
                <X />
              </DialogClose>
            </div>

            {isFlowView && (
              <PasskeyChooser
                flow={view}
                name={signupName}
                busy={busy}
                onNameChange={setSignupName}
                onCancel={() => go(view === "add" ? "security" : "home")}
                onChoose={(authenticator) => choosePasskey(view, authenticator)}
              />
            )}

            {!isFlowView && user && view === "security" && (
              <SecurityPanel
                user={user}
                googleEnabled={session.google_enabled}
                busy={busy}
                onAddPasskey={() => go("add")}
                onRenamePasskey={(id, name) =>
                  renameWith((csrf, value) => renamePasskey(csrf, id, value))(
                    name
                  )
                }
                onRemovePasskey={(passkey) =>
                  run(async (current) =>
                    (await sensitive(
                      current,
                      (csrf) => removePasskey(csrf, passkey.id),
                      "security"
                    ))
                      ? `Removed “${passkey.name}”.`
                      : null
                  )
                }
                onConnectGoogle={() =>
                  run(async (current) => {
                    await sensitive(
                      current,
                      (csrf) => startGoogle(csrf, "link"),
                      "security"
                    );
                    return null;
                  })
                }
                onDisconnectGoogle={() =>
                  run(async (current) =>
                    (await sensitive(current, unlinkGoogle, "security"))
                      ? "Google account disconnected."
                      : null
                  )
                }
                onDeleteAccount={() =>
                  run(async (current) => {
                    const done = await sensitive(
                      current,
                      deleteAccount,
                      "security"
                    );
                    if (done && current.user) {
                      await signalAccount(current.rp_id, {
                        ...current.user,
                        passkeys: [],
                      });
                    }
                    return done ? "Your account was deleted." : null;
                  }, "home")
                }
              />
            )}

            {!isFlowView && user && view === "home" && (
              <AccountHome
                user={user}
                busy={busy}
                passkeysSupported={passkeysSupported}
                onRename={renameWith(updateProfile)}
                onAddPasskey={() => go("add")}
                onOpenSecurity={() => go("security")}
                onSignOut={() =>
                  run(async (current) => {
                    await logout(current.csrf_token);
                    return "Signed out. You can keep sharing as a guest.";
                  })
                }
              />
            )}

            {!isFlowView && !user && (
              <Tabs
                variant="underline"
                value={guestTab}
                onValueChange={(tab) => {
                  setErrorMessage(null);
                  setNotice(null);
                  setGuestTab(tab === "signup" ? "signup" : "signin");
                }}
                className="flex flex-col"
              >
                <TabsList className="flex w-full">
                  <TabsTrigger value="signin" className="flex-1 justify-center">
                    Sign in
                  </TabsTrigger>
                  <TabsTrigger value="signup" className="flex-1 justify-center">
                    Create account
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="signin" className="flex flex-col gap-3">
                  <GuestOptions
                    mode="signin"
                    session={session}
                    busy={busy}
                    passkeysSupported={passkeysSupported}
                    onGoogle={() =>
                      run(async (current) => {
                        await startGoogle(current.csrf_token, "sign_in");
                        return null;
                      })
                    }
                    onPasskey={() => go("signin")}
                  />
                </TabsContent>
                <TabsContent value="signup" className="flex flex-col gap-3">
                  <GuestOptions
                    mode="signup"
                    session={session}
                    busy={busy}
                    passkeysSupported={passkeysSupported}
                    onGoogle={() =>
                      run(async (current) => {
                        await startGoogle(current.csrf_token, "sign_up");
                        return null;
                      })
                    }
                    onPasskey={() => go("signup")}
                  />
                </TabsContent>
                <DialogClose
                  render={
                    <ActionButton variant="ghost" className="mt-3 w-full" />
                  }
                >
                  Continue as a guest
                </DialogClose>
              </Tabs>
            )}

            <AccountMessages error={shownError} notice={notice} />
          </DialogPrimitive.Popup>
        </MorphingModal>
      </DialogPortal>
    </Dialog>
  );
}
