import { useId } from "react";

import { Button } from "#/components/motion/button/index.tsx";
import { Input } from "#/components/motion/input.tsx";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field.tsx";

export function PasswordOptions({
  password,
  onChange,
  disabled = false,
}: {
  password: string | null;
  onChange: (password: string | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <FieldGroup>
      <Field>
        <Button
          type="button"
          variant="outline"
          aria-pressed={password !== null}
          disabled={disabled}
          onClick={() => onChange(password === null ? "" : null)}
        >
          {password === null ? "Add a password" : "Password protection on"}
        </Button>
      </Field>
      {password === null ? null : (
        <Field data-disabled={disabled}>
          <FieldLabel htmlFor={id}>Link password</FieldLabel>
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            value={password}
            minLength={12}
            maxLength={1024}
            required
            disabled={disabled}
            aria-describedby={`${id}-hint`}
            onChange={onChange}
          />
          <FieldDescription id={`${id}-hint`}>
            Use at least 12 characters, ideally several random words. Share the
            password separately. We cannot recover it. Anyone with the short
            link still needs this password before the destination opens.
          </FieldDescription>
        </Field>
      )}
    </FieldGroup>
  );
}
