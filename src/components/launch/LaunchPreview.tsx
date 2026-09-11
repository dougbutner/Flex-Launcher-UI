import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { fmtPrice, planFromDraft, quoteFromDraft, taxFromDraft } from "@/components/launch/draftPlan";
import { StatusIcon, SupplyShortcuts } from "@/components/launch/ui";
import { TokenIcon } from "@/components/TokenIcon";
import { easyHoldNeed, flexAccount, flexMeta } from "@/config/launch";
import { formatSupplyCommas } from "@/services/assets";
import { formatBpsPercent, taxSum } from "@/services/taxRates";

export function LaunchPreview({
  draft,
  patch,
}: {
  draft: LaunchDraft;
  patch?: (p: Partial<LaunchDraft>) => void;
}) {
  const quote = quoteFromDraft(draft);
  const plan = planFromDraft(draft);
  const overallTax = formatBpsPercent(taxSum(taxFromDraft(draft), draft.program));
  const showName = draft.name;
  const showSymbol = draft.symbol;

  const milestones = [
    { label: `Hold ${easyHoldNeed(flexMeta(draft.program).launchEasyMin).toLocaleString()} EASY`, done: false },
    { label: "Created", done: Boolean(draft.createTx) },
    { label: "Fees", done: Boolean(draft.feesTx) },
    { label: "Supply", done: Boolean(draft.mintTx) },
    { label: "startlaunch", done: Boolean(draft.startTx) },
    { label: draft.poolId != null ? `Pool #${draft.poolId}` : "Pool created", done: Boolean(draft.poolTx) },
    { label: "Deposited", done: Boolean(draft.depositTx) },
    { label: "Ranged", done: Boolean(draft.rangeTx) },
    { label: "Locked", done: Boolean(draft.lockTx) },
    { label: "Liftoff", done: Boolean(draft.liftoffTx) },
  ];

  return (
    <aside className="card sticky top-20 overflow-hidden">
      <div className="relative h-28 bg-gradient-to-br from-primary/40 via-secondary to-background">
        {draft.imageUrl || draft.imageDataUrl ? (
          <img
            src={draft.imageUrl || draft.imageDataUrl}
            alt=""
            className="absolute -bottom-8 left-5 h-20 w-20 rounded-2xl border-4 border-card object-cover shadow-xl"
          />
        ) : (
          <div className="absolute -bottom-8 left-5 flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-card bg-secondary text-2xl font-black text-muted-foreground shadow-xl">
            {showSymbol.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="px-5 pb-5 pt-10">
        <div className="text-lg font-bold tracking-tight">{showName}</div>
        <div className="mt-1 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          ${showSymbol} · {draft.program} @ {flexAccount(draft.program)} ·
          <TokenIcon contract={quote.contract} symbol={quote.symbol} size={14} />
          {quote.symbol} pair
        </div>
        {draft.description ? (
          <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{draft.description}</p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="stat-box !px-2 !py-2">
            <div className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              Supply
              {patch ? <SupplyShortcuts value={draft.maxSupply} onPick={(maxSupply) => patch({ maxSupply })} /> : null}
            </div>
            <div className="font-mono text-sm font-bold">{formatSupplyCommas(draft.maxSupply || "0")}</div>
          </div>
          <div className="stat-box !px-2 !py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Tax</div>
            <div className="font-mono text-sm font-bold">{overallTax}</div>
          </div>
        </div>

        {plan ? (
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            {fmtPrice(plan.quotePerTokenLower)} - {fmtPrice(plan.quotePerTokenUpper)} {quote.symbol} / {showSymbol}
          </p>
        ) : null}

        <hr className="my-4 border-border" />
        <ul className="grid grid-cols-1 gap-1.5">
          {milestones.map((m) => (
            <li key={m.label} className="flex items-center gap-2 text-xs">
              <StatusIcon state={m.done ? "done" : "todo"} />
              <span className={m.done ? "text-foreground" : "text-muted-foreground"}>{m.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
