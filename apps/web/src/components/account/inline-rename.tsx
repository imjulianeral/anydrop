import { Check, LoaderCircle, Pencil, X } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";

const MAX_NAME_LENGTH = 80;

/** Shows a value with a pencil button that swaps it for a small rename form. */
export function InlineRename({
  value,
  label,
  busy,
  onSave,
  children,
}: {
  value: string;
  /** Accessible name, e.g. "passkey name". */
  label: string;
  busy: boolean;
  onSave: (name: string) => Promise<boolean>;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">{children}</div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${label}`}
          disabled={busy}
          onClick={() => setDraft(value)}
        >
          <Pencil />
        </Button>
      </div>
    );
  }

  const name = draft.trim();
  const save = async () => {
    if (name === value) {
      setDraft(null);
      return;
    }
    if (await onSave(name)) {
      setDraft(null);
    }
  };

  return (
    <form
      className="flex min-w-0 items-center gap-1"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Input
        aria-label={label}
        value={draft}
        maxLength={MAX_NAME_LENGTH}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the edit button the person just pressed
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setDraft(null);
          }
        }}
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        aria-label={busy ? `Saving ${label}` : `Save ${label}`}
        disabled={busy || name === ""}
      >
        {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Cancel"
        disabled={busy}
        onClick={() => setDraft(null)}
      >
        <X />
      </Button>
    </form>
  );
}
