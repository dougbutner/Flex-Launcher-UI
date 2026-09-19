import { useEffect, useRef, useState } from "react";
import { Field } from "@/components/launch/ui";
import { bpsToPercentInput, percentInputToBps, sanitizePercentInput } from "@/services/taxRates";

type Props = {
  label: string;
  bps: number;
  onBps: (n: number) => void;
  hint?: string;
  disabled?: boolean;
  sentence?: boolean;
  placeholder?: string;
  /** Empty string when bps is 0 (Insider Max). Tax fields show "0". */
  emptyZero?: boolean;
};

export function PctBpsField({
  label,
  bps,
  onBps,
  hint,
  disabled,
  sentence,
  placeholder,
  emptyZero = false,
}: Props) {
  const editing = useRef(false);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => bpsToPercentInput(bps, emptyZero));

  useEffect(() => {
    if (editing.current) return;
    setText(bpsToPercentInput(bps, emptyZero));
  }, [bps, emptyZero]);

  const live = percentInputToBps(text);
  const showBps = focused || text !== "";

  return (
    <Field
      label={label}
      hint={hint}
      sentence={sentence}
      aside={
        showBps ? <span className="font-mono text-[11px] font-medium text-muted-foreground">{live} bps</span> : null
      }
    >
      <div className="relative">
        <input
          className="input font-mono pr-8"
          inputMode="decimal"
          placeholder={placeholder}
          disabled={disabled}
          value={text}
          onFocus={() => {
            editing.current = true;
            setFocused(true);
          }}
          onBlur={() => {
            editing.current = false;
            setFocused(false);
            setText(bpsToPercentInput(bps, emptyZero));
          }}
          onChange={(e) => {
            const next = sanitizePercentInput(e.target.value);
            setText(next);
            onBps(percentInputToBps(next));
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          %
        </span>
      </div>
    </Field>
  );
}
