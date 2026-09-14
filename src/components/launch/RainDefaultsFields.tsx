import { Field } from "@/components/launch/ui";
import { rainRaw, type RainDefaults } from "@/services/rainDefaults";

type Props = {
  value: RainDefaults;
  onChange: (next: RainDefaults) => void;
  disabled?: boolean;
};

export function RainDefaultsFields({ value, onChange, disabled = false }: Props) {
  const patch = (p: Partial<RainDefaults>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-3 rounded-2xl border bg-background/50 p-4">
      <div>
        <p className="text-sm font-semibold">Make it rain defaults</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Frontend only. Every Make it rain poke fills makeitrain min_hold and min_pool from these when either is
          above 0. 0 omits those args (one whole token hold floor, no pool precheck).
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Min hold (raw)" hint="Skip holders below this raw balance.">
          <input
            className="input font-mono"
            inputMode="numeric"
            disabled={disabled}
            value={value.rainMinHold ? String(value.rainMinHold) : ""}
            placeholder="0"
            onChange={(e) => patch({ rainMinHold: rainRaw(e.target.value.replace(/\D/g, "")) })}
          />
        </Field>
        <Field label="Min pool (raw)" hint="Refuse the poke if reflection_pool is below this.">
          <input
            className="input font-mono"
            inputMode="numeric"
            disabled={disabled}
            value={value.rainMinPool ? String(value.rainMinPool) : ""}
            placeholder="0"
            onChange={(e) => patch({ rainMinPool: rainRaw(e.target.value.replace(/\D/g, "")) })}
          />
        </Field>
      </div>
    </div>
  );
}
