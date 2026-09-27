import { Cloud, Fingerprint, KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";

import { GoogleIcon } from "#/components/account/google-icon.tsx";
import { InlineRename } from "#/components/account/inline-rename.tsx";
import { Button as ActionButton } from "#/components/motion/button/base.tsx";
import { Button } from "#/components/ui/button.tsx";
import type { AccountPasskey, AccountUser } from "#/lib/auth.ts";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const formatDate = (value: string) => dateFormat.format(new Date(value));

function passkeyDetails(passkey: AccountPasskey) {
  const kind = passkey.backed_up ? "Synced" : "This device or key only";
  const used = passkey.last_used_at
    ? `last used ${formatDate(passkey.last_used_at)}`
    : `added ${formatDate(passkey.created_at)}`;
  return `${kind} · ${used}`;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
      {children}
    </h3>
  );
}

export function SecurityPanel({
  user,
  googleEnabled,
  busy,
  onAddPasskey,
  onRenamePasskey,
  onRemovePasskey,
  onConnectGoogle,
  onDisconnectGoogle,
  onDeleteAccount,
}: {
  user: AccountUser;
  googleEnabled: boolean;
  busy: boolean;
  onAddPasskey: () => void;
  onRenamePasskey: (id: string, name: string) => Promise<boolean>;
  onRemovePasskey: (passkey: AccountPasskey) => void;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  onDeleteAccount: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const signInMethods = user.passkeys.length + (user.google ? 1 : 0);
  const isLastMethod = signInMethods <= 1;
  const lastMethodHint = "Add another way to sign in before removing this one.";

  return (
    <div className="flex flex-col gap-6" aria-busy={busy}>
      <section className="flex flex-col gap-3">
        <SectionTitle>Passkeys</SectionTitle>
        {user.passkeys.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Passkeys let you sign in with your fingerprint, face, screen lock or
            security key — no Google needed.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {user.passkeys.map((passkey) => {
              const Icon = passkey.backed_up ? Cloud : KeyRound;
              return (
                <li
                  key={passkey.id}
                  className="bg-muted/40 flex items-center gap-3 rounded-2xl py-2 pr-1 pl-3"
                >
                  <Icon
                    aria-hidden="true"
                    className="text-muted-foreground size-4 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <InlineRename
                      value={passkey.name}
                      label="passkey name"
                      busy={busy}
                      onSave={(name) => onRenamePasskey(passkey.id, name)}
                    >
                      <p className="truncate text-sm font-medium">
                        {passkey.name}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {passkeyDetails(passkey)}
                      </p>
                    </InlineRename>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy || isLastMethod}
                    title={isLastMethod ? lastMethodHint : undefined}
                    aria-label={`Remove ${passkey.name}`}
                    onClick={() => onRemovePasskey(passkey)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <ActionButton
          variant="secondary"
          className="w-full"
          disabled={busy}
          onClick={onAddPasskey}
        >
          <Fingerprint aria-hidden="true" className="size-4" />
          Add a passkey
        </ActionButton>
      </section>

      {(user.google || googleEnabled) && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Connected accounts</SectionTitle>
          <div className="bg-muted/40 flex items-center gap-3 rounded-2xl py-2 pr-2 pl-3">
            <GoogleIcon />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Google</p>
              <p className="text-muted-foreground truncate text-xs">
                {user.google
                  ? (user.google.email ?? "Connected")
                  : "Sign in with your Google account too"}
              </p>
            </div>
            {user.google ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || isLastMethod}
                title={isLastMethod ? lastMethodHint : undefined}
                onClick={onDisconnectGoogle}
              >
                Disconnect
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={onConnectGoogle}
              >
                Connect
              </Button>
            )}
          </div>
          {isLastMethod && (
            <p className="text-muted-foreground text-xs">
              This is your only way to sign in, so it can’t be removed yet.
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle>Danger zone</SectionTitle>
        {confirmingDelete ? (
          <div className="border-destructive/40 flex flex-col gap-3 rounded-2xl border p-3">
            <p className="text-sm">
              Delete your account, passkeys and connected Google sign-in? Your
              shares and transfer history on this browser stay as they are.
            </p>
            <div className="flex gap-2">
              <ActionButton
                variant="ghost"
                className="flex-1"
                disabled={busy}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </ActionButton>
              <ActionButton
                variant="outline"
                className="border-destructive text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive flex-1"
                disabled={busy}
                onClick={onDeleteAccount}
              >
                Delete account
              </ActionButton>
            </div>
          </div>
        ) : (
          <ActionButton
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive w-full"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Delete account
          </ActionButton>
        )}
      </section>
    </div>
  );
}
