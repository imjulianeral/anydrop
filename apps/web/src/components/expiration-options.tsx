import { useId } from "react";

import {
  MorphSelect,
  MorphSelectContent,
  MorphSelectItem,
  MorphSelectTrigger,
  MorphSelectValue,
} from "#/components/motion/select-morph.tsx";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field.tsx";
import {
  expirationCounts,
  expirationDurations,
} from "#/lib/expiration-options.ts";
import type { ExpirationOptions as Options } from "#/lib/expiration-options.ts";

export function ExpirationOptions({
  value,
  onChange,
  disabled = false,
  kind,
  compact = false,
}: {
  value: Options;
  onChange: (value: Options) => void;
  disabled?: boolean;
  kind: "file" | "text" | "url";
  compact?: boolean;
}) {
  const id = useId();
  const unit = kind === "file" ? "download" : "open";
  return (
    <FieldGroup className={compact ? "gap-2" : undefined}>
      <div className="grid grid-cols-2 gap-3">
        <Field data-disabled={disabled}>
          <FieldLabel id={`${id}-time`}>Expires after</FieldLabel>
          <MorphSelect
            aria-labelledby={`${id}-time`}
            value={String(value.expiresIn)}
            disabled={disabled}
            onValueChange={(seconds) =>
              onChange({ ...value, expiresIn: Number(seconds) })
            }
          >
            <MorphSelectTrigger>
              <MorphSelectValue />
            </MorphSelectTrigger>
            <MorphSelectContent>
              {expirationDurations.map((duration) => (
                <MorphSelectItem
                  key={duration.value}
                  value={String(duration.value)}
                >
                  {duration.label}
                </MorphSelectItem>
              ))}
            </MorphSelectContent>
          </MorphSelect>
        </Field>
        <Field data-disabled={disabled}>
          <FieldLabel id={`${id}-count`}>
            {kind === "file" ? "Download limit" : "Open limit"}
          </FieldLabel>
          <MorphSelect
            aria-labelledby={`${id}-count`}
            value={
              value.maxDownloads === null
                ? "unlimited"
                : String(value.maxDownloads)
            }
            disabled={disabled}
            onValueChange={(count) =>
              onChange({
                ...value,
                maxDownloads: count === "unlimited" ? null : Number(count),
              })
            }
          >
            <MorphSelectTrigger>
              <MorphSelectValue />
            </MorphSelectTrigger>
            <MorphSelectContent>
              <MorphSelectItem value="unlimited">Unlimited</MorphSelectItem>
              {expirationCounts.map((count) => (
                <MorphSelectItem
                  key={count}
                  value={String(count)}
                >{`${count} ${unit}${count === 1 ? "" : "s"}`}</MorphSelectItem>
              ))}
            </MorphSelectContent>
          </MorphSelect>
        </Field>
      </div>
      <FieldDescription className={compact ? "text-xs" : undefined}>
        {compact ? (
          "Ends at the first limit; downloads count when started."
        ) : (
          <>
            Expires when either limit is reached.
            {kind === "file"
              ? " A download counts when it starts."
              : " Each time the item is opened counts."}
          </>
        )}
      </FieldDescription>
    </FieldGroup>
  );
}
