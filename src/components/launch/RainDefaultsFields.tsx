import { useEffect, useState } from "react";
import { Field } from "@/components/launch/ui";
import { parseSupplyInput } from "@/services/assets";
import { amountToRaw, formatRainAsset, rawToAmount, type RainDefaults } from "@/services/rainDefaults";

type Props = {
  value: RainDefaults;
  onChange: (next: RainDefaults) => void;
  precision: number;
  symbol: string;
  disabled?: boolean;
};

function stripTrailingZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function RainAmountField({
  label,
  hint,
  raw,
  precision,
  symbol,
  disabled,
  onRaw,
}: {
  label: string;
  hint: string;
  raw: number;
  precision: number;
  symbol: string;
  disabled?: boolean;
  onRaw: (raw: number) => void;
}) {
  const [text, setText] = useState(() => (raw > 0 ? stripTrailingZeros(rawToAmount(raw, precision)) : ""));
  useEffect(() => {
    setText((prev) => {
      if (amountToRaw(prev, precision) === raw) return prev;
      return raw > 0 ? stripTrailingZeros(rawToAmount(raw, precision)) : "";
    });
  }, [raw, precision]);
  const shown = formatRainAsset(amountToRaw(text, precision), precision, symbol);
  return (
    <Field
      label={label}
      hint={hint}
      aside={<span className="font-mono text-xs text-muted-foreground">({shown})</span>}
    >
      <input
        className="input font-mono"
        inputMode="decimal"
        aria-label={label}
        disabled={disabled}
        value={text}
        placeholder="0"
        onChange={(e) => {
          const next = parseSupplyInput(e.target.value);
          setText(next);
          onRaw(amountToRaw(next, precision));
        }}
      />
    </Field>
  );
}

export function RainDefaultsFields({ value, onChange, precision, symbol, disabled = false }: Props) {
  const patch = (p: Partial<RainDefaults>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-3 rounded-2xl border bg-background/50 p-4">
      <div>
        <p className="text-sm font-semibold">Reflection Minimums for users to receive, and the contract to rain.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <RainAmountField
          label="Per Holder"
          hint="Skip holders below this balance."
          raw={value.rainMinHold}
          precision={precision}
          symbol={symbol}
          disabled={disabled}
          onRaw={(rainMinHold) => patch({ rainMinHold })}
        />
        <RainAmountField
          label="Minimum Pool"
          hint="Do not rain unless the reflection pool is at least this much."
          raw={value.rainMinPool}
          precision={precision}
          symbol={symbol}
          disabled={disabled}
          onRaw={(rainMinPool) => patch({ rainMinPool })}
        />
      </div>
    </div>
  );
}
