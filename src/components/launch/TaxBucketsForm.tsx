import { hasAngelChannels, type FlexProgram } from "@/config/launch";
import { Field } from "@/components/launch/ui";
import {
  bpsToPercentInput,
  formatBpsPercent,
  hasProjectTax,
  percentInputToBps,
  taxSum,
  type TaxDraft,
} from "@/services/taxRates";

type Props = {
  program: FlexProgram;
  value: TaxDraft;
  onChange: (next: TaxDraft) => void;
  /** When set, overall total is frozen and shown read-only. */
  lockedTotal?: number | null;
  disabled?: boolean;
  /** Wizard can hide channel ops if desired; default show for flexforex. */
  showChannels?: boolean;
};

function PctInput(props: {
  label: string;
  bps: number;
  disabled?: boolean;
  onBps: (n: number) => void;
  hint?: string;
}) {
  return (
    <Field label={props.label} hint={props.hint}>
      <div className="relative">
        <input
          className="input font-mono pr-8"
          inputMode="decimal"
          disabled={props.disabled}
          value={bpsToPercentInput(props.bps)}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.]/g, "");
            const parts = raw.split(".");
            const cleaned = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}` : parts[0];
            props.onBps(percentInputToBps(cleaned));
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          %
        </span>
      </div>
    </Field>
  );
}

export function TaxBucketsForm({
  program,
  value,
  onChange,
  lockedTotal = null,
  disabled = false,
  showChannels,
}: Props) {
  const projectOk = hasProjectTax(program);
  const channelsOk = showChannels ?? hasAngelChannels(program);
  const sum = taxSum(value, program);
  const locked = lockedTotal != null && Number.isFinite(lockedTotal);
  const patch = (p: Partial<TaxDraft>) => onChange({ ...value, ...p });
  const channelRest = Math.max(0, 10000 - value.angelNumbersBps - value.jackpotBps);

  return (
    <div className="space-y-4 rounded-2xl border bg-background/50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Transfer tax</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {locked
              ? "Overall tax is locked on chain. Move bps between buckets only."
              : "Pick any overall rate at create. After create you can only reallocate buckets."}
          </p>
        </div>
        <p className={`font-mono text-sm font-bold ${locked && sum !== lockedTotal ? "text-destructive" : ""}`}>
          Overall {formatBpsPercent(sum)}
          {locked ? ` / ${formatBpsPercent(lockedTotal!)}` : ""}
        </p>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${projectOk ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <PctInput
          label="Reflection"
          bps={value.reflectionRate}
          disabled={disabled}
          onBps={(reflectionRate) => patch({ reflectionRate })}
          hint="Goes to the reflection pool (makeitrain)."
        />
        <PctInput
          label="Burn"
          bps={value.burnRate}
          disabled={disabled}
          onBps={(burnRate) => patch({ burnRate })}
          hint="Queued burn on successful splash."
        />
        {projectOk ? (
          <PctInput
            label="Project"
            bps={value.projectRate}
            disabled={disabled}
            onBps={(projectRate) => patch({ projectRate })}
            hint="Project pool paid to the project account."
          />
        ) : null}
      </div>

      {projectOk ? (
        <Field
          label="Project account"
          hint={locked ? "Where project tax is sent." : "Blank uses your issuer account."}
        >
          <input
            className="input font-mono"
            placeholder={locked ? "project account" : "blank = issuer"}
            disabled={disabled}
            value={value.projectAccount}
            onChange={(e) => patch({ projectAccount: e.target.value.trim().toLowerCase() })}
          />
        </Field>
      ) : null}

      {channelsOk ? (
        <div className="space-y-3 border-t border-border pt-4">
          <div>
            <p className="text-sm font-semibold">Reflection channels</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Share of the reflection fee only. Does not raise the transfer tax. Remainder stays in the standard
              reflection pool.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PctInput
              label="Angel numbers"
              bps={value.angelNumbersBps}
              disabled={disabled}
              onBps={(angelNumbersBps) => patch({ angelNumbersBps })}
            />
            <PctInput
              label="Jackpot"
              bps={value.jackpotBps}
              disabled={disabled}
              onBps={(jackpotBps) => patch({ jackpotBps })}
            />
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">
            Standard splash keeps {formatBpsPercent(channelRest)} of the reflection fee.
          </p>
        </div>
      ) : null}
    </div>
  );
}
