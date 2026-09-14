import { useEffect, useMemo, useState } from "react";
import { fmtPrice } from "@/components/launch/draftPlan";
import { fetchMajorMcaps, MAJOR_MCAP_FALLBACK, type MajorMcap } from "@/services/majorMcaps";
import {
  buyScenario,
  PRICE_WALK_MULTIPLES,
  rangeMaxMarketCapUsd,
  USD_BUY_PROBE,
  walkCostToMultiple,
  walkCostToSupplyPct,
  type LaunchPlan,
} from "@/services/launchMath";

type Tab = "goto" | "compare" | "scenarios";

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !(n > 0) || !Number.isFinite(n)) return "-";
  if (n >= 1e12) return `$${(n / 1e12).toPrecision(3)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toPrecision(3)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toPrecision(3)}M`;
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(3)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "-";
  if (n >= 10) return `${n.toFixed(1)}%`;
  if (n >= 1) return `${n.toFixed(2)}%`;
  if (n >= 0.01) return `${n.toFixed(3)}%`;
  return `${n.toPrecision(2)}%`;
}

function fmtMult(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "-";
  if (n >= 1e6) return `${(n / 1e6).toPrecision(3)}M x`;
  if (n >= 1000) return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}x`;
  if (n >= 10) return `${n.toFixed(1)}x`;
  return `${n.toFixed(2)}x`;
}

type Props = {
  plan: LaunchPlan;
  maxSupply: string;
  quoteUsd: number;
  quoteSymbol: string;
  tokenSymbol: string;
  initialMarketCapUsd: number | null;
};

function TabLink({ id, label, tab, setTab }: { id: Tab; label: string; tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <button
      type="button"
      className={`link text-xs ${tab === id ? "text-primary" : ""}`}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );
}

export function RangeMoreInfo({ plan, maxSupply, quoteUsd, quoteSymbol, tokenSymbol, initialMarketCapUsd }: Props) {
  const [tab, setTab] = useState<Tab>("goto");
  const [pct, setPct] = useState(10);
  const [extraUsd, setExtraUsd] = useState(0);
  const [extraText, setExtraText] = useState("0");
  const [majors, setMajors] = useState<MajorMcap[]>(MAJOR_MCAP_FALLBACK);
  const [compareLog, setCompareLog] = useState(50);

  useEffect(() => {
    let live = true;
    void fetchMajorMcaps()
      .then((rows) => {
        if (live) setMajors(rows);
      })
      .catch(() => {
        if (live) setMajors(MAJOR_MCAP_FALLBACK);
      });
    return () => {
      live = false;
    };
  }, []);

  const buyout = useMemo(
    () => walkCostToSupplyPct(plan, maxSupply, quoteUsd, pct),
    [plan, maxSupply, quoteUsd, pct]
  );
  const nextCosts = useMemo(
    () => PRICE_WALK_MULTIPLES.map((m) => ({ m, cost: walkCostToMultiple(plan, maxSupply, quoteUsd, m) })),
    [plan, maxSupply, quoteUsd]
  );
  const rangeMaxUsd = useMemo(
    () => rangeMaxMarketCapUsd(plan, maxSupply, quoteUsd),
    [plan, maxSupply, quoteUsd]
  );
  const scenario = useMemo(
    () => buyScenario(plan, maxSupply, quoteUsd, USD_BUY_PROBE, extraUsd),
    [plan, maxSupply, quoteUsd, extraUsd]
  );

  const btcUsd = majors.find((r) => r.id === "bitcoin")?.usd ?? 0;
  const startMc = initialMarketCapUsd && initialMarketCapUsd > 0 ? initialMarketCapUsd : 0;
  const compareTarget = useMemo(() => {
    if (!(startMc > 0) || !(btcUsd > 0)) return 0;
    const t = Math.min(1, Math.max(0, compareLog / 100));
    return startMc * Math.pow(btcUsd / startMc, t);
  }, [startMc, btcUsd, compareLog]);
  const compareWalk = useMemo(() => {
    if (!(startMc > 0) || !(compareTarget > 0)) return null;
    return walkCostToMultiple(plan, maxSupply, quoteUsd, compareTarget / startMc);
  }, [plan, maxSupply, quoteUsd, startMc, compareTarget]);

  const extraSliderMax = useMemo(() => {
    const full = walkCostToSupplyPct(plan, maxSupply, quoteUsd, 100);
    const cap = full?.usd && full.usd > 0 ? full.usd : 1_000_000;
    return Math.max(1000, Math.min(cap, 10_000_000));
  }, [plan, maxSupply, quoteUsd]);

  const commitExtra = (raw: string) => {
    const n = Number(String(raw).replace(/[^\d.]/g, ""));
    const next = Number.isFinite(n) && n >= 0 ? n : 0;
    setExtraUsd(next);
    setExtraText(String(next));
  };

  return (
    <div className="mt-3 border-t border-primary/20 pt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <TabLink id="goto" label="Go to" tab={tab} setTab={setTab} />
        <TabLink id="compare" label="Compare" tab={tab} setTab={setTab} />
        <TabLink id="scenarios" label="Scenarios" tab={tab} setTab={setTab} />
      </div>

      {tab === "goto" ? (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className="flex-1 accent-[hsl(var(--primary))]"
            />
            <span className="w-12 text-right font-mono text-sm font-bold">{pct}%</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Buying {pct}% of supply costs{" "}
            <span className="font-mono font-semibold text-foreground">
              {quoteUsd > 0 ? fmtUsd(buyout?.usd) : `${fmtPrice(buyout?.quoteGross ?? 0)} ${quoteSymbol}`}
            </span>
            {" "}and takes{" "}
            <span className="font-mono font-semibold text-foreground">
              {fmtPrice(buyout?.tokens ?? 0)} {tokenSymbol}
            </span>
            {buyout?.capped ? ". That is the full range." : "."}
          </p>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cost to buy next
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {nextCosts.map(({ m, cost }) => (
                <div key={m} className="rounded-xl border border-primary/15 bg-background/40 px-2 py-2 text-center">
                  <div className="font-mono text-[10px] text-muted-foreground">{m}x</div>
                  <div className="font-mono text-xs font-bold">{fmtUsd(cost?.usd)}</div>
                  {cost?.capped ? <div className="text-[9px] text-muted-foreground">range max</div> : null}
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              USD to walk start price to each multiple, including swap fee. Max means the range tops out first.
            </p>
          </div>
        </div>
      ) : null}

      {tab === "compare" ? (
        <div className="mt-3 space-y-3">
          {startMc > 0 && btcUsd > 0 ? (
            <>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.1}
                  value={compareLog}
                  onChange={(e) => setCompareLog(Number(e.target.value))}
                  className="flex-1 accent-[hsl(var(--primary))]"
                />
                <span className="w-24 text-right font-mono text-xs font-bold">{fmtUsd(compareTarget)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Matching {fmtUsd(compareTarget)} FDV is {fmtMult(compareTarget / startMc)} this launch.
                {compareWalk?.capped
                  ? ` This range maxes at ${fmtUsd(rangeMaxUsd)}.`
                  : ` Cost to walk there is ${fmtUsd(compareWalk?.usd)}.`}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Need a USD start cap from Alcor to compare.</p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {majors.map((row) => {
              const mult = startMc > 0 ? row.usd / startMc : 0;
              const walk = startMc > 0 ? walkCostToMultiple(plan, maxSupply, quoteUsd, mult) : null;
              return (
                <button
                  key={row.id}
                  type="button"
                  className="rounded-xl border border-primary/15 bg-background/40 px-3 py-3 text-left"
                  onClick={() => {
                    if (!(startMc > 0) || !(btcUsd > 0) || !(row.usd > startMc)) {
                      setCompareLog(100);
                      return;
                    }
                    const t = Math.log(row.usd / startMc) / Math.log(btcUsd / startMc);
                    setCompareLog(Math.min(100, Math.max(0, t * 100)));
                  }}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{row.label}</div>
                  <div className="font-mono text-sm font-bold">{fmtUsd(row.usd)}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {startMc > 0 ? `${fmtMult(mult)} vs start` : "-"}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {walk?.capped ? `beyond range (${fmtUsd(rangeMaxUsd)} max)` : `walk ${fmtUsd(walk?.usd)}`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {tab === "scenarios" ? (
        <div className="mt-3 space-y-3">
          {scenario ? (
            <>
              <p className="text-xs text-muted-foreground">
                ${USD_BUY_PROBE} at the start buys{" "}
                <span className="font-mono font-semibold text-foreground">{fmtPct(scenario.firstSupplyPct)}</span>
                {" "}of supply (
                <span className="font-mono font-semibold text-foreground">
                  {fmtPrice(scenario.firstTokens)} {tokenSymbol}
                </span>
                ).
              </p>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Extra bought after that
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={extraSliderMax}
                  step={Math.max(1, Math.round(extraSliderMax / 200))}
                  value={Math.min(extraSliderMax, extraUsd)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setExtraUsd(n);
                    setExtraText(String(n));
                  }}
                  className="flex-1 accent-[hsl(var(--primary))]"
                />
                <input
                  className="input w-28 py-1 text-right font-mono text-sm"
                  inputMode="decimal"
                  value={extraText}
                  onChange={(e) => setExtraText(e.target.value.replace(/[^\d.]/g, ""))}
                  onBlur={() => commitExtra(extraText)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitExtra(extraText);
                    }
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                After another {extraUsd > 0 ? fmtUsd(extraUsd) : "$0"} walks the pool, the original ${USD_BUY_PROBE} bag
                marks at{" "}
                <span className="font-mono font-semibold text-foreground">{fmtUsd(scenario.bagUsdAfter)}</span>
                {" "}({fmtMult(scenario.bagMultiple)}). Extra takes {fmtPct(scenario.extraSupplyPct)} (
                {fmtPrice(scenario.extraTokens)} {tokenSymbol}).
                {scenario.capped ? " The range is fully walked." : ""}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Need a USD quote price from Alcor to run this scenario.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
