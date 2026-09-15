import { useEffect, useMemo, useRef, useState } from "react";
import { FEE_TIERS, LOCK_MIN_DAYS, LOCK_SLIDER_MAX_DAYS, RANGE_WIDTH_PRESETS, START_MCAP_MORE_ROWS, START_MCAP_PRESETS } from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import {
  applyRangeWidth,
  applyStartMarketCap,
  fmtPrice,
  planFromDraft,
  presetFromDraft,
  quoteFromDraft,
  rangeStepValid,
} from "@/components/launch/draftPlan";
import { RangeMoreInfo } from "@/components/launch/RangeMoreInfo";
import { Field, StepShell } from "@/components/launch/ui";
import { maxLockDays, rangeImpact, USD_BUY_PROBE, type RangeImpact } from "@/services/launchMath";
import { formatPlainNumber, fmtUsd } from "@/services/money";
import { fetchAlcorUsdPrice } from "@/services/xtokenCatalog";

type Props = {
  draft: LaunchDraft;
  patch: (p: Partial<LaunchDraft>) => void;
  onNext: () => void;
  onBack: () => void;
  locked?: boolean;
};

function usd(n: number | null | undefined): string {
  if (n == null) return "-";
  return fmtUsd(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "-";
  if (n >= 100) return "100%";
  if (n >= 99.5) return `${(Math.floor(n * 100) / 100).toFixed(2)}%`;
  if (n >= 10) return `${n.toFixed(1)}%`;
  if (n >= 1) return `${n.toFixed(2)}%`;
  if (n >= 0.01) return `${n.toFixed(3)}%`;
  return `${formatPlainNumber(n)}%`;
}

function ImpactStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="break-all font-mono text-sm font-bold leading-snug text-foreground">{value}</div>
      {hint ? <div className="mt-0.5 break-all text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function impactDoubleLabel(impact: RangeImpact): string {
  if (impact.usdToDouble != null && impact.usdToDouble > 0) return usd(impact.usdToDouble);
  return "-";
}

export function RangeStep({ draft, patch, onNext, onBack, locked = false }: Props) {
  const invalid = rangeStepValid(draft);
  const preset = presetFromDraft(draft);
  const quote = quoteFromDraft(draft);
  const plan = planFromDraft(draft);
  const [quoteUsd, setQuoteUsd] = useState(0);
  const eosioMaxDays = maxLockDays();
  const sliderMax = Math.min(eosioMaxDays, Math.max(LOCK_SLIDER_MAX_DAYS, draft.lockDaysMax || 0, draft.lockDays));
  const days = Math.min(sliderMax, Math.max(LOCK_MIN_DAYS, draft.lockDays));
  const [moreMcap, setMoreMcap] = useState(false);
  const [moreInfo, setMoreInfo] = useState(false);
  const [editLock, setEditLock] = useState(false);
  const [lockText, setLockText] = useState("");
  const lockInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editLock) return;
    lockInputRef.current?.focus();
    lockInputRef.current?.select();
  }, [editLock]);

  useEffect(() => {
    let live = true;
    void fetchAlcorUsdPrice(quote.contract, quote.symbol)
      .then((n) => {
        if (live) setQuoteUsd(n);
      })
      .catch(() => {
        if (live) setQuoteUsd(0);
      });
    return () => {
      live = false;
    };
  }, [quote.contract, quote.symbol]);

  const impact = useMemo(
    () => (plan ? rangeImpact(plan, draft.maxSupply, quoteUsd) : null),
    [plan, draft.maxSupply, quoteUsd]
  );

  const widthImpacts = useMemo(() => {
    return RANGE_WIDTH_PRESETS.map((w) => {
      const next = applyRangeWidth(draft, w.id);
      const widthPlan = planFromDraft({ ...draft, ...next });
      return {
        id: w.id,
        impact: widthPlan ? rangeImpact(widthPlan, draft.maxSupply, quoteUsd) : null,
        lo: next.priceLower,
        hi: next.priceUpper,
      };
    });
  }, [draft, quoteUsd]);

  const commitLock = (raw: string) => {
    const n = Math.floor(Number(String(raw).replace(/[^\d]/g, "")));
    const next =
      Number.isFinite(n) && n > 0 ? Math.min(eosioMaxDays, Math.max(LOCK_MIN_DAYS, n)) : days;
    patch({ lockDays: next, lockDaysMax: Math.min(eosioMaxDays, Math.max(LOCK_SLIDER_MAX_DAYS, next)) });
    setEditLock(false);
  };

  return (
    <StepShell
      title="Price Range & lock"
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
      {locked ? (
        <p className="text-xs text-warning">
          Create already landed. Range and lock are frozen so execute preflight cannot drift.
        </p>
      ) : null}
      <Field label="Fee tier" hint="Swap fee on every trade through this pool.">
        <div className="grid grid-cols-3 gap-2">
          {FEE_TIERS.map((t) => (
            <button
              key={t.fee}
              type="button"
              disabled={locked}
              onClick={() => patch({ fee: t.fee })}
              className={`rounded-xl border px-3 py-5 text-center transition-all ${
                draft.fee === t.fee
                  ? "border-primary bg-primary/10"
                  : "border-input bg-background/50 hover:border-primary/40"
              }`}
            >
              <div className={`font-mono text-lg font-black tracking-tight ${draft.fee === t.fee ? "text-primary" : ""}`}>{t.label}</div>
            </button>
          ))}
        </div>
      </Field>

      <Field
        label="Range width"
        hint="Keeps your start price. Sets max from the multiplier (or Alcor max tick for Fast). 2x cost and $100 size use this width's liquidity density."
      >
        <div className="grid grid-cols-3 gap-2">
          {RANGE_WIDTH_PRESETS.map((w) => {
            const selected = draft.rangeWidthId === w.id;
            const row = widthImpacts.find((x) => x.id === w.id);
            const wi = row?.impact;
            return (
              <button
                key={w.id}
                type="button"
                title={w.title}
                disabled={locked}
                onClick={() => patch(applyRangeWidth(draft, w.id))}
                className={`rounded-xl border px-2 py-3 text-center transition-all sm:px-3 sm:py-4 ${
                  selected
                    ? "border-primary bg-primary/10 shadow-[0_0_24px_-8px_hsl(var(--primary)/0.8)]"
                    : "border-input bg-background/50 hover:border-primary/40"
                }`}
              >
                <div className={`text-lg font-black tracking-tight ${selected ? "text-primary" : ""}`}>{w.label}</div>
                {row ? (
                  <div className="mt-1 font-mono text-[9px] leading-tight text-muted-foreground">
                    {fmtPrice(Number(row.lo))} - {fmtPrice(Number(row.hi))}
                  </div>
                ) : null}
                {wi ? (
                  <div className="mt-1.5 space-y-0.5 text-[10px] leading-tight text-muted-foreground">
                    <div>
                      2x {wi.usdToDouble != null && wi.usdToDouble > 0 ? usd(wi.usdToDouble) : "-"}
                    </div>
                    <div>
                      ${USD_BUY_PROBE} {fmtPct(wi.supplyPctForUsd)}
                    </div>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </Field>

      <Field
        label="Starting market cap"
        aside={
          <button type="button" className="link text-xs" onClick={() => setMoreMcap((v) => !v)}>
            {moreMcap ? "fewer" : "more options"}
          </button>
        }
        hint={
          quoteUsd > 0
            ? "Sets start price from max supply and USD. Max price stays put."
            : `No USD yet. These set start FDV in ${quote.symbol}. Max price stays put.`
        }
      >
        <div className="space-y-2">
          {(moreMcap ? START_MCAP_MORE_ROWS : [START_MCAP_PRESETS]).map((row, i) => (
            <div key={i} className="grid grid-cols-3 gap-2">
              {row.map((m) => {
                const supply = Number(draft.maxSupply);
                const implied =
                  supply > 0 && Number(draft.priceLower) > 0
                    ? supply * Number(draft.priceLower) * (quoteUsd > 0 ? quoteUsd : 1)
                    : 0;
                const selected = implied > 0 && Math.abs(implied - m.usd) / m.usd < 0.04;
                return (
                  <button
                    key={`${i}-${m.id}`}
                    type="button"
                    disabled={locked || !(supply > 0)}
                    onClick={() => patch(applyStartMarketCap(draft, m.usd, quoteUsd))}
                    className={`rounded-xl border px-3 py-5 text-center transition-all ${
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-input bg-background/50 hover:border-primary/40"
                    } ${locked || !(supply > 0) ? "opacity-60" : ""}`}
                  >
                    <div className={`font-mono text-lg font-black tracking-tight ${selected ? "text-primary" : ""}`}>
                      {m.label}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={`Start price (${quote.symbol} / ${draft.symbol || "TOKEN"})`} hint={`Suggested cap: ${preset.priceLower} - ${preset.priceUpper}.`}>
          <input
            className="input font-mono"
            inputMode="decimal"
            value={draft.priceLower}
            disabled={locked}
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
            disabled={locked}
            onChange={(e) =>
              patch({ priceUpper: e.target.value.replace(/[^\d.]/g, ""), rangeWidthId: null })
            }
          />
        </Field>
      </div>

      {impact ? (
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ImpactStat
              label="Initial market cap"
              value={usd(impact.initialMarketCapUsd)}
              hint={`${fmtPrice(impact.startQuotePerToken)} ${quote.symbol} x supply`}
            />
            <ImpactStat
              label="Cost to 2x"
              value={impactDoubleLabel(impact)}
              hint={
                impact.doubledCapped
                  ? "Max is under 2x. This is the cost to walk the whole range."
                  : `USD to move start to ${fmtPrice(impact.doubledQuotePerToken)} ${quote.symbol}. Includes swap fee.`
              }
            />
            <ImpactStat
              label={`$${USD_BUY_PROBE} buys`}
              value={fmtPct(impact.supplyPctForUsd)}
              hint={
                impact.tokensForUsd != null
                  ? impact.usdWalkCapped
                    ? `${fmtPrice(impact.tokensForUsd)} ${draft.symbol || "TOKEN"}. Walks every tick bucket.`
                    : `Last bucket ${usd(impact.usdLastBucket)}. Top half of ticks ${usd(
                        impact.usdExpensiveHalf
                      )}. Full range ${usd(impact.usdToClearRange)}.`
                  : quoteUsd > 0
                    ? "Need a USD price from Alcor."
                    : "Waiting on USD from Alcor."
              }
            />
          </div>
          <div className="mt-2 flex justify-end">
            <button type="button" className="link text-xs" onClick={() => setMoreInfo((v) => !v)}>
              {moreInfo ? "hide" : "more info"}
            </button>
          </div>
          {moreInfo && plan ? (
            <RangeMoreInfo
              plan={plan}
              maxSupply={draft.maxSupply}
              quoteUsd={quoteUsd}
              quoteSymbol={quote.symbol}
              tokenSymbol={draft.symbol || "TOKEN"}
              initialMarketCapUsd={impact.initialMarketCapUsd}
              bucketCount={impact.bucketCount}
              usdLastBucket={impact.usdLastBucket}
              usdCheapHalf={impact.usdCheapHalf}
              usdExpensiveHalf={impact.usdExpensiveHalf}
              usdToClearRange={impact.usdToClearRange}
            />
          ) : null}
        </div>
      ) : null}

      <Field
        label="Liquidity lock (days)"
        hint="Minimum 90. Double-click the days to type a longer lock. Caps at 7 Feb 2106 (EOSIO time_point_sec max)."
      >
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={LOCK_MIN_DAYS}
            max={sliderMax}
            step={1}
            value={Math.min(sliderMax, days)}
            disabled={locked}
            onChange={(e) => patch({ lockDays: Number(e.target.value) })}
            className="flex-1 accent-[hsl(var(--primary))]"
          />
          {editLock && !locked ? (
            <input
              ref={lockInputRef}
              className="input w-28 py-1 text-right font-mono text-sm font-bold"
              inputMode="numeric"
              value={lockText}
              onChange={(e) => setLockText(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={() => commitLock(lockText)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitLock(lockText);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEditLock(false);
                }
              }}
            />
          ) : (
            <span
              role="button"
              aria-label={`${days} days. Double-click to type`}
              className={`w-28 text-right font-mono text-sm font-bold ${locked ? "" : "cursor-text select-none"}`}
              title={locked ? undefined : "Double-click to type days"}
              onDoubleClick={() => {
                if (locked) return;
                setLockText(String(days));
                setEditLock(true);
              }}
            >
              {days}d
            </span>
          )}
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
            <span className="break-all font-mono font-semibold text-foreground">
              {fmtPrice(plan.quotePerTokenLower)} - {fmtPrice(plan.quotePerTokenUpper)} {quote.symbol}
            </span>{" "}
            per {draft.symbol} as they walk the range.
          </p>
          <p className="text-[10px] text-muted-foreground/80">
            USD holds the quote's Alcor spot still. Token price walks initialized Alcor ticks (same
            step math as swap routing), including the{" "}
            {FEE_TIERS.find((t) => t.fee === draft.fee)?.label ?? "swap"} fee.
          </p>
          <p className="break-all font-mono text-[10px] text-muted-foreground/70">sqrtPriceX64 {plan.sqrtPriceX64}</p>
        </div>
      ) : null}
    </StepShell>
  );
}
