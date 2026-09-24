import { useState } from "react";
import { Field } from "@/components/launch/ui";
import { localToUnix, unixToLocal } from "@/services/insidersClub";

type Props = {
  label: string;
  hint: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

/** Local datetime-local, or unix seconds. Both store a value localToUnix understands. */
export function ClubTimeField({ label, hint, value, disabled, onChange }: Props) {
  const [stamp, setStamp] = useState(false);
  const unix = localToUnix(value);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";

  return (
    <Field
      sentence
      label={label}
      hint={stamp ? `Unix seconds. ${zone} converts to this clock time.` : `${hint} Shown in ${zone}.`}
      aside={
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => setStamp((v) => !v)}
        >
          timestamp
        </button>
      }
    >
      {stamp ? (
        <input
          className="input club-time font-mono"
          inputMode="numeric"
          placeholder="unix seconds"
          value={unix ? String(unix) : ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        />
      ) : (
        <input
          type="datetime-local"
          step={1}
          className="input club-time"
          value={unix ? unixToLocal(unix) : ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}
