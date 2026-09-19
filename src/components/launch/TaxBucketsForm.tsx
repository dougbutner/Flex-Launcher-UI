import { hasAngelChannels, type FlexProgram } from "@/config/launch";
import { PctBpsField } from "@/components/launch/PctBpsField";
import { Field } from "@/components/launch/ui";
import {
  formatBpsPercent,
  hasProjectTax,
  taxAdjustValid,
  taxCreateValid,
  taxSum,
  type TaxDraft,
} from "@/services/taxRates";

type Props = {
  program: FlexProgram;
  value: TaxDraft;
  onChange: (next: TaxDraft) => void;
  disabled?: boolean;
  showChannels?: boolean;
  /** After the first setfees, pass on-chain rates so later edits follow contract rules. */
  chain?: TaxDraft | null;
};

export function TaxBucketsForm({
  program,
  value,
  onChange,
  disabled = false,
  showChannels,
  chain = null,
}: Props) {
  const projectOk = hasProjectTax(program);
  const channelsOk = showChannels ?? hasAngelChannels(program);
  const sum = taxSum(value, program);
  const adjusting = Boolean(chain && taxSum(chain, program) > 0);
  const err = adjusting && chain ? taxAdjustValid(value, program, chain) : taxCreateValid(value, program);
  const patch = (p: Partial<TaxDraft>) => onChange({ ...value, ...p });
  const channelRest = Math.max(0, 10000 - value.angelNumbersBps - value.jackpotBps);

  return (
    <div className="space-y-4 rounded-2xl border bg-background/50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Transfer tax</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {adjusting
              ? "Total cannot rise. Reflection cannot go down. Burn and project can move, or you can cut them to lower the total."
              : "Signed with setfees after create (create writes 0%). Sum must be at most 100%."}
          </p>
        </div>
        <p className={`font-mono text-sm font-bold ${err?.startsWith("⟁") ? "text-destructive" : ""}`}>
          Overall {formatBpsPercent(sum)}
          {adjusting && chain ? ` / ${formatBpsPercent(taxSum(chain, program))} max` : ""}
        </p>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${projectOk ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <PctBpsField
          label="Reflection"
          bps={value.reflectionRate}
          disabled={disabled}
          onBps={(reflectionRate) => {
            const next = adjusting && chain ? Math.max(chain.reflectionRate, reflectionRate) : reflectionRate;
            patch({ reflectionRate: next });
          }}
          hint={
            adjusting
              ? `Cannot go below ${formatBpsPercent(chain?.reflectionRate ?? 0)}.`
              : "Goes to the reflection pool (makeitrain)."
          }
        />
        <PctBpsField
          label="Burn"
          bps={value.burnRate}
          disabled={disabled}
          onBps={(burnRate) => patch({ burnRate })}
          hint="Queued burn on successful splash."
        />
        {projectOk ? (
          <PctBpsField
            label="Project"
            bps={value.projectRate}
            disabled={disabled}
            onBps={(projectRate) => patch({ projectRate })}
            hint="Project pool paid to the project account."
          />
        ) : null}
      </div>

      {projectOk ? (
        <Field label="Project account" hint="Blank uses the issuer.">
          <input
            className="input font-mono"
            placeholder="blank = issuer"
            disabled={disabled}
            value={value.projectAccount}
            onChange={(e) => patch({ projectAccount: e.target.value.trim().toLowerCase() })}
          />
        </Field>
      ) : null}

      {err ? <p className="text-xs font-medium text-destructive">{err}</p> : null}

      {channelsOk ? (
        <div className="space-y-3 border-t border-border pt-4">
          <div>
            <p className="text-sm font-semibold">Reflection channels</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Share of the reflection fee only. Signed with ratios. Does not raise the transfer tax. Remainder stays
              in the standard reflection pool.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PctBpsField
              label="Angel numbers"
              bps={value.angelNumbersBps}
              disabled={disabled}
              onBps={(angelNumbersBps) => patch({ angelNumbersBps })}
            />
            <PctBpsField
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
