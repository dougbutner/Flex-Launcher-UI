import {
  FEE_TIERS,
  SWAP_ALCOR,
  easyHoldNeed,
  flexMeta,
  hasAngelChannels,
  holdEasyToLaunch,
} from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { fmtPrice, planFromDraft, presetFromDraft, quoteFromDraft, taxFromDraft } from "@/components/launch/draftPlan";
import { FlexPairHoldTip } from "@/components/launch/FlexPairHoldTip";
import { StepShell } from "@/components/launch/ui";
import { formatSupplyCommas } from "@/services/assets";
import { formatRainAsset } from "@/services/rainDefaults";
import { unlockTimeUnix } from "@/services/launchMath";
import { formatBpsPercent, hasProjectTax, taxSum } from "@/services/taxRates";
import { parseInviteAccounts } from "@/services/insidersClub";

type Props = {
  draft: LaunchDraft;
  onNext: () => void;
  onBack: () => void;
};

function Row({ k, v, mono = true }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className={`min-w-0 break-all text-right text-sm font-semibold ${mono ? "font-mono" : ""}`}>{v}</span>
    </div>
  );
}

export function ReviewStep({ draft, onNext, onBack }: Props) {
  const plan = planFromDraft(draft);
  const quote = quoteFromDraft(draft);
  const preset = presetFromDraft(draft);
  const feeLabel = FEE_TIERS.find((t) => t.fee === draft.fee)?.label ?? String(draft.fee);
  const unlockDate = new Date(unlockTimeUnix(draft.lockDays) * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const skimLabel = preset.flexQuote ? "0%" : "0.25% dev + 0.25% club";
  const tax = taxFromDraft(draft);
  const overall = taxSum(tax, draft.program);
  const buckets = hasProjectTax(draft.program)
    ? `reflect ${formatBpsPercent(tax.reflectionRate)} · burn ${formatBpsPercent(tax.burnRate)} · project ${formatBpsPercent(tax.projectRate)}`
    : `reflect ${formatBpsPercent(tax.reflectionRate)} · burn ${formatBpsPercent(tax.burnRate)}`;
  const base = flexMeta(draft.program).launchEasyMin;
  const holdNeed = easyHoldNeed(base, 0, Date.now(), preset.flexQuote);
  const holdLine = preset.flexQuote
    ? `${holdEasyToLaunch(holdNeed)} (flex pair promo); more after each prior launch`
    : `${holdEasyToLaunch(holdNeed)} (full); more after each prior launch`;

  return (
    <StepShell
      title="Review launch"
      desc="Everything the contract will check. Read it twice - ticks and precision cannot change after create."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn btn-primary" disabled={!plan} onClick={onNext}>
            Go to execute
          </button>
        </>
      }
    >
      <div className="rounded-2xl border bg-background/50 px-4 py-2">
          <Row k="Program" v={draft.program} />
        <Row k="Token" v={`${draft.name} (${draft.symbol})`} />
        <Row k="Max supply" v={`${formatSupplyCommas(draft.maxSupply || "0")} ${draft.symbol} · precision ${draft.precision}`} />
        <Row k="Transfer tax" v={`${formatBpsPercent(overall)} overall`} />
        <Row k="Tax buckets" v={buckets} mono={false} />
        {hasProjectTax(draft.program) ? (
          <Row k="Project account" v={tax.projectAccount.trim() || "issuer (blank at setfees)"} />
        ) : null}
        {hasAngelChannels(draft.program) ? (
          <Row
            k="Reflection channels"
            v={
              tax.angelNumbersBps || tax.jackpotBps
                ? `angel ${formatBpsPercent(tax.angelNumbersBps)} · jackpot ${formatBpsPercent(tax.jackpotBps)} of reflection fee`
                : "none (set later with ratios / setdist)"
            }
            mono={false}
          />
        ) : null}
        <Row
          k="Reflection minimums"
          v={`per holder ${formatRainAsset(draft.rainMinHold, draft.precision, draft.symbol)} · pool ${formatRainAsset(draft.rainMinPool, draft.precision, draft.symbol)}`}
        />
        <Row
          k="Quote"
          v={`${quote.symbol} @ ${quote.contract}${preset.flexQuote ? "" : ` · proof pool #${draft.proofPoolId}`}`}
        />
        <Row
          k="Rain as backing"
          v={
            draft.swapUnderlyingDefault
              ? `Yes. Holders receive ${quote.symbol} unless they flex into another reward.`
              : "No. Holders receive your token unless they flex into another reward."
          }
          mono={false}
        />
        <Row k="Fee tier" v={feeLabel} />
        {plan ? (
          <>
            <Row k="Pair order" v={`tokenA = ${plan.tokenA.symbol} @ ${plan.tokenA.contract} · tokenB = ${plan.tokenB.symbol} @ ${plan.tokenB.contract}`} />
            <Row k="Ticks" v={`${plan.tickLower} → ${plan.tickUpper} (start ${plan.startTick})`} />
            <Row
              k="Buyer price walk"
              v={`${fmtPrice(plan.quotePerTokenLower)} - ${fmtPrice(plan.quotePerTokenUpper)} ${quote.symbol}`}
            />
          </>
        ) : null}
        <Row k="Deposit" v={`100% of supply → ${SWAP_ALCOR}`} />
        <Row k="Lock" v={`${Math.max(90, draft.lockDays)} days · until ~${unlockDate}`} />
        {draft.presaleEnabled ? (
          <Row
            k="Insiders"
            v={`${draft.presaleInsiderBps / 100}% Insider Max${
              draft.presaleLockedInsiderBps > draft.presaleInsiderBps
                ? ` · ${draft.presaleLockedInsiderBps / 100}% LP bonus`
                : ""
            }${parseInviteAccounts(draft.presaleInviteList).length ? ` · invite ${parseInviteAccounts(draft.presaleInviteList).length}` : ""}`}
            mono={false}
          />
        ) : (
          <Row k="Insiders" v="Off (public after liftoff)" mono={false} />
        )}
        <Row k="EASY to launch" v={holdLine} />
        {preset.flexQuote ? null : <FlexPairHoldTip program={draft.program} />}
      </div>

      <div className="space-y-2 rounded-2xl border border-warning/30 bg-warning/5 p-4 text-xs text-warning">
        <p className="font-semibold">Before liftoff, your token cannot transfer anywhere except to {SWAP_ALCOR}.</p>
        <p className="text-warning/80">
          Do not try to send it to a friend first. After liftoff, transfers work with the normal flex tax. Protocol skim
          starts at {skimLabel} and rises by +0.25% each if the Alcor lock expires (via checklock or makeitrain).
        </p>
        {draft.presaleEnabled ? (
          <p className="text-warning/80">
            Insiders: after lock, Execute signs the club
            {parseInviteAccounts(draft.presaleInviteList).length
              ? ` and invites (${parseInviteAccounts(draft.presaleInviteList).join(", ")})`
              : ""}
            . Public transfers wait until public launch. Insider Max {draft.presaleInsiderBps / 100}% of supply
            {draft.presaleLockedInsiderBps > draft.presaleInsiderBps
              ? ` (${draft.presaleLockedInsiderBps / 100}% LP provider bonus)`
              : ""}
            . Approved accounts can buy from insider buys start.
          </p>
        ) : null}
        {hasAngelChannels(draft.program) && (tax.angelNumbersBps > 0 || tax.jackpotBps > 0) ? (
          <p className="text-warning/80">
            Angel / jackpot pulls need setdist (winners, cooldown) after launch. ratios alone only sets the channel
            split.
          </p>
        ) : null}
      </div>
    </StepShell>
  );
}
