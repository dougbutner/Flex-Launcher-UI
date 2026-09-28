import { useEffect, useState } from "react";
import { HoldingBubbles } from "@/components/token/HoldingBubbles";
import { OvalRing, type RingSlice } from "@/components/token/OvalRing";
import { BACKING_LP, BandSquare, CoverGauge, DEGEN_LP, ECOSYSTEM_LP, LoyaltyDisk, TrackPair } from "@/components/token/StatShapes";
import { Pulse } from "@/components/ui/Pulse";
import { formatNiceNumber, formatPlainNumber, usdParts } from "@/services/money";
import { loadPoolSanity, splitCommunityLp, type SanityView } from "@/services/poolSanity";
import { loadHeadcounts, loadInsiderBooks, loadSpotTokens, type InsiderRow, type WalletDot } from "@/services/tokenCensus";

type Props = {
  contract: string;
  symbol: string;
  quoteContract: string;
  quoteSymbol: string;
  poolId: number;
  positionId: number;
  tickLower: number;
  tickUpper: number;
  sqrtStart: string;
  maxSupply: number;
  tokenPrecision: number;
  reloadKey: number;
};

const BACKING_COLOR: Record<string, string> = {
  EASY: "#eab308",
  XPR: "#c4b5fd",
  WON: "#f472b6",
  GRAMS: "#fbbf24",
  MEME: "#fb7185",
  XUSDC: "#34d399",
  XMD: "#2dd4bf",
  LOAN: "#38bdf8",
  INDEX: "#818cf8",
  XBTC: "#f59e0b",
  other: "#a8a29e",
};

function backingArcs(rows: { symbol: string; share: number }[]): RingSlice[] {
  const main = rows.filter((row) => row.share >= 0.01);
  const rest = rows.filter((row) => row.share < 0.01).reduce((sum, row) => sum + row.share, 0);
  const shown = rest > 0 ? [...main, { symbol: "other", share: rest }] : main;
  return shown.map((row) => ({
    size: row.share,
    color: BACKING_COLOR[row.symbol] ?? "#94a3b8",
    label: `${row.symbol} ${share(row.share)}`,
    title: `${row.symbol} share of priced quote sitting in Alcor pools for this token.`,
  }));
}

function share(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "-";
  const pct = n * 100;
  const abs = Math.abs(pct);
  if (abs >= 1000) return `${pct.toFixed(0)}%`;
  if (abs >= 10) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

function multiple(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  if (abs >= 100) return `${n.toFixed(0)}×`;
  if (abs >= 10) return `${n.toFixed(1)}×`;
  return `${n.toFixed(2)}×`;
}

function roundTo(n: number, precision: number): number {
  if (!Number.isFinite(n)) return n;
  const f = 10 ** Math.min(8, Math.max(0, precision));
  return Math.round(n * f) / f;
}

function qty(n: number, symbol: string, precision?: number): { display: string; full: string } {
  if (!Number.isFinite(n)) return { display: "-", full: "-" };
  const shown = precision == null ? n : roundTo(n, precision);
  return { display: `${formatNiceNumber(shown)} ${symbol}`, full: `${formatPlainNumber(shown)} ${symbol}` };
}

function usd(n: number | null): { display: string; full: string } {
  if (n == null) return { display: "-", full: "-" };
  return usdParts(n);
}

/** Grouped dollars, no million/billion shorthand. */
function usdExact(n: number | null): string {
  if (n == null || !(n > 0) || !Number.isFinite(n)) return "";
  const full = n.toLocaleString("en-US", {
    minimumFractionDigits: n >= 1 && Math.abs(n - Math.round(n)) < 0.005 ? 0 : 2,
    maximumFractionDigits: n >= 1 ? 2 : 6,
  });
  return `$${full}`;
}

function lockDaysLeft(unlockUnix: number, nowSec = Math.floor(Date.now() / 1000)): number | null {
  if (!(unlockUnix > 0)) return null;
  const left = unlockUnix - nowSec;
  if (left <= 0) return 0;
  return Math.ceil(left / 86400);
}

function LockMark({ days }: { days: number }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-success" title="Days left on the Alcor position lock">
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" className="shrink-0">
        <rect x="3" y="7" width="10" height="7" fill="currentColor" />
        <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      {days}d
    </span>
  );
}

function printOf(dollars: number | null, quotePx: number, amount: number, quoteSymbol: string) {
  if (dollars != null && dollars > 0) return usd(dollars);
  if (quotePx > 0 && Number.isFinite(amount)) return qty(quotePx * amount, quoteSymbol);
  return { display: "-", full: "-" };
}

function priceLine(quote: number | null, quoteSymbol: string, dollars: number | null): { display: string; full: string } {
  if (quote == null || !(quote > 0)) return { display: "-", full: "-" };
  const q = `${formatNiceNumber(quote)} ${quoteSymbol}`;
  const qFull = `${formatPlainNumber(quote)} ${quoteSymbol}`;
  if (dollars != null && dollars > 0) {
    const d = usdParts(dollars);
    return { display: `${d.display} · ${q}`, full: `${d.full} · ${qFull}` };
  }
  return { display: q, full: qFull };
}

function Stat({
  label,
  value,
  title,
  hint,
  tone,
  color,
}: {
  label: string;
  value: string;
  title?: string;
  hint?: string;
  tone?: "gold" | "up";
  color?: string;
}) {
  const colorClass = tone === "gold" ? "text-primary" : tone === "up" ? "text-success" : "text-foreground";
  return (
    <div className="min-w-0" title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground" title={hint}>
        {label}
      </div>
      <div
        className={`break-words font-mono text-sm font-semibold ${color ? "" : colorClass}`}
        style={color ? { color } : undefined}
        title={title && title !== value ? title : hint}
      >
        {value}
      </div>
    </div>
  );
}

function Reading({
  label,
  value,
  title,
  body,
}: {
  label: string;
  value: string;
  title?: string;
  body: string;
}) {
  return (
    <li className="border border-border px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" title={body}>
          {label}
        </span>
        <span className="min-w-0 break-words text-right font-mono text-sm font-semibold" title={title && title !== value ? title : undefined}>
          {value}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </li>
  );
}

function SanitySkeleton() {
  return (
    <div aria-busy="true">
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Pulse className="h-2.5 w-14" />
            <Pulse className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SanitySection(props: Props) {
  const [view, setView] = useState<SanityView | null>(null);
  const [busy, setBusy] = useState(props.poolId > 0);
  const [err, setErr] = useState("");
  const [holders, setHolders] = useState<number | null>(null);
  const [insiders, setInsiders] = useState<number | null>(null);
  const [spotTokens, setSpotTokens] = useState(0);
  const [books, setBooks] = useState<InsiderRow[]>([]);
  const [wallets, setWallets] = useState<WalletDot[]>([]);
  const [openAccount, setOpenAccount] = useState("");
  const [showBubbles, setShowBubbles] = useState(false);

  useEffect(() => {
    setView(null);
  }, [props.contract, props.symbol]);

  useEffect(() => {
    if (!(props.poolId > 0)) {
      setBusy(false);
      setErr("");
      setView(null);
      return;
    }
    let live = true;
    setBusy(true);
    setErr("");
    loadPoolSanity(props)
      .then((row) => {
        if (live) setView(row);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setView(null);
        setErr(e instanceof Error ? e.message : "Could not read the locked pool.");
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [
    props.poolId,
    props.positionId,
    props.contract,
    props.symbol,
    props.quoteContract,
    props.quoteSymbol,
    props.tickLower,
    props.tickUpper,
    props.sqrtStart,
    props.maxSupply,
    props.tokenPrecision,
    props.reloadKey,
  ]);

  useEffect(() => {
    let live = true;
    loadHeadcounts(props.contract, props.symbol)
      .then((row) => {
        if (!live) return;
        setHolders(row.holders);
        setInsiders(row.insiders);
      })
      .catch(() => {
        if (!live) return;
        setHolders(null);
        setInsiders(null);
      });
    loadSpotTokens(props.contract, props.symbol)
      .then((n) => {
        if (live) setSpotTokens(n);
      })
      .catch(() => {
        if (live) setSpotTokens(0);
      });
    return () => {
      live = false;
    };
  }, [props.contract, props.symbol, props.reloadKey]);

  useEffect(() => {
    if (!view) return;
    let live = true;
    loadInsiderBooks(props.contract, props.symbol, view.poolBook)
      .then((row) => {
        if (!live) return;
        setBooks(row.insiders);
        setWallets(row.wallets);
      })
      .catch(() => {
        if (!live) return;
        setBooks([]);
        setWallets([]);
      });
    return () => {
      live = false;
    };
  }, [view, props.contract, props.symbol]);

  const quote = props.quoteSymbol || "quote";
  const sym = props.symbol;
  const mid = view ? priceLine(view.midQuote, quote, view.midUsd) : null;
  const lockedQuote = view ? qty(view.lockedQuote, quote) : null;
  const lockedUsd = view ? usdExact(view.hardBackingUsd) : "";
  const prec = props.tokenPrecision;
  const lockedTokens = view ? qty(view.lockedTokens, sym, prec) : null;
  const tradable = view ? qty(view.tradableSupply, sym, prec) : null;
  const onAlcor = view ? qty(view.swapAlcorTokens, sym, prec) : null;
  const satellite = view ? qty(view.satelliteTokens, sym, prec) : null;
  const floatQty = view ? qty(view.walletFloat, sym, prec) : null;
  const days = view ? lockDaysLeft(view.unlockUnix) : null;
  const lpSplit = splitCommunityLp({
    slices: view?.backing ?? [],
    quoteSymbol: props.quoteSymbol,
    quoteContract: props.quoteContract,
    hardBackingUsd: view?.hardBackingUsd ?? null,
  });
  const capUsd = view?.fullPrintUsd ?? null;
  const overCap = (amount: number) => (amount > 0 && capUsd != null && capUsd > 0 ? amount / capUsd : null);
  const money = (amount: number) => (amount > 0 ? usd(amount).display : "-");
  const sameHint = `Community LP posted in ${quote || "the launch quote"}, the same token as the locked backing.`;
  const ecoHint =
    "Community LP in ecosystem quotes besides the launch quote: EASY, WON, GRAMS, MEME, XMD, LOAN, METAL, and xtokens.";
  const degenHint = "Community LP paired with a quote that is not the launch token and not an ecosystem token.";
  const poolHref = `https://alcor.exchange/v/xpr/analytics/pools/${props.poolId}`;
  const posHref = `https://alcor.exchange/v/xpr/swap/positions/${props.positionId}`;

  return (
    <section className="mt-4 border border-border bg-background/40 p-4" aria-label="By the numbers">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          className="text-sm font-bold tracking-tight"
          title="Price, locked backing, supply in hands, and community LP split into the launch quote, ecosystem quotes, and degen quotes."
        >
          By The Numbers
        </h2>
        {view ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] text-muted-foreground">
            <a className="underline hover:text-foreground" href={poolHref} target="_blank" rel="noreferrer">
              pool {props.poolId}
            </a>
            {props.positionId > 0 ? (
              <a className="underline hover:text-foreground" href={posHref} target="_blank" rel="noreferrer">
                position {props.positionId}
              </a>
            ) : null}
            {days != null ? <LockMark days={days} /> : null}
          </p>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Price, locked quote, and how much of the supply is in hands.
      </p>

      {!(props.poolId > 0) ? (
        <p className="mt-3 text-sm text-muted-foreground">By the numbers starts once the launch pair is on Alcor.</p>
      ) : busy && !view ? (
        <div className="mt-4">
          <SanitySkeleton />
        </div>
      ) : err ? (
        <p className="mt-3 text-sm text-destructive">{err}</p>
      ) : view && mid && lockedQuote && lockedTokens && tradable && onAlcor && satellite && floatQty ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border border-border px-3 py-3 sm:grid-cols-4">
            <Stat label="Volume 24h" value={usd(view.volumeUsd24).display} title={usd(view.volumeUsd24).full} hint="24h volume across this token's Alcor pools." />
            <Stat label="Vol / in hands" value={multiple(view.volOverTradable)} hint="24h volume divided by the in-hands print." />
            <Stat label="Insiders" value={insiders == null ? "-" : String(insiders)} hint="Approved insiders on this symbol." />
            <Stat label="Holders" value={holders == null ? "-" : String(holders)} hint="Flexer rows, or flexer_count when the contract stores it." />
          </div>

          <div className="mt-4">
            <OvalRing
              center={tradable.display}
              sub="in hands"
              top={[
                { size: view.lockedTokens, color: "#eab308", label: "locked LP", title: "Tokens still inside the day-one locked position." },
                { size: Math.max(0, view.satelliteTokens), color: "#60a5fa", label: "community LP", title: "Tokens on swap.alcor outside the locked position." },
                { size: Math.max(0, spotTokens), color: "#fb923c", label: "spot", title: "Tokens held on the alcor spot account." },
                { size: Math.max(0, view.walletFloat - spotTokens), color: "#4ade80", label: "wallets", title: "Tokens in wallets, outside spot and pools." },
              ]}
              bottom={backingArcs(view.backing)}
            />
          </div>
          <div className="mt-3">
            <CoverGauge
              ratio={view.backingOverFull}
              backing={view.hardBackingUsd != null ? usd(view.hardBackingUsd).display : lockedQuote.display}
              cap={usd(view.fullPrintUsd).display}
              extras={[
                {
                  ratio: overCap(lpSplit.sameUsd),
                  usd: money(lpSplit.sameUsd),
                  label: "Backing community LP",
                  color: BACKING_LP,
                  hint: sameHint,
                },
                {
                  ratio: overCap(lpSplit.ecosystemUsd),
                  usd: money(lpSplit.ecosystemUsd),
                  label: "Ecosystem community LP",
                  color: ECOSYSTEM_LP,
                  hint: ecoHint,
                },
                {
                  ratio: overCap(lpSplit.degenUsd),
                  usd: money(lpSplit.degenUsd),
                  label: "Degen LP",
                  color: DEGEN_LP,
                  hint: degenHint,
                },
              ]}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <BandSquare
              parts={[
                { size: view.lockedTokens, color: "#eab308", label: "locked LP", title: "Tokens still inside the day-one locked position." },
                { size: Math.max(0, view.satelliteTokens), color: "#60a5fa", label: "community LP", title: "Tokens on swap.alcor outside the locked position." },
                { size: Math.max(0, spotTokens), color: "#fb923c", label: "spot", title: "Tokens held on the alcor spot account." },
                { size: Math.max(0, view.walletFloat - spotTokens), color: "#4ade80", label: "wallets", title: "Tokens in wallets, outside spot and pools." },
              ]}
            />
            <LoyaltyDisk ratio={view.lpLoyalty} />
            <TrackPair
              left={{
                label: "24h volume",
                amount: view.volumeUsd24 ?? 0,
                text: usd(view.volumeUsd24).display,
                color: "#38bdf8",
              }}
              right={{
                label: "pure backing",
                amount: view.hardBackingUsd ?? 0,
                text: usd(view.hardBackingUsd).display,
                color: "#eab308",
              }}
            />
          </div>

          <div className="mt-4">
            <div className="grid grid-cols-3 gap-2 border-b border-border pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span title="Approved insider account.">Insider</span>
              <span title="This token the insider has posted in pools.">Liquidity</span>
              <span title="This token the insider holds outside pools.">Holdings</span>
            </div>
            {books.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No insider rows yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {books.map((row) => {
                  const open = openAccount === row.account;
                  const liq = qty(row.liquidity, sym, prec);
                  const held = qty(row.holdings, sym, prec);
                  return (
                    <li key={row.account} className="py-2">
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <button
                          type="button"
                          className="truncate text-left font-mono underline"
                          onClick={() => setOpenAccount(open ? "" : row.account)}
                        >
                          {row.account}
                        </button>
                        <span className="truncate font-mono" title={liq.full}>{liq.display}</span>
                        <span className="truncate font-mono" title={held.full}>{held.display}</span>
                      </div>
                      {open ? (
                        <div className="mt-2 border border-border bg-background p-2 text-xs">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Top pools and tokens</p>
                          <ul className="mt-1 space-y-1 font-mono">
                            <li>{held.display}</li>
                            {row.pools.map((pool) => (
                              <li key={pool.id}>
                                <a className="underline" href={pool.href} target="_blank" rel="noreferrer">
                                  {pool.quote} pool {pool.id}
                                </a>
                                {" "}
                                {qty(pool.tokens, sym, prec).display}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => setShowBubbles((on) => !on)}>
              {showBubbles ? "Hide bubbles" : "Show bubbles"}
            </button>
            {showBubbles ? (
              <HoldingBubbles
                pools={view.poolBook}
                wallets={wallets}
                officialPoolId={props.poolId}
                symbol={sym}
              />
            ) : null}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
            <Stat
              label="Liquid backing"
              value={usd(view.liquidBackingUsd).display}
              title={usd(view.liquidBackingUsd).full}
              tone="gold"
              hint="Quote in every Alcor pool: the locked position plus community LP."
            />
            <Stat
              label="Price"
              value={qty(view.midQuote, quote).display}
              title={mid.full}
              hint="Price from the main locked pool."
            />
            <Stat
              label={`Locked ${quote}`}
              value={lockedUsd ? `${lockedQuote.display} (${lockedUsd})` : lockedQuote.display}
              title={lockedUsd ? `${lockedQuote.full} (${lockedUsd})` : lockedQuote.full}
              tone="gold"
              hint="Quote sitting in the day-one locked position, with its dollar value."
            />
            <Stat label="Pure liquid static" value={lockedTokens.display} title={lockedTokens.full} hint="Tokens still inside the locked position." />
            <Stat
              label="In hands"
              value={tradable.display}
              title={tradable.full}
              hint="Max supply minus tokens in the main locked position."
            />
            <Stat
              label="Tradable print"
              value={printOf(view.tradablePrintUsd, view.midQuote, view.tradableSupply, quote).display}
              title={printOf(view.tradablePrintUsd, view.midQuote, view.tradableSupply, quote).full}
              hint="Price times in-hands supply."
            />
            <Stat label="swap.alcor" value={onAlcor.display} title={onAlcor.full} hint="Token balance on swap.alcor, all pools." />
            <Stat
              label="Satellite pooled"
              value={satellite.display}
              title={satellite.full}
              hint="swap.alcor balance minus the main locked position."
            />
            <Stat
              label="Wallet float"
              value={floatQty.display}
              title={floatQty.full}
              hint="Max supply minus the swap.alcor balance."
            />
            <Stat
              label="Wallet print"
              value={printOf(view.walletPrintUsd, view.midQuote, view.walletFloat, quote).display}
              title={printOf(view.walletPrintUsd, view.midQuote, view.walletFloat, quote).full}
              hint="Price times wallet float."
            />
            <Stat
              label="Pure backing"
              value={view.hardBackingUsd != null ? usd(view.hardBackingUsd).display : lockedQuote.display}
              title={view.hardBackingUsd != null ? usd(view.hardBackingUsd).full : lockedQuote.full}
              tone="gold"
              hint="Dollar value of the quote in the main locked position."
            />
            <Stat
              label="Backing community LP"
              value={money(lpSplit.sameUsd)}
              title={lpSplit.sameUsd > 0 ? usd(lpSplit.sameUsd).full : undefined}
              color={BACKING_LP}
              hint={sameHint}
            />
            <Stat
              label="Ecosystem community LP"
              value={money(lpSplit.ecosystemUsd)}
              title={lpSplit.ecosystemUsd > 0 ? usd(lpSplit.ecosystemUsd).full : undefined}
              color={ECOSYSTEM_LP}
              hint={ecoHint}
            />
            <Stat
              label="Degen LP"
              value={money(lpSplit.degenUsd)}
              title={lpSplit.degenUsd > 0 ? usd(lpSplit.degenUsd).full : undefined}
              color={DEGEN_LP}
              hint={degenHint}
            />
            <Stat
              label="Backing / full print"
              value={share(view.backingOverFull)}
              hint="Pure backing divided by price times max supply. Locked tokens stay in the denominator."
            />
            <Stat
              label="Backing / wallet print"
              value={share(view.backingOverWallet)}
              hint="Pure backing divided by wallet print."
            />
            <Stat label="Pool TVL" value={usd(view.poolTvlUsd).display} title={usd(view.poolTvlUsd).full} hint="Alcor TVL of the main pool. Includes the token side." />
            <Stat label="Vol / backing" value={multiple(view.volOverBacking)} hint="24h volume divided by pure backing." />
          </div>

          {view.unpricedPools > 0 ? (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {view.unpricedPools} pool{view.unpricedPools === 1 ? "" : "s"} had no USD price, so that quote is left out of pool redeem cover.
            </p>
          ) : null}

          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            <Reading
              label="Main redeem cover"
              value={share(view.backingOverWallet)}
              body="If every wallet sold, this is the share of that dump the day-one locked stables can cash."
            />
            <Reading
              label="Pool redeem cover"
              value={share(view.poolRedeemCover)}
              body="Same wallet dump, counted against quote in all swap.alcor pools, not just the main locked range."
            />
            <Reading
              label="Book cover"
              value={share(view.bookCover)}
              body="Wallets and community LP sell. Cash is still the main locked stables."
            />
            <Reading
              label="Community LP"
              value={satellite.display}
              title={satellite.full}
              body="Tokens on swap.alcor outside the main locked pools. Crowd-posted depth."
            />
            <Reading
              label="Backing community LP"
              value={money(lpSplit.sameUsd)}
              title={lpSplit.sameUsd > 0 ? usd(lpSplit.sameUsd).full : undefined}
              body={sameHint}
            />
            <Reading
              label="Ecosystem community LP"
              value={money(lpSplit.ecosystemUsd)}
              title={lpSplit.ecosystemUsd > 0 ? usd(lpSplit.ecosystemUsd).full : undefined}
              body={ecoHint}
            />
            <Reading
              label="Degen LP"
              value={money(lpSplit.degenUsd)}
              title={lpSplit.degenUsd > 0 ? usd(lpSplit.degenUsd).full : undefined}
              body={degenHint}
            />
            <Reading
              label="Liquid backing"
              value={usd(view.liquidBackingUsd).display}
              title={usd(view.liquidBackingUsd).full}
              body="Pure backing plus quote posted in community LP."
            />
            <Reading
              label="Pure backing"
              value={usd(view.hardBackingUsd).display}
              title={usd(view.hardBackingUsd).full}
              body="Stables in the main locked pools. The official cash."
            />
            <Reading
              label="Pure liquid static"
              value={lockedTokens.display}
              title={lockedTokens.full}
              body="Tokens already in those main pools. Safe inventory, not a dump."
            />
            <Reading
              label="Loose float"
              value={floatQty.display}
              title={floatQty.full}
              body="Max supply minus everything on swap.alcor. Wallets that can hit the book."
            />
            <Reading
              label="LP loyalty"
              value={share(view.lpLoyalty)}
              body="Community LP / (community LP + loose float). How much of the unlocked token is still pooled."
            />
          </ul>
        </>
      ) : null}
    </section>
  );
}
