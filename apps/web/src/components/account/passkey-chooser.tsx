import { ArrowRight, KeyRound, Smartphone } from "lucide-react";
import { useId } from "react";

import { Button as ActionButton } from "#/components/motion/button/base.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import type { PasskeyAuthenticator } from "#/lib/auth.ts";

export type PasskeyFlow = "signin" | "signup" | "add";

export const passkeyFlowCopy: Record<
  PasskeyFlow,
  { title: string; description: string }
> = {
  signin: {
    title: "Sign in with a passkey",
    description: "Where is your passkey saved?",
  },
  signup: {
    title: "Create an account",
    description: "No email or password — just a name and a passkey.",
  },
  add: {
    title: "Add a passkey",
    description: "Choose where to save your new passkey.",
  },
};

const authenticatorOptions: {
  value: PasskeyAuthenticator;
  label: string;
  description: string;
  icon: typeof Smartphone;
}[] = [
  {
    value: "app",
    label: "Passkey app or phone",
    description:
      "This device, a password manager, or scan a QR code with your phone.",
    icon: Smartphone,
  },
  {
    value: "security_key",
    label: "Security key",
    description: "A YubiKey or another USB or NFC key.",
    icon: KeyRound,
  },
];

export function PasskeyChooser({
  flow,
  name,
  busy,
  onNameChange,
  onChoose,
  onCancel,
}: {
  flow: PasskeyFlow;
  name: string;
  busy: boolean;
  onNameChange: (name: string) => void;
  onChoose: (authenticator: PasskeyAuthenticator) => void;
  onCancel: () => void;
}) {
  const nameId = useId();
  const needsName = flow === "signup";
  const nameMissing = needsName && name.trim() === "";

  return (
    <div className="flex flex-col gap-3" aria-busy={busy}>
      {needsName && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={nameId}>Your name</Label>
          <Input
            id={nameId}
            value={name}
            maxLength={80}
            autoComplete="name"
            placeholder="Ada Lovelace"
            onChange={(event) => onNameChange(event.target.value)}
          />
        </div>
      )}
      <p className="text-muted-foreground text-sm">
        {flow === "signin" ? "Use a passkey from" : "Save your passkey in"}
      </p>
      {authenticatorOptions.map((option) => {
        const Icon = option.icon;
        return (
          <ActionButton
            key={option.value}
            variant="secondary"
            className="h-auto w-full justify-between py-2.5"
            disabled={busy || nameMissing}
            onClick={() => onChoose(option.value)}
          >
            <Icon aria-hidden="true" className="size-4" />
            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
              <span>{option.label}</span>
              <span className="text-muted-foreground text-xs font-normal whitespace-normal">
                {option.description}
              </span>
            </span>
            <ArrowRight aria-hidden="true" className="size-4" />
          </ActionButton>
        );
      })}
      <ActionButton
        variant="ghost"
        className="w-full"
        disabled={busy}
        onClick={onCancel}
      >
        Back
      </ActionButton>
    </div>
  );
}
