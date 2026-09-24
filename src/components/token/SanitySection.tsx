import { useEffect, useState } from "react";
import { Pulse } from "@/components/ui/Pulse";
import { formatNiceNumber, formatPlainNumber, usdParts } from "@/services/money";
import { loadPoolSanity, type SanityView } from "@/services/poolSanity";

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
}: {
  label: string;
  value: string;
  title?: string;
  hint?: string;
  tone?: "gold" | "up";
}) {
  const color = tone === "gold" ? "text-primary" : tone === "up" ? "text-success" : "text-foreground";
  return (
    <div className="min-w-0" title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`break-words font-mono text-sm font-semibold ${color}`} title={title && title !== value ? title : undefined}>
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
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
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
  const poolHref = `https://alcor.exchange/v/xpr/analytics/pools/${props.poolId}`;
  const posHref = `https://alcor.exchange/v/xpr/swap/positions/${props.positionId}`;

  return (
    <section className="mt-4 border border-border bg-background/40 p-4" aria-label="By the numbers">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold tracking-tight">By The Numbers</h2>
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
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
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
            <Stat
              label="Volume 24h"
              value={usd(view.volumeUsd24).display}
              title={usd(view.volumeUsd24).full}
              hint="24h volume across this token's Alcor pools."
            />
            <Stat label="Vol / backing" value={multiple(view.volOverBacking)} hint="24h volume divided by pure backing." />
            <Stat label="Vol / in hands print" value={multiple(view.volOverTradable)} hint="24h volume divided by the in-hands print." />
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
              label="Liquid backing"
              value={usd(view.liquidBackingUsd).display}
              title={usd(view.liquidBackingUsd).full}
              body="Pure backing plus quote posted in community pools."
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
