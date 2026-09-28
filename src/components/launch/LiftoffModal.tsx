import { Link } from "react-router-dom";
import { alcorSwapUrl, explorerTx, flexAccount } from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { quoteFromDraft } from "@/components/launch/draftPlan";

const PIECES = Array.from({ length: 42 }, (_, i) => ({
  left: `${(i * 23 + 7) % 100}%`,
  delay: `${(i % 9) * 0.11}s`,
  dur: `${2.4 + (i % 5) * 0.25}s`,
  rot: `${(i * 47) % 360}deg`,
  tone: i % 3 === 0 ? "bg-primary" : i % 3 === 1 ? "bg-accent" : "bg-success",
}));

type Props = {
  draft: LaunchDraft;
  onReset: () => void;
};

export function LiftoffModal({ draft, onReset }: Props) {
  const quote = quoteFromDraft(draft);
  const tokenContract = flexAccount(draft.program);
  const swap = alcorSwapUrl(quote.symbol, quote.contract, draft.symbol, tokenContract);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button type="button" className="absolute inset-0 bg-black/75" aria-label="Close" onClick={onReset} />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {PIECES.map((p, i) => (
          <span
            key={i}
            className={`absolute top-[-12px] h-2 w-2 rounded-sm ${p.tone}`}
            style={{
              left: p.left,
              animation: `flex-confetti ${p.dur} ${p.delay} linear infinite`,
              transform: `rotate(${p.rot})`,
            }}
          />
        ))}
      </div>
      <div className="relative z-10 m-4 w-full max-w-md rounded-2xl border border-primary/40 bg-card p-6 shadow-2xl">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-primary">Liftoff</p>
        <h2 className="mt-2 text-center text-2xl font-black tracking-tight">${draft.symbol} is live</h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          100% of supply is in a locked one-sided Alcor range. Buyers walk the quote. Anyone can call makeitrain.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <a href={swap} target="_blank" rel="noopener noreferrer" className="btn btn-accent w-full">
            Swap ${draft.symbol} on Alcor
          </a>
          <Link to={`/token/${tokenContract}/${draft.symbol}`} className="btn btn-primary w-full" onClick={onReset}>
            Open token page
          </Link>
          {draft.liftoffTx && draft.liftoffTx !== "ok" ? (
            <a
              href={explorerTx(draft.liftoffTx)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline w-full"
            >
              Liftoff tx
            </a>
          ) : null}
          <button type="button" className="btn btn-ghost w-full" onClick={onReset}>
            Launch another
          </button>
        </div>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          <Link to="/manager" className="link" onClick={onReset}>
            Open Dev Tools
          </Link>
          {" · "}
          Dev Tools is ready for setfees, pools, and {draft.program === "flexforex" ? "ratios / setdist" : "setmin"}.
        </p>
      </div>
    </div>
  );
}
