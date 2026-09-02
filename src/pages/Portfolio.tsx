import { useCallback, useEffect, useState } from "react";
import { alcorSwapUrl, explorerTx, SWAP_ALCOR } from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { assetAmountNumber, parseAsset } from "@/services/assets";
import { readAccounts, readFlexers, readLaunches, readStat, readXprBalance } from "@/services/flexTables";
import { reflectAction } from "@/services/launchActions";
import { symbolCodeOf } from "@/services/preflight";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

const DIST_BPS = 0.618; // flexforex: each splash pays 61.8% of a pool
const DEX_VAULTS = [SWAP_ALCOR, "alcor", "gold.mon3y"] as const;

type Holding = {
  symbol: string;
  precision: number;
  quoteSymbol: string;
  quoteContract: string;
  balance: number;
  flexer: Record<string, unknown> | null;
  reflectionPool: number;
  luckPool: number;
  numbersPool: number;
  estSplash: number | null;
};

function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

function fmt(n: number, precision = 4): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: precision });
}

export default function Portfolio() {
  const { actor, isLoggedIn, addWebAuthWallet, transact } = useWallet();
  const [xpr, setXpr] = useState<number | null>(null);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reflecting, setReflecting] = useState<string | null>(null);
  const [reflectMsg, setReflectMsg] = useState<Record<string, { tx?: string; err?: string }>>({});

  const load = useCallback(async () => {
    if (!actor) return;
    setBusy(true);
    setError("");
    readXprBalance(actor)
      .then(setXpr)
      .catch(() => setXpr(null));
    try {
      const launches = await readLaunches(200);
      const stamped = launches.filter((l) => Boolean(pick(l, "launched")));
      const rows: Holding[] = [];
      await Promise.all(
        stamped.map(async (l) => {
          const symbol = symbolCodeOf(pick(l, "token_symbol", "symbol"));
          if (!symbol) return;
          const q = pick(l, "quote") as { quantity?: string; contract?: string } | undefined;
          const [acct, flexers, stat, ...vaults] = await Promise.all([
            readAccounts(actor, symbol).catch(() => ({ rows: [] as Record<string, unknown>[] })),
            readFlexers(symbol, 500).catch(() => [] as Record<string, unknown>[]),
            readStat(symbol).catch(() => null),
            ...DEX_VAULTS.map((v) =>
              readAccounts(v, symbol).catch(() => ({ rows: [] as Record<string, unknown>[] }))
            ),
          ]);
          const balAsset = parseAsset(String(pick(acct.rows[0], "balance") ?? ""));
          const flexer = flexers.find((f) => String(pick(f, "owner", "account")) === actor) ?? null;
          if (!balAsset && !flexer) return;

          const precision = balAsset?.precision ?? 4;
          const supply = assetAmountNumber(String(pick(stat, "supply") ?? "0"));
          const reflectionPool = assetAmountNumber(String(pick(stat, "reflection_pool") ?? "0"));
          const luckPool = assetAmountNumber(String(pick(stat, "luck_pool") ?? "0"));
          const numbersPool = assetAmountNumber(String(pick(stat, "numbers_pool") ?? "0"));
          const vaultTotal = vaults.reduce(
            (s, v) => s + assetAmountNumber(String(pick(v.rows[0], "balance") ?? "0")),
            0
          );
          const denom = supply - vaultTotal;
          const balance = balAsset
            ? Number(balAsset.amount) / Math.pow(10, balAsset.precision)
            : 0;
          const estSplash =
            balance > 0 && denom > 0 && reflectionPool > 0
              ? reflectionPool * DIST_BPS * (balance / denom)
              : null;

          rows.push({
            symbol,
            precision,
            quoteSymbol: parseAsset(q?.quantity ?? "")?.symbol ?? "",
            quoteContract: q?.contract ?? "",
            balance,
            flexer,
            reflectionPool,
            luckPool,
            numbersPool,
            estSplash,
          });
        })
      );
      rows.sort((a, b) => b.balance - a.balance);
      setHoldings(rows);
    } catch (err) {
      const msg = txErrorMessage(err);
      if (/retrieve account|unknown key|not.*live/i.test(msg)) {
        setHoldings([]);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [actor]);

  useEffect(() => {
    void load();
  }, [load]);

  const reflect = async (symbol: string) => {
    if (!actor) return;
    setReflecting(symbol);
    setReflectMsg((m) => ({ ...m, [symbol]: {} }));
    try {
      const res = await transact([reflectAction(symbol, actor)]);
      setReflectMsg((m) => ({ ...m, [symbol]: { tx: txIdFromResult(res) || "ok" } }));
    } catch (err) {
      const msg = txErrorMessage(err);
      const hint = hintForError(msg);
      setReflectMsg((m) => ({ ...m, [symbol]: { err: hint ? `${msg} — ${hint}` : msg } }));
    } finally {
      setReflecting(null);
    }
  };

  if (!isLoggedIn || !actor) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center sm:px-6">
        <h1 className="text-3xl font-black tracking-tight">Portfolio</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect a wallet to track your flex balances, reflection pools, and splash estimates.
        </p>
        <button type="button" className="btn btn-primary btn-lg mt-6" onClick={() => void addWebAuthWallet()}>
          Connect WebAuth
        </button>
      </div>
    );
  }

  const pendingCount = holdings?.filter((h) => h.reflectionPool > 0).length ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Portfolio</h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{actor}</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void load()}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="stat-box">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">XPR balance</div>
          <div className="mt-1 font-mono text-lg font-bold">
            {xpr == null ? "…" : xpr.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </div>
        </div>
        <div className="stat-box">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Flex tokens held</div>
          <div className="mt-1 font-mono text-lg font-bold">{holdings?.length ?? "…"}</div>
        </div>
        <div className="stat-box">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Earning reflections</div>
          <div className="mt-1 font-mono text-lg font-bold">
            {holdings?.filter((h) => h.flexer && !h.flexer.is_banned).length ?? "…"}
          </div>
        </div>
        <div className="stat-box">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Pools pending</div>
          <div className="mt-1 font-mono text-lg font-bold text-primary">{holdings ? pendingCount : "…"}</div>
        </div>
      </div>

      {error ? <p className="mt-6 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</p> : null}

      {holdings == null ? (
        <p className="mt-6 text-sm text-muted-foreground">Reading your flex positions…</p>
      ) : holdings.length === 0 ? (
        <div className="card mt-6 p-8 text-center text-sm text-muted-foreground">
          No flex token balances for {actor}. Grab one on Alcor after a launch stamps.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {holdings.map((h) => {
            const msg = reflectMsg[h.symbol];
            const pickCode = Number(pick(h.flexer, "pick") ?? 1000);
            const beneficiary = String(pick(h.flexer, "beneficiary") ?? "");
            const beneRate = Number(pick(h.flexer, "bene_rate") ?? 10000);
            const flextoken = Number(pick(h.flexer, "flextoken") ?? 0);
            return (
              <article key={h.symbol} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-mono text-lg font-bold">${h.symbol}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.quoteSymbol ? `${h.quoteSymbol} pair` : "flex token"} ·{" "}
                      {h.flexer
                        ? h.flexer.is_banned
                          ? "reflections renounced"
                          : "reflections active"
                        : "no flexer row yet"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-bold">{fmt(h.balance, h.precision)}</div>
                    <div className="text-xs text-muted-foreground">balance</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={h.reflectionPool > 0 ? "chip-primary" : "chip-muted"}>
                    pool {fmt(h.reflectionPool, h.precision)} {h.symbol}
                  </span>
                  {h.luckPool > 0 ? <span className="chip-primary">luck {fmt(h.luckPool, h.precision)}</span> : null}
                  {h.numbersPool > 0 ? (
                    <span className="chip-primary">numbers {fmt(h.numbersPool, h.precision)}</span>
                  ) : null}
                  {h.estSplash != null ? (
                    <span className="chip-success" title="Your balance ÷ circulating supply × 61.8% of the pending pool">
                      est. splash ~{fmt(h.estSplash, h.precision)} {h.symbol}
                    </span>
                  ) : null}
                  {pickCode !== 1000 ? <span className="chip-muted">number {pickCode}</span> : null}
                  {beneficiary ? (
                    <span className="chip-muted">
                      → {beneficiary} {100 - beneRate / 100}%
                    </span>
                  ) : null}
                  {flextoken ? <span className="chip-muted">auto-swap pool #{flextoken}</span> : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={reflecting != null}
                    onClick={() => void reflect(h.symbol)}
                  >
                    {reflecting === h.symbol ? "Signing…" : "Reflect"}
                  </button>
                  {h.quoteSymbol ? (
                    <a
                      href={alcorSwapUrl(h.quoteSymbol, h.quoteContract, h.symbol)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                    >
                      Trade
                    </a>
                  ) : null}
                  {msg?.tx ? (
                    <a
                      href={explorerTx(msg.tx)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-success"
                    >
                      reflected {msg.tx.slice(0, 10)}…
                    </a>
                  ) : null}
                  {msg?.err ? <span className="text-xs text-destructive">{msg.err}</span> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
