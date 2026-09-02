import { useCallback, useEffect, useMemo, useState } from "react";
import { alcorSwapUrl, explorerAccount, FLEXFOREX_CONTRACT } from "@/config/launch";
import { parseAsset } from "@/services/assets";
import { readFlexers, readLaunches } from "@/services/flexTables";
import { symbolCodeOf } from "@/services/preflight";

type LaunchRow = Record<string, unknown>;

function pick(row: LaunchRow, ...keys: string[]): unknown {
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

function balanceOf(row: LaunchRow): number {
  const v = pick(row, "balance", "quantity", "amount");
  if (typeof v === "string") {
    const p = parseAsset(v);
    return p ? Number(p.amount) : Number(v) || 0;
  }
  return Number(v) || 0;
}

function quoteLabel(row: LaunchRow): string {
  const q = pick(row, "quote") as { quantity?: string; contract?: string } | undefined;
  const sym = parseAsset(q?.quantity ?? "")?.symbol ?? "?";
  return `${sym} @ ${q?.contract ?? "?"}`;
}

export default function Leaderboard() {
  const [launches, setLaunches] = useState<LaunchRow[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [flexers, setFlexers] = useState<LaunchRow[] | null>(null);
  const [flexersBusy, setFlexersBusy] = useState(false);

  useEffect(() => {
    readLaunches(200)
      .then((rows) => {
        const stamped = rows.filter((r) => Boolean(pick(r, "launched")));
        setLaunches(stamped);
        if (stamped.length) {
          const first = symbolCodeOf(pick(stamped[0], "token_symbol", "symbol"));
          setSelected(first || null);
        }
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (/retrieve account|unknown key|not.*live/i.test(msg)) {
          setLaunches([]);
          setNotice(`The ${FLEXFOREX_CONTRACT} contract is not live yet — launches will appear here after the first stamp.`);
        } else {
          setError(msg);
        }
      });
  }, []);

  const loadFlexers = useCallback((symbol: string) => {
    setFlexersBusy(true);
    setFlexers(null);
    readFlexers(symbol, 200)
      .then((rows) => setFlexers([...rows].sort((a, b) => balanceOf(b) - balanceOf(a))))
      .catch(() => setFlexers([]))
      .finally(() => setFlexersBusy(false));
  }, []);

  useEffect(() => {
    if (selected) loadFlexers(selected);
  }, [selected, loadFlexers]);

  const selectedLaunch = useMemo(
    () => launches?.find((l) => symbolCodeOf(pick(l, "token_symbol", "symbol")) === selected) ?? null,
    [launches, selected]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Leaderboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Stamped launches on {FLEXFOREX_CONTRACT} and the holders flexing the hardest.
      </p>

      {notice ? (
        <p className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-primary">{notice}</p>
      ) : null}
      {error ? (
        <p className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
      ) : launches == null ? (
        <p className="mt-6 text-sm text-muted-foreground">Reading launches…</p>
      ) : launches.length === 0 ? (
        <div className="card mt-6 p-8 text-center text-sm text-muted-foreground">
          No stamped launches yet. Be the first — hit the Launch wizard.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <ul className="space-y-2">
            {launches.map((l) => {
              const sym = symbolCodeOf(pick(l, "token_symbol", "symbol"));
              const active = sym === selected;
              return (
                <li key={sym}>
                  <button
                    type="button"
                    onClick={() => setSelected(sym)}
                    className={`card w-full p-4 text-left transition-all ${
                      active ? "border-primary/60 bg-primary/10" : "hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-base font-bold">${sym}</span>
                      <span className="chip-success">live</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{quoteLabel(l)}</div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                      pool #{String(pick(l, "pool_id", "poolId") ?? "—")}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <section className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Top flexers · ${selected}</h2>
              {selectedLaunch ? (
                <a
                  href={alcorSwapUrl(
                    parseAsset((pick(selectedLaunch, "quote") as { quantity?: string })?.quantity ?? "")?.symbol ?? "",
                    (pick(selectedLaunch, "quote") as { contract?: string })?.contract ?? "",
                    selected ?? ""
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline btn-sm"
                >
                  Trade
                </a>
              ) : null}
            </div>

            {flexersBusy ? (
              <p className="mt-4 text-sm text-muted-foreground">Reading flexers…</p>
            ) : !flexers || flexers.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No holder rows yet.</p>
            ) : (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">#</th>
                    <th className="py-2 pr-2 font-medium">Holder</th>
                    <th className="py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {flexers.slice(0, 50).map((f, i) => {
                    const owner = String(pick(f, "owner", "account") ?? "—");
                    return (
                      <tr key={owner} className="border-b border-border/50 last:border-0">
                        <td className="py-2.5 pr-2 font-mono text-muted-foreground">{i + 1}</td>
                        <td className="py-2.5 pr-2">
                          <a href={explorerAccount(owner)} target="_blank" rel="noopener noreferrer" className="link font-mono">
                            {owner}
                          </a>
                          {i === 0 ? <span className="chip-primary ml-2">top flex</span> : null}
                        </td>
                        <td className="py-2.5 text-right font-mono font-semibold">
                          {balanceOf(f).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
