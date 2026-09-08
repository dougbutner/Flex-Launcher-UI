import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { fmtPrice, planFromDraft, quoteFromDraft } from "@/components/launch/draftPlan";
import { StatusIcon } from "@/components/launch/ui";
import { flexAccount, flexMeta } from "@/config/launch";

export function LaunchPreview({ draft }: { draft: LaunchDraft }) {
  const quote = quoteFromDraft(draft);
  const plan = planFromDraft(draft);

  const milestones = [
    { label: `Hold ${flexMeta(draft.program).launchEasyMin.toLocaleString()} EASY`, done: false },
    { label: "Created", done: Boolean(draft.createTx) },
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
            {(draft.symbol || "?").slice(0, 1)}
          </div>
        )}
      </div>
      <div className="px-5 pb-5 pt-10">
        <div className="text-lg font-bold tracking-tight">{draft.name || "Unnamed token"}</div>
        <div className="font-mono text-xs text-muted-foreground">
          ${draft.symbol || "?????"} · {draft.program} @ {flexAccount(draft.program)} · {quote.symbol} pair
        </div>
        {draft.description ? (
          <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{draft.description}</p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="stat-box !px-2 !py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Supply</div>
            <div className="font-mono text-sm font-bold">{Number(draft.maxSupply || "0").toLocaleString()}</div>
          </div>
          <div className="stat-box !px-2 !py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Lock</div>
            <div className="font-mono text-sm font-bold">{Math.max(90, draft.lockDays)}d</div>
          </div>
        </div>

        {plan ? (
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            {fmtPrice(plan.quotePerTokenLower)} - {fmtPrice(plan.quotePerTokenUpper)} {quote.symbol} / {draft.symbol}
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
