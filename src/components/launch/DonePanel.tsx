import { Link } from "react-router-dom";
import { alcorSwapUrl, explorerAccount, explorerTx, flexAccount } from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { quoteFromDraft } from "@/components/launch/draftPlan";

export function DonePanel({ draft, onReset }: { draft: LaunchDraft; onReset: () => void }) {
  const quote = quoteFromDraft(draft);
  const tokenContract = flexAccount(draft.program);
  return (
    <section className="card p-8 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--success))" strokeWidth="3">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="mt-4 text-2xl font-black tracking-tight">
        ${draft.symbol} is live
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Liftoff complete. 100% of supply sits in a locked, one-sided Alcor position. Buyers walk the range and anyone
        can call Make it rain to splash holders
        {draft.swapUnderlyingDefault
          ? ` (rain comes as ${quote.symbol} unless a holder flexes into another reward)`
          : ""}
        . After the 91-day lock ends, anyone can call checklock to apply the extra protocol skim.
        {draft.program === "flexforex"
          ? " Open Manage to lock setdist / ratios and add flex reward pools."
          : " Open Manage to add flex reward pools and holder prefs."}
      </p>

      <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2">
        <Link to={`/token/${tokenContract}/${draft.symbol}`} className="btn btn-primary btn-lg w-full">
          Manage ${draft.symbol}
        </Link>
        <a
          href={alcorSwapUrl(quote.symbol, quote.contract, draft.symbol, tokenContract)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-accent btn-lg w-full"
        >
          Trade ${draft.symbol} on Alcor
        </a>
        <div className="flex gap-2">
          <a
            href={explorerTx(draft.liftoffTx)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline btn-sm flex-1"
          >
            Liftoff tx
          </a>
          <a
            href={explorerAccount(tokenContract)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline btn-sm flex-1"
          >
            Contract
          </a>
          <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={onReset}>
            Launch another
          </button>
        </div>
      </div>
    </section>
  );
}
