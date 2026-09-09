import { Link } from "react-router-dom";
import { TokenIcon } from "@/components/TokenIcon";
import { HolderPrefs } from "@/components/token/HolderPrefs";
import { IssuerTools } from "@/components/token/IssuerTools";
import {
  PREVIEW_ACTOR,
  PREVIEW_CONTRACT,
  PREVIEW_PRECISION,
  PREVIEW_PROGRAM,
  PREVIEW_SYMBOL,
  previewFlexer,
  previewFlexers,
  previewHolding,
  previewIssued,
  previewPools,
  previewSettings,
} from "@/demo/fixtures";
import type { ChainAction } from "@/services/launchActions";

function fmt(n: number, precision = 4): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: precision });
}

async function fauxTransact(_actions: ChainAction[]) {
  await new Promise((r) => setTimeout(r, 400));
  return { transaction_id: "preview0faux0tx000000000000000000000000000000000000000000000000" };
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-secondary/80 ${className}`} aria-hidden />;
}

export default function Preview() {
  const h = previewHolding;
  const angel = Number(h.flexer.angel_number);
  const beneficiary = String(h.flexer.beneficiary);
  const beneRate = Number(h.flexer.bene_rate);
  const flexPool = Number(h.flexer.flex_reward_pool_id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
        Preview mode. Faux-loaded fixtures only. Nothing signs or hits RPC.
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">UI shapes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Skeleton pulse, then filled portfolio, leaderboard, and token manage for flexforex.
          </p>
        </div>
        <Link to="/portfolio" className="btn btn-outline btn-sm">
          Exit preview
        </Link>
      </div>

      {/* Faux-loading skeletons: layout geometry before paint */}
      <section className="mt-8">
        <h2 className="text-sm font-bold tracking-tight">Faux loading</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Shape only. Matches portfolio + manage density.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stat-box space-y-2">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="h-6 w-16" />
            </div>
          ))}
        </div>
        <div className="card mt-3 space-y-3 p-5">
          <div className="flex justify-between gap-3">
            <div className="space-y-2">
              <SkeletonBlock className="h-5 w-24" />
              <SkeletonBlock className="h-3 w-40" />
            </div>
            <div className="space-y-2 text-right">
              <SkeletonBlock className="ml-auto h-5 w-20" />
              <SkeletonBlock className="ml-auto h-3 w-12" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <SkeletonBlock className="h-7 w-28 rounded-full" />
            <SkeletonBlock className="h-7 w-24 rounded-full" />
            <SkeletonBlock className="h-7 w-32 rounded-full" />
            <SkeletonBlock className="h-7 w-20 rounded-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <SkeletonBlock className="h-9 w-28" />
            <SkeletonBlock className="h-9 w-24" />
            <SkeletonBlock className="h-9 w-24" />
            <SkeletonBlock className="h-9 w-20" />
          </div>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="card space-y-3 p-4">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-9 w-32" />
          </div>
          <div className="card space-y-3 p-4">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-24 w-full" />
            <SkeletonBlock className="h-9 w-32" />
          </div>
        </div>
      </section>

      {/* Portfolio shapes */}
      <section className="mt-10">
        <h2 className="text-sm font-bold tracking-tight">Portfolio (filled)</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="stat-box">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">XPR balance</div>
            <div className="mt-1 font-mono text-lg font-bold">12,480.2500</div>
          </div>
          <div className="stat-box">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Flex tokens held</div>
            <div className="mt-1 font-mono text-lg font-bold">1</div>
          </div>
          <div className="stat-box">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Earning reflections</div>
            <div className="mt-1 font-mono text-lg font-bold">1</div>
          </div>
          <div className="stat-box">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Pools pending</div>
            <div className="mt-1 font-mono text-lg font-bold text-primary">1</div>
          </div>
        </div>

        <div className="mt-4">
          <h3 className="text-sm font-bold tracking-tight">Your launches</h3>
          <ul className="mt-2 space-y-2">
            <li className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="font-mono font-bold">${previewIssued.symbol}</div>
                <div className="text-xs text-muted-foreground">
                  {previewIssued.program} @ {previewIssued.contract} · live
                </div>
              </div>
              <span className="btn btn-outline btn-sm pointer-events-none">Manage</span>
            </li>
          </ul>
        </div>

        <article className="card mt-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-lg font-bold">${h.symbol}</div>
              <div className="text-xs text-muted-foreground">
                {h.program} @ {h.contract} · {h.quoteSymbol} pair · reflections active
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg font-bold">{fmt(h.balance, h.precision)}</div>
              <div className="text-xs text-muted-foreground">balance</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="chip-primary">pool {fmt(h.reflectionPool, h.precision)} {h.symbol}</span>
            <span className="chip-primary">angel pot {fmt(h.angelPool, h.precision)}</span>
            <span className="chip-primary">jackpot {fmt(h.jackpotPool, h.precision)}</span>
            <span className="chip-success">est. splash ~{fmt(h.estSplash, h.precision)} {h.symbol}</span>
            <span className="chip-muted">angel {angel}</span>
            <span className="chip-muted">
              → {beneficiary} {(beneRate / 100).toFixed(0)}%
            </span>
            <span className="chip-muted">flex pool #{flexPool}</span>
            <span className="chip-muted">→ {h.quoteSymbol} default</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled>
              Make it rain
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled>
              Check lock
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled>
              Pull angel
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled>
              Pull jackpot
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled>
              Trade
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled>
              Manage
            </button>
            <span className="font-mono text-xs text-success">tx preview0fa…</span>
          </div>
        </article>
      </section>

      {/* Leaderboard shapes */}
      <section className="mt-10">
        <h2 className="text-sm font-bold tracking-tight">Leaderboard (filled)</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <button type="button" className="card border-primary/60 bg-primary/10 p-4 text-left">
            <div className="flex items-center justify-between">
              <span className="font-mono text-base font-bold">${PREVIEW_SYMBOL}</span>
              <span className="chip-success">live</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {PREVIEW_PROGRAM} @ {PREVIEW_CONTRACT} · EASY @ mon3y
            </div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">pool #2142</div>
          </button>
          <div className="card space-y-4 p-6">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="chip-muted">skim nyra 0.25% · club 0.25%</span>
              <span className="chip-muted">LP unlock Dec 2026</span>
              <span className="chip-muted">reflect → EASY</span>
              <span className="chip-primary">angel pot 420</span>
              <span className="chip-primary">jackpot 880.5</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-outline btn-sm" disabled>
                Check lock
              </button>
              <button type="button" className="btn btn-outline btn-sm" disabled>
                Pull angel
              </button>
              <button type="button" className="btn btn-outline btn-sm" disabled>
                Pull jackpot
              </button>
              <button type="button" className="btn btn-outline btn-sm" disabled>
                Manage
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">#</th>
                  <th className="py-2 pr-2 font-medium">Holder</th>
                  <th className="py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {previewFlexers.map((f, i) => (
                  <tr key={String(f.owner)} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 pr-2 font-mono text-muted-foreground">{i + 1}</td>
                    <td className="py-2.5 pr-2 font-mono">
                      {String(f.owner)}
                      {i === 0 ? <span className="chip-primary ml-2">top flex</span> : null}
                    </td>
                    <td className="py-2.5 text-right font-mono font-semibold">
                      {String(f.balance).split(" ")[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Quote / xtoken picker shapes */}
      <section className="mt-10">
        <h2 className="text-sm font-bold tracking-tight">Quote xtokens (filled)</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Top 10 by Alcor activity, then expand. Selecting one collapses to a single card with expand.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {["XUSDC", "XXRP", "XBTC", "XETH", "XUSDT", "METAL", "XSOL", "XDOGE", "XXLM", "XHBAR"].map((sym) => (
            <div
              key={sym}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center ${
                sym === "XBTC" ? "border-primary bg-primary/15" : "border-input bg-background/60"
              }`}
            >
              <TokenIcon contract="xtokens" symbol={sym} size={52} />
              <span className="font-mono text-xs font-bold">{sym}</span>
              <span className="text-[10px] text-muted-foreground">xtokens</span>
            </div>
          ))}
        </div>
        <button type="button" className="link mt-2 text-sm" disabled>
          expand
        </button>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary bg-primary/10 p-4">
          <TokenIcon contract="xtokens" symbol="XBTC" size={64} />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-lg font-bold">XBTC</div>
            <div className="text-xs text-muted-foreground">@xtokens · 8 decimals · 0.5% skim · collapsed pick</div>
          </div>
          <span className="link text-sm">expand</span>
        </div>
      </section>

      {/* Token manage: live components with faux transact */}
      <section className="mt-10 max-w-3xl">
        <h2 className="text-sm font-bold tracking-tight">Token manage (interactive faux)</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Real HolderPrefs + IssuerTools. Signatures resolve locally after a short delay.
        </p>

        <div className="mt-4">
          <h1 className="font-mono text-3xl font-black tracking-tight">${PREVIEW_SYMBOL}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {PREVIEW_PROGRAM} @ {PREVIEW_CONTRACT} · issuer {PREVIEW_ACTOR}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="chip-success">launched</span>
          <span className="chip-muted">quote EASY</span>
          <span className="chip-muted">→ EASY default</span>
          <span className="chip-muted">pool 12,840.25</span>
          <span className="chip-primary">angel 420</span>
          <span className="chip-primary">jackpot 880.5</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-sm" disabled>
            Make it rain
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled>
            Check lock
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled>
            Pull angel
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled>
            Pull jackpot
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled>
            Trade
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <HolderPrefs
            program={PREVIEW_PROGRAM}
            contract={PREVIEW_CONTRACT}
            symbol={PREVIEW_SYMBOL}
            precision={PREVIEW_PRECISION}
            actor={PREVIEW_ACTOR}
            flexer={previewFlexer}
            settings={previewSettings}
            pools={previewPools}
            busy={false}
            transact={fauxTransact}
            onDone={() => undefined}
          />
          <IssuerTools
            program={PREVIEW_PROGRAM}
            contract={PREVIEW_CONTRACT}
            symbol={PREVIEW_SYMBOL}
            settings={previewSettings}
            busy={false}
            transact={fauxTransact}
            onDone={() => undefined}
          />
        </div>
      </section>
    </div>
  );
}
