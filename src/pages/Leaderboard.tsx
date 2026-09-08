import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FLEX_PROGRAMS, alcorSwapUrl, explorerAccount, explorerTx, flexAccount, type FlexProgram } from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { assetAmountNumber, parseAsset } from "@/services/assets";
import { readFlexers, readLaunches, readStat } from "@/services/flexTables";
import { checklockAction, pullangelAction, pulljackpotAction } from "@/services/launchActions";
import { symbolCodeOf } from "@/services/preflight";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

type LaunchRow = Record<string, unknown>;

type LaunchItem = {
  id: string;
  program: FlexProgram;
  code: string;
  symbol: string;
  row: LaunchRow;
};

type StatPots = {
  angelPool: number;
  jackpotPool: number;
  precision: number;
};

type PokeKind = "checklock" | "pullangel" | "pulljackpot";

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

function fmtBps(bps: unknown): string {
  const n = Number(bps);
  if (!Number.isFinite(n)) return "—";
  return `${(n / 100).toFixed(2)}%`;
}

function unlockLabel(unlock: unknown): string {
  const n = Number(unlock);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Date(n * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function Leaderboard() {
  const { isLoggedIn, transact } = useWallet();
  const [launches, setLaunches] = useState<LaunchItem[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [flexers, setFlexers] = useState<LaunchRow[] | null>(null);
  const [flexersBusy, setFlexersBusy] = useState(false);
  const [pots, setPots] = useState<StatPots | null>(null);
  const [poking, setPoking] = useState<PokeKind | null>(null);
  const [pokeMsg, setPokeMsg] = useState<{ tx?: string; err?: string }>({});

  useEffect(() => {
    Promise.all(
      FLEX_PROGRAMS.map(async (p) => {
        const code = flexAccount(p.id);
        const rows = await readLaunches(code, 200).catch(() => [] as LaunchRow[]);
        return rows
          .filter((r) => Boolean(pick(r, "launched")))
          .map((row) => {
            const symbol = symbolCodeOf(pick(row, "token_symbol", "symbol"));
            return { id: `${code}:${symbol}`, program: p.id, code, symbol, row };
          })
          .filter((item) => item.symbol);
      })
    )
      .then((groups) => {
        const stamped = groups.flat();
        setLaunches(stamped);
        if (stamped.length) setSelected(stamped[0].id);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (/retrieve account|unknown key|not.*live/i.test(msg)) {
          setLaunches([]);
          setNotice("Flex contracts are not live yet — launches will appear here after the first liftoff.");
        } else {
          setError(msg);
        }
      });
  }, []);

  const loadFlexers = useCallback((item: LaunchItem) => {
    setFlexersBusy(true);
    setFlexers(null);
    readFlexers(item.code, item.symbol, 200)
      .then((rows) => setFlexers([...rows].sort((a, b) => balanceOf(b) - balanceOf(a))))
      .catch(() => setFlexers([]))
      .finally(() => setFlexersBusy(false));
  }, []);

  const loadPots = useCallback((item: LaunchItem) => {
    setPots(null);
    readStat(item.code, item.symbol)
      .then((stat) => {
        if (!stat) {
          setPots({ angelPool: 0, jackpotPool: 0, precision: 4 });
          return;
        }
        const supply = parseAsset(String(pick(stat, "supply") ?? ""));
        setPots({
          angelPool: assetAmountNumber(String(pick(stat, "angel_numbers_pool") ?? "0")),
          jackpotPool: assetAmountNumber(String(pick(stat, "jackpot_pool") ?? "0")),
          precision: supply?.precision ?? 4,
        });
      })
      .catch(() => setPots({ angelPool: 0, jackpotPool: 0, precision: 4 }));
  }, []);

  const selectedLaunch = useMemo(
    () => launches?.find((l) => l.id === selected) ?? null,
    [launches, selected]
  );

  useEffect(() => {
    if (!selectedLaunch) return;
    loadFlexers(selectedLaunch);
    loadPots(selectedLaunch);
    setPokeMsg({});
  }, [selectedLaunch, loadFlexers, loadPots]);

  const poke = async (kind: PokeKind) => {
    if (!selectedLaunch || !isLoggedIn) return;
    setPoking(kind);
    setPokeMsg({});
    try {
      const action =
        kind === "checklock"
          ? checklockAction(selectedLaunch.code, selectedLaunch.symbol)
          : kind === "pullangel"
            ? pullangelAction(selectedLaunch.code, selectedLaunch.symbol)
            : pulljackpotAction(selectedLaunch.code, selectedLaunch.symbol);
      const res = await transact([action]);
      setPokeMsg({ tx: txIdFromResult(res) || "ok" });
      loadPots(selectedLaunch);
    } catch (err) {
      const msg = txErrorMessage(err);
      const hint = hintForError(msg);
      setPokeMsg({ err: hint ? `${msg} — ${hint}` : msg });
    } finally {
      setPoking(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Leaderboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Live launches across easyflex, complexflex, and flexforex.
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
          No live launches yet. Be the first — hit the Launch wizard.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <ul className="space-y-2">
            {launches.map((l) => {
              const active = l.id === selected;
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(l.id)}
                    className={`card w-full p-4 text-left transition-all ${
                      active ? "border-primary/60 bg-primary/10" : "hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-base font-bold">${l.symbol}</span>
                      <span className="chip-success">live</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {l.program} @ {l.code} · {quoteLabel(l.row)}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                      pool #{String(pick(l.row, "pure_liquid_alcor_pool_id", "pool_id", "poolId") ?? "—")}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <section className="card space-y-5 p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Top flexers · ${selectedLaunch?.symbol}</h2>
              {selectedLaunch ? (
                <div className="flex flex-wrap gap-2">
                  <Link
                    to={`/token/${selectedLaunch.code}/${selectedLaunch.symbol}`}
                    className="btn btn-outline btn-sm"
                  >
                    Manage
                  </Link>
                  <a
                    href={alcorSwapUrl(
                      parseAsset((pick(selectedLaunch.row, "quote") as { quantity?: string })?.quantity ?? "")?.symbol ?? "",
                      (pick(selectedLaunch.row, "quote") as { contract?: string })?.contract ?? "",
                      selectedLaunch.symbol,
                      selectedLaunch.code
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                  >
                    Trade
                  </a>
                </div>
              ) : null}
            </div>

            {selectedLaunch ? (
              <div className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-4">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="chip-muted">
                    skim nyra {fmtBps(pick(selectedLaunch.row, "dev_bps"))} · club{" "}
                    {fmtBps(pick(selectedLaunch.row, "club_bps"))}
                  </span>
                  <span className="chip-muted">
                    LP unlock {unlockLabel(pick(selectedLaunch.row, "unlock_time"))}
                  </span>
                  {Boolean(pick(selectedLaunch.row, "swap_underlying_default")) ? (
                    <span className="chip-muted">
                      reflect → {parseAsset((pick(selectedLaunch.row, "quote") as { quantity?: string })?.quantity ?? "")?.symbol ?? "quote"}
                    </span>
                  ) : (
                    <span className="chip-muted">reflect native</span>
                  )}
                  {selectedLaunch.program === "flexforex" && pots ? (
                    <>
                      <span className={pots.angelPool > 0 ? "chip-primary" : "chip-muted"}>
                        angel pot {pots.angelPool.toLocaleString(undefined, { maximumFractionDigits: pots.precision })}
                      </span>
                      <span className={pots.jackpotPool > 0 ? "chip-primary" : "chip-muted"}>
                        jackpot {pots.jackpotPool.toLocaleString(undefined, { maximumFractionDigits: pots.precision })}
                      </span>
                    </>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={!isLoggedIn || poking != null}
                    title="Raises protocol skim if the LP lock has expired."
                    onClick={() => void poke("checklock")}
                  >
                    {poking === "checklock" ? "Signing…" : "Check lock"}
                  </button>
                  {selectedLaunch.program === "flexforex" ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={!isLoggedIn || poking != null || (pots?.angelPool ?? 0) <= 0}
                        onClick={() => void poke("pullangel")}
                      >
                        {poking === "pullangel" ? "Signing…" : "Pull angel"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={!isLoggedIn || poking != null || (pots?.jackpotPool ?? 0) <= 0}
                        onClick={() => void poke("pulljackpot")}
                      >
                        {poking === "pulljackpot" ? "Signing…" : "Pull jackpot"}
                      </button>
                    </>
                  ) : null}
                  {!isLoggedIn ? (
                    <span className="text-xs text-muted-foreground">Connect a wallet to poke.</span>
                  ) : null}
                  {pokeMsg.tx ? (
                    <a
                      href={explorerTx(pokeMsg.tx)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-success"
                    >
                      tx {pokeMsg.tx.slice(0, 10)}…
                    </a>
                  ) : null}
                  {pokeMsg.err ? <span className="text-xs text-destructive">{pokeMsg.err}</span> : null}
                </div>
              </div>
            ) : null}

            {flexersBusy ? (
              <p className="text-sm text-muted-foreground">Reading flexers…</p>
            ) : !flexers || flexers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No holder rows yet.</p>
            ) : (
              <table className="w-full text-sm">
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
