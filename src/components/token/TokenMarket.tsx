import { useEffect, useMemo, useState } from "react";
import {
  alcorAnalyticsUrl,
  alcorChartWidgetUrl,
  alcorSwapUrl,
} from "@/config/launch";
import { Amount } from "@/components/Amount";
import { GoldPriceChart } from "@/components/token/GoldPriceChart";
import {
  filterPoints,
  fmtPctChange,
  fmtPoolFee,
  loadAlcorMarket,
  type AlcorMarketView,
  type ChartRange,
} from "@/services/alcorMarket";
import { usdParts } from "@/services/money";

type Props = {
  poolId: number;
  contract: string;
  symbol: string;
  quoteContract: string;
  quoteSymbol: string;
  supply: number;
  launched: boolean;
};

function Stat({
  label,
  value,
  title,
  tone,
}: {
  label: string;
  value: string;
  title?: string;
  tone?: "up" | "down" | "gold";
}) {
  const color =
    tone === "up" ? "text-success" : tone === "down" ? "text-destructive" : tone === "gold" ? "text-primary" : "text-foreground";
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`truncate font-mono text-sm font-semibold ${color}`} title={title && title !== value ? title : undefined}>
        {value}
      </div>
    </div>
  );
}

export function TokenMarket({
  poolId,
  contract,
  symbol,
  quoteContract,
  quoteSymbol,
  supply,
  launched,
}: Props) {
  const [view, setView] = useState<"line" | "alcor">("line");
  const [range, setRange] = useState<ChartRange>("all");
  const [data, setData] = useState<AlcorMarketView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!launched || !(poolId > 0)) {
      setData(null);
      return;
    }
    let live = true;
    setBusy(true);
    setErr("");
    loadAlcorMarket({
      poolId,
      tokenContract: contract,
      tokenSymbol: symbol,
      quoteContract,
      quoteSymbol,
      supply,
    })
      .then((row) => {
        if (!live) return;
        setData(row);
        if (!row) setErr("Alcor pool not found.");
      })
      .catch((e) => {
        if (!live) return;
        setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [launched, poolId, contract, symbol, quoteContract, quoteSymbol, supply]);

  const points = useMemo(() => (data ? filterPoints(data.points, range) : []), [data, range]);
  const chartSrc = quoteSymbol
    ? alcorChartWidgetUrl(quoteSymbol, quoteContract, symbol, contract, poolId)
    : "";
  const changeTone = data && data.change24 > 0 ? "up" : data && data.change24 < 0 ? "down" : undefined;

  if (!launched || !(poolId > 0) || !quoteSymbol) {
    return (
      <div className="card mt-6 p-5 text-sm text-muted-foreground">
        Price chart appears after liftoff, once the launch pair is on Alcor.
      </div>
    );
  }

  return (
    <section className="mt-6 w-full">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Market</p>
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-lg font-black tracking-tight">
            <Amount value={data?.priceQuote ?? 0} />
            <span className="text-sm font-semibold text-muted-foreground">{quoteSymbol}</span>
            {data?.priceUsd ? <Amount value={data.priceUsd} kind="usd" className="text-sm font-semibold text-primary" /> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["1d", "7d", "all"] as ChartRange[]).map((r) => (
            <button
              key={r}
              type="button"
              className={`btn btn-sm ${range === r ? "btn-primary" : "btn-outline"}`}
              onClick={() => setRange(r)}
            >
              {r === "all" ? "All" : r.toUpperCase()}
            </button>
          ))}
          <button
            type="button"
            className={`btn btn-sm ${view === "line" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setView("line")}
          >
            Line
          </button>
          <button
            type="button"
            className={`btn btn-sm ${view === "alcor" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setView("alcor")}
          >
            Alcor
          </button>
        </div>
      </div>

      <div className="card mt-3 overflow-hidden">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border px-4 py-3 sm:grid-cols-4 xl:grid-cols-8">
            <Stat label="24h" value={data ? fmtPctChange(data.change24) : "-"} tone={changeTone} />
            <Stat label="Vol 24h" value={usdParts(data?.volumeUsd24 ?? 0).display} title={usdParts(data?.volumeUsd24 ?? 0).full} />
            <Stat label="TVL" value={usdParts(data?.tvlUsd ?? 0).display} title={usdParts(data?.tvlUsd ?? 0).full} tone="gold" />
            <Stat label="Mcap" value={usdParts(data?.mcapUsd ?? 0).display} title={usdParts(data?.mcapUsd ?? 0).full} />
            <Stat label="Vol 7d" value={usdParts(data?.volumeUsdWeek ?? 0).display} title={usdParts(data?.volumeUsdWeek ?? 0).full} />
            <Stat label="Fee" value={fmtPoolFee(data?.fee ?? 0)} />
            <Stat
              label={symbol}
              value={
                data?.tokenQty
                  ? data.tokenQty.toLocaleString(undefined, { maximumFractionDigits: 0 })
                  : "-"
              }
            />
            <Stat
              label={quoteSymbol}
              value={
                data?.quoteQty
                  ? data.quoteQty.toLocaleString(undefined, { maximumFractionDigits: 2 })
                  : "-"
              }
            />
          </div>
          {busy && !data ? (
            <div className="flex min-h-[220px] w-full items-center justify-center text-xs text-muted-foreground">
              Loading Alcor…
            </div>
          ) : err && !data ? (
            <div className="flex min-h-[220px] w-full items-center justify-center px-4 text-center text-xs text-destructive">{err}</div>
          ) : view === "alcor" && chartSrc ? (
            <iframe
              title="Alcor chart"
              src={chartSrc}
              className="h-[420px] w-full border-0 bg-background"
              allow="clipboard-write"
            />
          ) : (
            <GoldPriceChart points={points} quoteSymbol={quoteSymbol} />
          )}
          <div className="flex flex-wrap gap-3 border-t border-border px-4 py-2 text-[11px]">
            <a
              href={alcorSwapUrl(quoteSymbol, quoteContract, symbol, contract)}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Swap
            </a>
            <a href={chartSrc} target="_blank" rel="noopener noreferrer" className="link">
              Chart widget
            </a>
            <a href={alcorAnalyticsUrl(symbol, contract)} target="_blank" rel="noopener noreferrer" className="link">
              Analytics
            </a>
            <span className="text-muted-foreground">pool {poolId}</span>
            {data?.changeWeek ? (
              <span className="text-muted-foreground">7d {fmtPctChange(data.changeWeek)}</span>
            ) : null}
          </div>
          {data?.trades.length ? (
            <ul className="max-h-40 overflow-auto border-t border-border font-mono text-[11px]">
              {data.trades.map((tr, i) => (
                <li
                  key={`${tr.t}-${i}`}
                  className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-1.5 last:border-0"
                >
                  <span className={tr.side === "buy" ? "text-success" : "text-destructive"}>{tr.side}</span>
                  <span className="text-foreground">
                    <Amount value={tr.price} />
                  </span>
                  <span className="text-muted-foreground">
                    <Amount value={tr.usd} kind="usd" />
                  </span>
                  <span className="truncate text-muted-foreground">{tr.sender}</span>
                </li>
              ))}
            </ul>
          ) : null}
      </div>
    </section>
  );
}
