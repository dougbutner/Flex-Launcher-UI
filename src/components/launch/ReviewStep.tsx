import { useState, type ReactNode } from "react";
import {
  FEE_TIERS,
  SWAP_ALCOR,
  easyHoldNeed,
  flexAccount,
  flexMeta,
  hasAngelChannels,
  holdEasyToLaunch,
} from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { fmtPrice, planFromDraft, presetFromDraft, quoteFromDraft, taxFromDraft } from "@/components/launch/draftPlan";
import { FlexPairHoldTip } from "@/components/launch/FlexPairHoldTip";
import { InfoBody, InfoLink, StepShell } from "@/components/launch/ui";
import { REVIEW_GUIDE_PARAS } from "@/content/launchGuide";
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

type GroupTone = "token" | "tax" | "quote" | "range" | "club" | "hold";

function Group({ tone, title, children }: { tone: GroupTone; title: string; children: ReactNode }) {
  return (
    <section className={`launch-review__group launch-review__group--${tone}`}>
      <h3 className="launch-review__head">{title}</h3>
      {children}
    </section>
  );
}

function Row({ k, v, mono = false, stack = false }: { k: string; v: string; mono?: boolean; stack?: boolean }) {
  return (
    <div className={`launch-review__row${stack ? " launch-review__row--stack" : ""}`}>
      <span className="launch-review__k">{k}</span>
      <span className={`launch-review__v${mono ? " launch-review__v--mono" : ""}`}>{v}</span>
    </div>
  );
}

function fmtLocal(value: string): string {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return value || "-";
  return new Date(t).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const meta = flexMeta(draft.program);
  const holdNeed = easyHoldNeed(meta.launchEasyMin, 0, Date.now(), preset.flexQuote);
  const holdLine = preset.flexQuote
    ? `${holdEasyToLaunch(holdNeed)} (flex pair promo). More after each prior launch.`
    : `${holdEasyToLaunch(holdNeed)} (full). More after each prior launch.`;
  const invites = parseInviteAccounts(draft.presaleInviteList);
  const nftOn = Boolean(draft.presaleCollection.trim() || draft.presaleSchema.trim() || draft.presaleNftMin);
  const holdGateOn = Boolean(draft.presaleMinTokenQty.trim() || draft.presaleMinTokenContract.trim());
  const lockDays = draft.presaleLockSecs > 0 ? Math.round(draft.presaleLockSecs / 86400) : 0;
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <StepShell
      className="launch-review"
      title="Review launch"
      desc="Everything the contract will check. Read it twice. Ticks and precision cannot change after create."
      titleAside={<InfoLink open={infoOpen} onToggle={() => setInfoOpen((v) => !v)} />}
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
      <InfoBody open={infoOpen} paras={REVIEW_GUIDE_PARAS} />
      <div className="launch-review__groups">
        <Group tone="token" title="Token">
          <Row k="Contract" v={`${draft.symbol || "-"}@${flexAccount(draft.program)}`} mono />
          <Row k="Name" v={draft.name} />
          <Row k="Symbol" v={draft.symbol} mono />
          <Row k="Max supply" v={`${formatSupplyCommas(draft.maxSupply || "0")} ${draft.symbol}`} mono />
          <Row k="Decimal places" v={String(draft.precision)} mono />
        </Group>

        <Group tone="tax" title="Flexonomics">
          <Row k="Transfer tax" v={`${formatBpsPercent(overall)} overall`} mono />
          <Row k="Reflection" v={formatBpsPercent(tax.reflectionRate)} mono />
          <Row k="Burn" v={formatBpsPercent(tax.burnRate)} mono />
          {hasProjectTax(draft.program) ? (
            <>
              <Row k="Project" v={formatBpsPercent(tax.projectRate)} mono />
              <Row k="Project account" v={tax.projectAccount.trim() || "issuer (blank at setfees)"} mono />
            </>
          ) : null}
          {hasAngelChannels(draft.program) ? (
            <Row
              k="Reflection channels"
              v={
                tax.angelNumbersBps || tax.jackpotBps
                  ? `angel ${formatBpsPercent(tax.angelNumbersBps)} · jackpot ${formatBpsPercent(tax.jackpotBps)} of reflection fee`
                  : "none (set later with ratios / setdist)"
              }
            />
          ) : null}
          <Row
            k="Rain floor (holder)"
            v={formatRainAsset(draft.rainMinHold, draft.precision, draft.symbol)}
            mono
          />
          <Row
            k="Rain floor (pool)"
            v={formatRainAsset(draft.rainMinPool, draft.precision, draft.symbol)}
            mono
          />
        </Group>

        <Group tone="quote" title="Quote pair">
          <Row
            k="Quote"
            v={`${quote.symbol} @ ${quote.contract}${preset.flexQuote ? "" : ` · proof pool #${draft.proofPoolId}`}`}
            mono
          />
          <Row
            k="Rain as backing"
            stack
            v={
              draft.swapUnderlyingDefault
                ? `Yes. Holders receive ${quote.symbol} unless they flex into another reward.`
                : "No. Holders receive your token unless they flex into another reward."
            }
          />
          <Row k="Fee tier" v={feeLabel} />
        </Group>

        <Group tone="range" title="Range and lock">
          {plan ? (
            <>
              <Row
                k="Pair order"
                stack
                v={`tokenA = ${plan.tokenA.symbol} @ ${plan.tokenA.contract} · tokenB = ${plan.tokenB.symbol} @ ${plan.tokenB.contract}`}
                mono
              />
              <Row k="Ticks" v={`${plan.tickLower} → ${plan.tickUpper} (start ${plan.startTick})`} mono />
              <Row
                k="Buyer price walk"
                v={`${fmtPrice(plan.quotePerTokenLower)} - ${fmtPrice(plan.quotePerTokenUpper)} ${quote.symbol}`}
                mono
              />
            </>
          ) : null}
          <Row k="Deposit" v={`100% of supply → ${SWAP_ALCOR}`} mono />
          <Row k="Lock" v={`${Math.max(90, draft.lockDays)} days · until ~${unlockDate}`} />
        </Group>

        <Group tone="club" title="Insiders">
          {draft.presaleEnabled ? (
            <>
              <Row k="Window" v={`${fmtLocal(draft.presaleInsiderTime)} → ${fmtLocal(draft.presaleLaunchTime)}`} />
              <Row k="Insider Max" v={`${draft.presaleInsiderBps / 100}% of supply`} />
              {draft.presaleLockedInsiderBps > draft.presaleInsiderBps ? (
                <Row k="LP bonus" v={`${draft.presaleLockedInsiderBps / 100}% of supply`} />
              ) : null}
              {lockDays > 0 ? <Row k="Insider LP lock" v={`${lockDays} days`} /> : null}
              {draft.presaleLockedLpMin > 0 ? <Row k="Bonus LP min" v={String(draft.presaleLockedLpMin)} mono /> : null}
              {invites.length ? <Row k="Invites" v={invites.join(", ")} mono /> : null}
              {nftOn ? (
                <Row
                  k="NFT gate"
                  v={`${draft.presaleCollection || "-"} / ${draft.presaleSchema || "-"} · min ${draft.presaleNftMin || 0}`}
                  mono
                />
              ) : null}
              {holdGateOn ? (
                <Row
                  k="Min hold"
                  v={`${draft.presaleMinTokenQty || "-"} @ ${draft.presaleMinTokenContract || "-"}`}
                  mono
                />
              ) : null}
              {draft.presaleLpMin > 0 ? <Row k="LP min" v={String(draft.presaleLpMin)} mono /> : null}
            </>
          ) : (
            <Row k="Club" v="Off. Public after liftoff." />
          )}
        </Group>

        <Group tone="hold" title="Launch hold">
          <Row k="EASY to launch" v={holdLine} stack />
          {preset.flexQuote ? null : (
            <div className="launch-review__note">
              <FlexPairHoldTip program={draft.program} />
            </div>
          )}
        </Group>
      </div>

      <div className="launch-review__warn">
        <p className="launch-review__warn-title">
          Before liftoff, your token cannot transfer anywhere except to {SWAP_ALCOR}.
        </p>
        <p>
          Do not try to send it to a friend first. After liftoff, transfers work with the normal flex tax. Protocol skim
          starts at {skimLabel} and rises by +0.25% each if the Alcor lock expires (via checklock or makeitrain).
        </p>
        {draft.presaleEnabled ? (
          <p>
            Insiders: after lock, Execute signs the club
            {invites.length ? ` and invites (${invites.join(", ")})` : ""}. Public transfers wait until public launch.
            Insider Max {draft.presaleInsiderBps / 100}% of supply
            {draft.presaleLockedInsiderBps > draft.presaleInsiderBps
              ? ` (${draft.presaleLockedInsiderBps / 100}% LP provider bonus)`
              : ""}
            . Approved accounts can buy from insider buys start.
          </p>
        ) : null}
        {hasAngelChannels(draft.program) && (tax.angelNumbersBps > 0 || tax.jackpotBps > 0) ? (
          <p>
            Angel / jackpot pulls need setdist (winners, cooldown) after launch. ratios alone only sets the channel
            split.
          </p>
        ) : null}
      </div>
    </StepShell>
  );
}
