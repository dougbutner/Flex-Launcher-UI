import { FEE_TIERS, SWAP_ALCOR, flexAccount, flexMeta, holdEasyToLaunch } from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { fmtPrice, planFromDraft, presetFromDraft, quoteFromDraft } from "@/components/launch/draftPlan";
import { StepShell } from "@/components/launch/ui";
import { unlockTimeUnix } from "@/services/launchMath";

type Props = {
  draft: LaunchDraft;
  onNext: () => void;
  onBack: () => void;
};

function Row({ k, v, mono = true }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className={`text-right text-sm font-semibold ${mono ? "font-mono" : ""}`}>{v}</span>
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
  const skimLabel = preset.flexQuote ? "0%" : "0.25% nyra + 0.25% reflections";

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
        <Row k="Program" v={`${draft.program} @ ${flexAccount(draft.program)}`} />
        <Row k="Token" v={`${draft.name} (${draft.symbol})`} />
        <Row k="Max supply" v={`${Number(draft.maxSupply || "0").toLocaleString()} ${draft.symbol} · precision ${draft.precision}`} />
        <Row
          k="Quote"
          v={`${quote.symbol} @ ${quote.contract}${preset.flexQuote ? "" : ` · proof pool #${draft.proofPoolId}`}`}
        />
        <Row
          k="Reflect default"
          v={draft.swapUnderlyingDefault ? `Swap unpaid holders into ${quote.symbol}` : "Pay native token"}
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
        <Row
          k="EASY to launch"
          v={`${holdEasyToLaunch(flexMeta(draft.program).launchEasyMin)}; more after each prior launch`}
        />
      </div>

      <div className="space-y-2 rounded-2xl border border-warning/30 bg-warning/5 p-4 text-xs text-warning">
        <p className="font-semibold">Before liftoff, your token cannot transfer anywhere except to {SWAP_ALCOR}.</p>
        <p className="text-warning/80">
          Do not try to send it to a friend first. After liftoff, transfers work with the normal flex tax. Protocol skim
          starts at {skimLabel} and rises by +0.25% each if the Alcor lock expires (via checklock or makeitrain).
        </p>
      </div>
    </StepShell>
  );
}
