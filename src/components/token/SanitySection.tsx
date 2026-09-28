import { useEffect, useState } from "react";
import { HoldingBubbles } from "@/components/token/HoldingBubbles";
import { OvalRing, type RingSlice } from "@/components/token/OvalRing";
import { BACKING_LP, BandSquare, CoverGauge, DEGEN_LP, ECOSYSTEM_LP, LoyaltyDisk, TrackPair } from "@/components/token/StatShapes";
import { DecimalText } from "@/components/Amount";
import { Pulse } from "@/components/ui/Pulse";
import { formatNiceNumber, formatPlainNumber, usdParts } from "@/services/money";
import { splitCommunityLp, type SanityView } from "@/services/poolSanity";
import { loadTokenBook } from "@/services/tokenBook";
import type { InsiderRow, WalletDot } from "@/services/tokenCensus";

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

function NumberTitle({
  label,
  explain,
  open,
  onToggle,
}: {
  label: string;
  explain: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="bg-primary/10 px-1 text-left text-[10px] font-semibold uppercase tracking-wider text-foreground/80 hover:bg-primary/25"
      aria-expanded={open}
      onClick={onToggle}
    >
      {label}
    </button>
  );
}

function Explain({ text }: { text: string }) {
  return <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{text}</p>;
}

function Stat({
  label,
  value,
  title,
  explain,
  tone,
  color,
}: {
  label: string;
  value: string;
  title?: string;
  explain: string;
  tone?: "gold" | "up";
  color?: string;
}) {
  const [open, setOpen] = useState(false);
  const colorClass = tone === "gold" ? "text-primary" : tone === "up" ? "text-success" : "text-foreground";
  return (
    <div className="min-w-0">
      <NumberTitle label={label} explain={explain} open={open} onToggle={() => setOpen((on) => !on)} />
      <div
        className={`break-words font-mono text-sm font-semibold ${color ? "" : colorClass}`}
        style={color ? { color } : undefined}
        title={title && title !== value ? title : undefined}
      >
        <DecimalText text={value} />
      </div>
      {open ? <Explain text={explain} /> : null}
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
  const [open, setOpen] = useState(false);
  return (
    <li className="border border-border px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <NumberTitle label={label} explain={body} open={open} onToggle={() => setOpen((on) => !on)} />
        <span className="min-w-0 break-words text-right font-mono text-sm font-semibold" title={title && title !== value ? title : undefined}>
          <DecimalText text={value} />
        </span>
      </div>
      {open ? <Explain text={body} /> : null}
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
    let live = true;
    setBusy(props.poolId > 0);
    setErr("");
    loadTokenBook(props, { force: props.reloadKey > 0 })
      .then((row) => {
        if (!live) return;
        setView(row.view);
        setErr(row.error);
        setHolders(row.holders);
        setInsiders(row.insiders);
        setSpotTokens(row.spotTokens);
        setBooks(row.books);
        setWallets(row.wallets);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setView(null);
        setBooks([]);
        setWallets([]);
        setHolders(null);
        setInsiders(null);
        setSpotTokens(0);
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
  const pureUsd = view?.hardBackingUsd != null && view.hardBackingUsd > 0 ? view.hardBackingUsd : 0;
  const totalUsd = pureUsd + lpSplit.sameUsd + lpSplit.ecosystemUsd + lpSplit.degenUsd;
  const totalBacking = totalUsd > 0 ? usd(totalUsd) : view?.liquidBackingUsd != null ? usd(view.liquidBackingUsd) : { display: "-", full: "-" };
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
            <Stat label="Volume 24h" value={usd(view.volumeUsd24).display} title={usd(view.volumeUsd24).full} explain="Sum of Alcor volumeUSD24 on every swap pool that lists this token." />
            <Stat label="Vol / in hands" value={multiple(view.volOverTradable)} explain="That 24h volume divided by the dollar print of supply outside the locked position (Alcor price times max supply minus locked tokens)." />
            <Stat label="Insiders" value={insiders == null ? "-" : String(insiders)} explain="Count of approved rows on the insiders table for this symbol. If none are approved, the row count." />
            <Stat label="Holders" value={holders == null ? "-" : String(holders)} explain="stat.flexer_count when the contract stores it and it is above zero. Otherwise the number of flexers rows read for this symbol." />
          </div>

          <div className="mt-4">
            <OvalRing
              center={tradable.display}
              sub="in hands"
              topCaption="Distribution"
              topTitle="Distribution of supply."
              bottomCaption="Pure liquid backing"
              bottomTitle={`These are the tokens currently in liquidity pools with ${sym}.`}
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
              total={totalBacking.display}
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
                  label: "Degen community LP",
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
                label: "pure liquid",
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
              label="Total backing"
              value={totalBacking.display}
              title={totalBacking.full}
              tone="gold"
              explain="Pure liquid backing plus quote dollars in backing community LP, ecosystem community LP, and degen community LP."
            />
            <Stat
              label="Price"
              value={qty(view.midQuote, quote).display}
              title={mid.full}
              explain={`Quote per token from sqrtPriceX64 on the locked Alcor pool (pool ${props.poolId}).`}
            />
            <Stat
              label={`Locked ${quote}`}
              value={lockedUsd ? `${lockedQuote.display} (${lockedUsd})` : lockedQuote.display}
              title={lockedUsd ? `${lockedQuote.full} (${lockedUsd})` : lockedQuote.full}
              tone="gold"
              explain={`Quote inside the day-one locked position, from its liquidity and ticks. Dollars are that amount times the Alcor USD price of ${quote}.`}
            />
            <Stat label="Pure liquid static" value={lockedTokens.display} title={lockedTokens.full} explain="This token still inside the day-one locked position, from that position's liquidity and ticks." />
            <Stat
              label="In hands"
              value={tradable.display}
              title={tradable.full}
              explain="stat max supply minus tokens still in the day-one locked position."
            />
            <Stat
              label="Tradable print"
              value={printOf(view.tradablePrintUsd, view.midQuote, view.tradableSupply, quote).display}
              title={printOf(view.tradablePrintUsd, view.midQuote, view.tradableSupply, quote).full}
              explain="Pool mid price times the Alcor USD price of the quote, times in-hands supply."
            />
            <Stat label="swap.alcor" value={onAlcor.display} title={onAlcor.full} explain={`accounts balance of ${sym} scoped to swap.alcor. That is every pool, including the locked position.`} />
            <Stat
              label="Satellite pooled"
              value={satellite.display}
              title={satellite.full}
              explain="swap.alcor balance minus tokens still in the day-one locked position."
            />
            <Stat
              label="Wallet float"
              value={floatQty.display}
              title={floatQty.full}
              explain="stat max supply minus the swap.alcor balance. Tokens that are not in any Alcor pool."
            />
            <Stat
              label="Wallet print"
              value={printOf(view.walletPrintUsd, view.midQuote, view.walletFloat, quote).display}
              title={printOf(view.walletPrintUsd, view.midQuote, view.walletFloat, quote).full}
              explain="Pool mid price times the Alcor USD price of the quote, times wallet float."
            />
            <Stat
              label="Pure liquid backing"
              value={view.hardBackingUsd != null ? usd(view.hardBackingUsd).display : lockedQuote.display}
              title={view.hardBackingUsd != null ? usd(view.hardBackingUsd).full : lockedQuote.full}
              tone="gold"
              explain={`Quote in the day-one locked position times the Alcor USD price of ${quote}.`}
            />
            <Stat
              label="Backing community LP"
              value={money(lpSplit.sameUsd)}
              title={lpSplit.sameUsd > 0 ? usd(lpSplit.sameUsd).full : undefined}
              color={BACKING_LP}
              explain={`Quote USD in community pools whose pair is ${quote || "the launch quote"}, the same asset as the locked backing. The locked position is not included.`}
            />
            <Stat
              label="Ecosystem community LP"
              value={money(lpSplit.ecosystemUsd)}
              title={lpSplit.ecosystemUsd > 0 ? usd(lpSplit.ecosystemUsd).full : undefined}
              color={ECOSYSTEM_LP}
              explain="Quote USD in community pools paired with EASY, WON, GRAMS, MEME, XMD, LOAN, METAL, or an xtoken, when that is not the launch quote."
            />
            <Stat
              label="Degen community LP"
              value={money(lpSplit.degenUsd)}
              title={lpSplit.degenUsd > 0 ? usd(lpSplit.degenUsd).full : undefined}
              color={DEGEN_LP}
              explain="Quote USD in community pools whose pair is neither the launch quote nor an ecosystem token."
            />
            <Stat
              label="Backing / full print"
              value={share(view.backingOverFull)}
              explain="Locked quote divided by mid price times max supply. Locked tokens stay in the supply."
            />
            <Stat
              label="Backing / wallet print"
              value={share(view.backingOverWallet)}
              explain="Locked quote divided by mid price times wallet float (max supply minus the swap.alcor balance)."
            />
            <Stat label="Pool TVL" value={usd(view.poolTvlUsd).display} title={usd(view.poolTvlUsd).full} explain="Alcor tvlUSD on the launch pool. If that is missing, token quantity times token USD plus quote quantity times quote USD." />
            <Stat label="Vol / backing" value={multiple(view.volOverBacking)} explain="Sum of Alcor volumeUSD24 on this token's pools, divided by the dollar value of quote in the locked position." />
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
              body="Locked quote divided by mid price times wallet float. Wallet float is stat max supply minus the swap.alcor balance."
            />
            <Reading
              label="Pool redeem cover"
              value={share(view.poolRedeemCover)}
              body="Priced quote USD in every Alcor pool for this token, divided by the dollar print of wallet float."
            />
            <Reading
              label="Book cover"
              value={share(view.bookCover)}
              body="Locked quote divided by mid price times in-hands supply. In hands is max supply minus tokens still in the locked position."
            />
            <Reading
              label="Community LP"
              value={satellite.display}
              title={satellite.full}
              body="swap.alcor balance of this token minus the amount still in the day-one locked position."
            />
            <Reading
              label="Backing community LP"
              value={money(lpSplit.sameUsd)}
              title={lpSplit.sameUsd > 0 ? usd(lpSplit.sameUsd).full : undefined}
              body={`Quote USD in community pools paired with ${quote || "the launch quote"}. The locked position is excluded.`}
            />
            <Reading
              label="Ecosystem community LP"
              value={money(lpSplit.ecosystemUsd)}
              title={lpSplit.ecosystemUsd > 0 ? usd(lpSplit.ecosystemUsd).full : undefined}
              body="Quote USD in community pools paired with EASY, WON, GRAMS, MEME, XMD, LOAN, METAL, or an xtoken, when that pair is not the launch quote."
            />
            <Reading
              label="Degen community LP"
              value={money(lpSplit.degenUsd)}
              title={lpSplit.degenUsd > 0 ? usd(lpSplit.degenUsd).full : undefined}
              body="Quote USD in community pools whose pair is neither the launch quote nor an ecosystem token."
            />
            <Reading
              label="Total backing"
              value={totalBacking.display}
              title={totalBacking.full}
              body="Pure liquid backing plus quote dollars in backing community LP, ecosystem community LP, and degen community LP."
            />
            <Reading
              label="Pure liquid backing"
              value={usd(view.hardBackingUsd).display}
              title={usd(view.hardBackingUsd).full}
              body={`Quote inside the day-one locked position times the Alcor USD price of ${quote}.`}
            />
            <Reading
              label="Pure liquid static"
              value={lockedTokens.display}
              title={lockedTokens.full}
              body="This token still inside the day-one locked position, from that position's liquidity and ticks."
            />
            <Reading
              label="Loose float"
              value={floatQty.display}
              title={floatQty.full}
              body="stat max supply minus the swap.alcor token balance."
            />
            <Reading
              label="LP loyalty"
              value={share(view.lpLoyalty)}
              body="Satellite pooled tokens divided by satellite pooled plus wallet float. Satellite is swap.alcor minus the locked position."
            />
          </ul>
        </>
      ) : null}
    </section>
  );
}
