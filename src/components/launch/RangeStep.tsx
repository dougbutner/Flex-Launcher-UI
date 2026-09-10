import { FEE_TIERS, LOCK_MIN_DAYS, RANGE_WIDTH_PRESETS } from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import {
  applyRangeWidth,
  fmtPrice,
  planFromDraft,
  presetFromDraft,
  quoteFromDraft,
  rangeStepValid,
} from "@/components/launch/draftPlan";
import { Field, StepShell } from "@/components/launch/ui";

type Props = {
  draft: LaunchDraft;
  patch: (p: Partial<LaunchDraft>) => void;
  onNext: () => void;
  onBack: () => void;
};

export function RangeStep({ draft, patch, onNext, onBack }: Props) {
  const invalid = rangeStepValid(draft);
  const preset = presetFromDraft(draft);
  const quote = quoteFromDraft(draft);
  const plan = planFromDraft(draft);

  return (
    <StepShell
      title="Range & lock"
      desc={`One-sided: buyers walk the range paying ${quote.symbol} as your token sells out. The pool starts below (or above) the range so 100% of supply is deposited.`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn btn-primary" disabled={Boolean(invalid)} onClick={onNext}>
            Continue
          </button>
        </>
      }
    >
      <Field label="Fee tier" hint="Swap fee on every trade through this pool.">
        <div className="grid grid-cols-3 gap-2">
          {FEE_TIERS.map((t) => (
            <button
              key={t.fee}
              type="button"
              onClick={() => patch({ fee: t.fee })}
              className={`rounded-xl border px-3 py-2.5 text-center transition-all ${
                draft.fee === t.fee
                  ? "border-primary bg-primary/10"
                  : "border-input bg-background/50 hover:border-primary/40"
              }`}
            >
              <div className={`font-mono text-sm font-bold ${draft.fee === t.fee ? "text-primary" : ""}`}>{t.label}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">spacing {t.spacing}</div>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Range width" hint="Keeps your start price. Sets max from the multiplier (or Alcor max tick for Fast).">
        <div className="grid grid-cols-3 gap-2">
          {RANGE_WIDTH_PRESETS.map((w) => {
            const selected = draft.rangeWidthId === w.id;
            return (
              <button
                key={w.id}
                type="button"
                title={w.title}
                onClick={() => patch(applyRangeWidth(draft, w.id))}
                className={`rounded-xl border px-3 py-5 text-center transition-all ${
                  selected
                    ? "border-primary bg-primary/10 shadow-[0_0_24px_-8px_hsl(var(--primary)/0.8)]"
                    : "border-input bg-background/50 hover:border-primary/40"
                }`}
              >
                <div className={`text-lg font-black tracking-tight ${selected ? "text-primary" : ""}`}>{w.label}</div>
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={`Start price (${quote.symbol} / ${draft.symbol || "TOKEN"})`} hint={`Suggested cap: ${preset.priceLower} - ${preset.priceUpper}.`}>
          <input
            className="input font-mono"
            inputMode="decimal"
            value={draft.priceLower}
            onChange={(e) =>
              patch({ priceLower: e.target.value.replace(/[^\d.]/g, ""), rangeWidthId: null })
            }
          />
        </Field>
        <Field label={`Max price (${quote.symbol} / ${draft.symbol || "TOKEN"})`} hint="Highest price someone can pay here.">
          <input
            className="input font-mono"
            inputMode="decimal"
            value={draft.priceUpper}
            onChange={(e) =>
              patch({ priceUpper: e.target.value.replace(/[^\d.]/g, ""), rangeWidthId: null })
            }
          />
        </Field>
      </div>

      <Field label="Liquidity lock (days)" hint="Minimum 90. Alcor can only extend a lock, never shorten it.">
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={LOCK_MIN_DAYS}
            max={730}
            step={1}
            value={Math.max(LOCK_MIN_DAYS, draft.lockDays)}
            onChange={(e) => patch({ lockDays: Number(e.target.value) })}
            className="flex-1 accent-[hsl(var(--primary))]"
          />
          <span className="w-24 text-right font-mono text-sm font-bold">
            {Math.max(LOCK_MIN_DAYS, draft.lockDays)}d
          </span>
        </div>
      </Field>

      {invalid ? <p className="text-xs font-medium text-warning">{invalid}</p> : null}

      {plan ? (
        <div className="space-y-3 rounded-2xl border border-accent/25 bg-accent/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-accent">On-chain preview</div>
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <div className="text-muted-foreground">Tick lower</div>
              <div className="font-mono font-bold">{plan.tickLower}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Tick upper</div>
              <div className="font-mono font-bold">{plan.tickUpper}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Start tick</div>
              <div className="font-mono font-bold">{plan.startTick}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Token{plan.launchedIsA ? "A" : "B"} = you</div>
              <div className="font-mono font-bold">
                {plan.launchedIsA ? plan.tokenA.symbol : plan.tokenB.symbol}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Buyers pay between{" "}
            <span className="font-mono font-semibold text-foreground">
              {fmtPrice(plan.quotePerTokenLower)} - {fmtPrice(plan.quotePerTokenUpper)} {quote.symbol}
            </span>{" "}
            per {draft.symbol} as they walk the range.
          </p>
          <p className="break-all font-mono text-[10px] text-muted-foreground/70">sqrtPriceX64 {plan.sqrtPriceX64}</p>
        </div>
      ) : null}
    </StepShell>
  );
}
