import { useState } from "react";
import { Link } from "react-router-dom";
import { isFlexContractActor } from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { TokenIcon } from "@/components/TokenIcon";
import { TokenGlyph } from "@/components/TokenGlyph";
import { CalTokenCard } from "@/components/events/CalTokenCard";
import { DropCalendar } from "@/components/events/DropCalendar";
import { GoldPriceChart } from "@/components/token/GoldPriceChart";
import { HolderPrefs } from "@/components/token/HolderPrefs";
import { IssuerTools } from "@/components/token/IssuerTools";
import { ListingPacket } from "@/components/token/ListingPacket";
import { emptyListingDraft } from "@/services/listingHelper";
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
  previewLaunch,
  previewPools,
  previewSettings,
  previewCalEvents,
} from "@/demo/fixtures";
import type { ChainAction } from "@/services/launchActions";

function fmt(n: number, precision = 4): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: precision });
}

async function fauxTransact(_actions: ChainAction[]) {
  await new Promise((r) => setTimeout(r, 400));
  return { transaction_id: "preview0faux0tx000000000000000000000000000000000000000000000000" };
}

function PreviewListing() {
  const [draft, setDraft] = useState(() => ({
    ...emptyListingDraft(PREVIEW_SYMBOL),
    tname: "Demo Flex",
    url: "https://flex.report",
    desc: "Faux listing packet for the Alcor fork prompt.",
    iconurl: "https://gateway.pinata.cloud/ipfs/QmPreviewLogo",
    twitter: "flextokens",
    telegram: "flextokens",
  }));
  return (
    <ListingPacket
      contract={PREVIEW_CONTRACT}
      symbol={PREVIEW_SYMBOL}
      precision={PREVIEW_PRECISION}
      program={PREVIEW_PROGRAM}
      draft={draft}
      onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
      protonOn={false}
      canSign
      missing
      submitLabel="Submit to proton.token"
      onSign={() => undefined}
    />
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-secondary/80 ${className}`} aria-hidden />;
}

export default function Preview() {
  const { actor } = useWallet();
  if (!isFlexContractActor(actor)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight">Preview</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect as <span className="font-mono">3asy</span>, <span className="font-mono">fl3x</span>, or{" "}
          <span className="font-mono">for3x</span> to open the full faux UI shapes page.
        </p>
        <section className="card mt-8 space-y-3 p-6">
          <h2 className="text-sm font-bold tracking-tight">Wallet and Alcor listing</h2>
          <p className="text-xs text-muted-foreground">
            Faux draft. Submit to token.proton or request help in Telegram, then copy the Alcor AI prompt the same way Manager does.
          </p>
          <PreviewListing />
        </section>
      </div>
    );
  }

  const h = previewHolding;
  const angel = Number(h.flexer.angel_number);
  const beneficiary = String(h.flexer.beneficiary);
  const beneRate = Number(h.flexer.bene_rate);
  const flexPool = Number(h.flexer.flex_reward_pool_id);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
        Preview mode. Faux-loaded fixtures only. Nothing signs or hits RPC.
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">UI shapes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Skeleton pulse, then filled portfolio, leaderboard, drop calendar, and token stats for for3x.
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

      <section className="mt-10">
        <h2 className="text-sm font-bold tracking-tight">Drop calendar</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          One month grid with token marks, then shimmer tiles in date order. Full ticker always sits next to the icon.
        </p>
        <div className="mt-4">
          <DropCalendar
            year={2026}
            month={8}
            events={previewCalEvents}
            picked="2026-09-20"
            onPick={() => undefined}
            onShift={() => undefined}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {previewCalEvents.map((ev) => (
            <CalTokenCard key={ev.id} ev={ev} picked={ev.kind === "presale" && ev.symbol === PREVIEW_SYMBOL} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-bold tracking-tight">Token stats layout</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Daily feed left, gold chart center, Alcor swap on the right. Small width stacks and uses a Swap link.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_minmax(280px,360px)]">
          <div className="space-y-3 border border-border bg-background/40 p-3">
            <article className="insiders-post !border-0 !px-0 !py-2">
              <div className="insiders-face">
                <span className="insiders-avatar insiders-avatar-fallback">A</span>
                <div className="insiders-name">{PREVIEW_ACTOR}</div>
              </div>
              <button type="button" className="holding-chip pointer-events-none">
                <TokenGlyph contract={PREVIEW_CONTRACT} symbol={PREVIEW_SYMBOL} size={22} />
                <span className="holding-chip__amt">
                  12,500
                  <span className="holding-chip__lbl">held</span>
                </span>
              </button>
              <p className="insiders-body mt-2">First day in the club. Chart is the gold line.</p>
            </article>
          </div>
          <div className="card overflow-hidden">
            <div className="grid grid-cols-2 gap-3 border-b border-border px-4 py-3 sm:grid-cols-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Price</div>
                <div className="font-mono text-sm font-semibold text-primary">0.002681 EASY</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">24h</div>
                <div className="font-mono text-sm font-semibold text-success">+0.43%</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Vol 24h</div>
                <div className="font-mono text-sm font-semibold">$98</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Mcap</div>
                <div className="font-mono text-sm font-semibold">$12.3k</div>
              </div>
            </div>
            <GoldPriceChart
              quoteSymbol="EASY"
              points={Array.from({ length: 24 }, (_, i) => ({
                t: Date.now() - (23 - i) * 3600_000,
                price: 0.0024 + Math.sin(i / 3) * 0.0002 + i * 0.000012,
              }))}
            />
          </div>
          <div className="border border-border bg-background/40 p-4 text-sm text-muted-foreground">
            Alcor swap iframe on desktop. Swap on Alcor button when the layout is stacked.
          </div>
        </div>
        <button type="button" className="btn btn-outline mt-6 pointer-events-none">
          Launch History
        </button>
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

        <div className="mt-6">
          <h3 className="text-sm font-bold tracking-tight">Your drops</h3>
          <ul className="mt-2 space-y-2">
            <li className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <TokenIcon contract={PREVIEW_CONTRACT} symbol={PREVIEW_SYMBOL} size={36} />
                <div>
                  <div className="font-mono font-bold">${previewIssued.symbol}</div>
                  <div className="text-xs text-muted-foreground">
                    {previewIssued.symbol}@{PREVIEW_CONTRACT} · live
                  </div>
                </div>
                <span className="insiders-club-badge">proven</span>
              </div>
              <span className="btn btn-outline btn-sm pointer-events-none">Token</span>
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
              Swap
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
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Top flexers · ${PREVIEW_SYMBOL}</h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-outline btn-sm" disabled>
                  Manage
                </button>
                <button type="button" className="btn btn-outline btn-sm" disabled>
                  Swap
                </button>
                <button type="button" className="btn-rain btn-sm" disabled>
                  Make it rain
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="chip-muted">skim dev 0.25% · club 0.25%</span>
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
            <div className="text-xs text-muted-foreground">@xtokens · 8 decimals · 0.5-1% skim · collapsed pick</div>
          </div>
          <span className="link text-sm">expand</span>
        </div>
      </section>

      {/* Token manage: live components with faux transact */}
      <section className="mt-10 max-w-3xl">
        <h2 className="text-sm font-bold tracking-tight">Token manage (interactive faux)</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Real HolderPrefs, IssuerTools, and listing helper. Signatures resolve locally after a short delay.
        </p>
        <div className="card mt-4 p-4">
          <PreviewListing />
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-3xl font-black tracking-tight">${PREVIEW_SYMBOL}</h1>
            <button type="button" className="btn-rain btn-sm" disabled>
              Make it rain
            </button>
          </div>
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

        <div className="card mt-6 overflow-hidden">
          <div className="grid grid-cols-2 gap-3 border-b border-border px-4 py-3 sm:grid-cols-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Price</div>
              <div className="font-mono text-sm font-semibold text-primary">0.002681 EASY</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">24h</div>
              <div className="font-mono text-sm font-semibold text-success">+0.43%</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Vol 24h</div>
              <div className="font-mono text-sm font-semibold">$98</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Mcap</div>
              <div className="font-mono text-sm font-semibold">$12.3k</div>
            </div>
          </div>
          <GoldPriceChart
            quoteSymbol="EASY"
            points={Array.from({ length: 24 }, (_, i) => ({
              t: Date.now() - (23 - i) * 3600_000,
              price: 0.0024 + Math.sin(i / 3) * 0.0002 + i * 0.000012,
            }))}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
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
            swapUnderlyingDefault={Boolean(previewLaunch.swap_underlying_default)}
            quoteSymbol="EASY"
            busy={false}
            transact={fauxTransact}
            onDone={() => undefined}
          />
          <IssuerTools
            program={PREVIEW_PROGRAM}
            contract={PREVIEW_CONTRACT}
            symbol={PREVIEW_SYMBOL}
            precision={PREVIEW_PRECISION}
            actor={PREVIEW_ACTOR}
            settings={previewSettings}
            launch={previewLaunch}
            pools={previewPools}
            busy={false}
            transact={fauxTransact}
            onDone={() => undefined}
          />
        </div>
      </section>
    </div>
  );
}
