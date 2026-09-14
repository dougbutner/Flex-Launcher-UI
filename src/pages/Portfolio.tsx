import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TxLink } from "@/components/launch/ui";
import { TokenIcon } from "@/components/TokenIcon";
import { FLEX_PROGRAMS, alcorSwapUrl, flexAccount, type FlexProgram } from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { assetAmountNumber, parseAsset } from "@/services/assets";
import { readAccounts, readFlexers, readLaunches, readStat, readXprBalance } from "@/services/flexTables";
import { checklockAction, payoutAction, pullangelAction, pulljackpotAction } from "@/services/launchActions";
import { symbolCodeOf } from "@/services/preflight";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";
import { loadProtonTokenTable } from "@/services/tokenProton";

const DIST_BPS = 0.382;

type Holding = {
  key: string;
  program: FlexProgram;
  contract: string;
  payoutSigner: "sender" | "keeper";
  symbol: string;
  precision: number;
  quoteSymbol: string;
  quoteContract: string;
  swapUnderlyingDefault: boolean;
  balance: number;
  flexer: Record<string, unknown> | null;
  reflectionPool: number;
  angelPool: number;
  jackpotPool: number;
  estSplash: number | null;
};

type Issued = {
  key: string;
  program: FlexProgram;
  contract: string;
  symbol: string;
  launched: boolean;
};

type PokeKind = "rain" | "checklock" | "pullangel" | "pulljackpot";

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
  const [issued, setIssued] = useState<Issued[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [poking, setPoking] = useState<string | null>(null);
  const [pokeMsg, setPokeMsg] = useState<Record<string, { tx?: string; err?: string }>>({});
  const [iconsReady, setIconsReady] = useState(0);

  const load = useCallback(async () => {
    if (!actor) return;
    setBusy(true);
    setError("");
    readXprBalance(actor)
      .then(setXpr)
      .catch(() => setXpr(null));
    try {
      void loadProtonTokenTable()
        .then(() => setIconsReady((n) => n + 1))
        .catch(() => []);
      const rows: Holding[] = [];
      const mine: Issued[] = [];
      await Promise.all(
        FLEX_PROGRAMS.map(async (p) => {
          const code = flexAccount(p.id);
          const launches = await readLaunches(code, 200).catch(() => [] as Record<string, unknown>[]);
          await Promise.all(
            launches.map(async (l) => {
              const symbol = symbolCodeOf(pick(l, "token_symbol", "symbol"));
              if (!symbol) return;
              const q = pick(l, "quote") as { quantity?: string; contract?: string } | undefined;
              const [acct, flexers, stat, ...vaults] = await Promise.all([
                readAccounts(code, actor, symbol).catch(() => ({ rows: [] as Record<string, unknown>[] })),
                readFlexers(code, symbol, 500).catch(() => [] as Record<string, unknown>[]),
                readStat(code, symbol).catch(() => null),
                ...p.vaults.map((v) =>
                  readAccounts(code, v, symbol).catch(() => ({ rows: [] as Record<string, unknown>[] }))
                ),
              ]);
              const issuer = String(pick(stat, "issuer") ?? "");
              if (issuer === actor) {
                mine.push({
                  key: `${code}:${symbol}`,
                  program: p.id,
                  contract: code,
                  symbol,
                  launched: Boolean(pick(l, "launched")),
                });
              }
              if (!pick(l, "launched")) return;
              const balAsset = parseAsset(String(pick(acct.rows[0], "balance") ?? ""));
              const flexer = flexers.find((f) => String(pick(f, "owner", "account")) === actor) ?? null;
              if (!balAsset && !flexer) return;

              const precision = balAsset?.precision ?? 4;
              const supply = assetAmountNumber(String(pick(stat, "supply") ?? "0"));
              const reflectionPool = assetAmountNumber(String(pick(stat, "reflection_pool") ?? "0"));
              const angelPool = assetAmountNumber(String(pick(stat, "angel_numbers_pool") ?? "0"));
              const jackpotPool = assetAmountNumber(String(pick(stat, "jackpot_pool") ?? "0"));
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
                key: `${code}:${symbol}`,
                program: p.id,
                contract: code,
                payoutSigner: p.payoutSigner,
                symbol,
                precision,
                quoteSymbol: parseAsset(q?.quantity ?? "")?.symbol ?? "",
                quoteContract: q?.contract ?? "",
                swapUnderlyingDefault: Boolean(pick(l, "swap_underlying_default")),
                balance,
                flexer,
                reflectionPool,
                angelPool,
                jackpotPool,
                estSplash,
              });
            })
          );
        })
      );
      rows.sort((a, b) => b.balance - a.balance);
      setHoldings(rows);
      setIssued(mine.sort((a, b) => a.symbol.localeCompare(b.symbol)));
    } catch (err) {
      const msg = txErrorMessage(err);
      if (/retrieve account|unknown key|not.*live/i.test(msg)) {
        setHoldings([]);
        setIssued([]);
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

  const poke = async (h: Holding, kind: PokeKind) => {
    if (!actor) return;
    const pokeKey = `${h.key}:${kind}`;
    setPoking(pokeKey);
    setPokeMsg((m) => ({ ...m, [h.key]: {} }));
    try {
      const action =
        kind === "rain"
          ? payoutAction(h.contract, h.symbol, actor, h.payoutSigner)
          : kind === "checklock"
            ? checklockAction(h.contract, h.symbol)
            : kind === "pullangel"
              ? pullangelAction(h.contract, h.symbol)
              : pulljackpotAction(h.contract, h.symbol);
      const res = await transact([action]);
      setPokeMsg((m) => ({ ...m, [h.key]: { tx: txIdFromResult(res) || "ok" } }));
      void load();
    } catch (err) {
      const msg = txErrorMessage(err);
      const hint = hintForError(msg);
      setPokeMsg((m) => ({ ...m, [h.key]: { err: hint ? `${msg} - ${hint}` : msg } }));
    } finally {
      setPoking(null);
    }
  };

  if (!isLoggedIn || !actor) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center sm:px-6">
        <h1 className="text-3xl font-black tracking-tight">My Bags</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect a wallet to track your flex balances, reflection pools, and splash estimates.
        </p>
        <button type="button" className="btn btn-primary btn-lg mt-6" onClick={() => void addWebAuthWallet()}>
          Connect Wallet
        </button>
      </div>
    );
  }

  const pendingCount = holdings?.filter((h) => h.reflectionPool > 0).length ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">My Bags</h1>
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
            {holdings?.filter((h) => h.flexer && !h.flexer.fee_opted_out).length ?? "…"}
          </div>
        </div>
        <div className="stat-box">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Pools pending</div>
          <div className="mt-1 font-mono text-lg font-bold text-primary">{holdings ? pendingCount : "…"}</div>
        </div>
      </div>

      {error ? <p className="mt-6 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</p> : null}

      {issued.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-bold tracking-tight">Your launches</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Issuer tools (setdist, ratios, addpool) live on each token’s manage page.
          </p>
          <ul className="mt-3 space-y-2">
            {issued.map((t) => (
              <li key={t.key} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <TokenIcon key={iconsReady} contract={t.contract} symbol={t.symbol} size={36} rounded="xl" />
                  <div>
                  <div className="font-mono font-bold">${t.symbol}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.program} @ {t.contract} · {t.launched ? "live" : "in progress"}
                  </div>
                  </div>
                </div>
                <Link to={`/token/${t.contract}/${t.symbol}`} className="btn btn-outline btn-sm">
                  Manage
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {holdings == null ? (
        <p className="mt-6 text-sm text-muted-foreground">Reading your flex positions…</p>
      ) : holdings.length === 0 ? (
        <div className="card mt-6 p-8 text-center text-sm text-muted-foreground">
          No flex token balances for {actor}. Grab one on Alcor after a launch liftoff.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {holdings.map((h) => {
            const msg = pokeMsg[h.key];
            const angel = Number(pick(h.flexer, "angel_number") ?? 1000);
            const beneficiary = String(pick(h.flexer, "beneficiary") ?? "");
            const beneRate = Number(pick(h.flexer, "bene_rate") ?? 10000);
            const flexPool = Number(pick(h.flexer, "flex_reward_pool_id") ?? 0);
            const optedOut = Boolean(pick(h.flexer, "fee_opted_out"));
            const busyAny = poking != null;
            return (
              <article key={h.key} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <TokenIcon key={iconsReady} contract={h.contract} symbol={h.symbol} size={40} rounded="xl" />
                    <div>
                    <div className="font-mono text-lg font-bold">${h.symbol}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {h.program} @ {h.contract}
                      {h.quoteSymbol ? (
                        <>
                          {" · "}
                          <TokenIcon contract={h.quoteContract} symbol={h.quoteSymbol} size={14} />
                          {h.quoteSymbol} pair
                        </>
                      ) : null}{" "}
                      ·{" "}
                      {h.flexer
                        ? optedOut
                          ? "fees opted out"
                          : "reflections active"
                        : "no flexer row yet"}
                    </div>
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
                  {h.program === "flexforex" ? (
                    <>
                      <span className={h.angelPool > 0 ? "chip-primary" : "chip-muted"}>
                        angel pot {fmt(h.angelPool, h.precision)}
                      </span>
                      <span className={h.jackpotPool > 0 ? "chip-primary" : "chip-muted"}>
                        jackpot {fmt(h.jackpotPool, h.precision)}
                      </span>
                    </>
                  ) : null}
                  {h.estSplash != null ? (
                    <span className="chip-success" title="Your balance ÷ circulating supply × 38.2% of the pending pool">
                      est. splash ~{fmt(h.estSplash, h.precision)} {h.symbol}
                    </span>
                  ) : null}
                  {angel !== 1000 ? <span className="chip-muted">angel {angel}</span> : null}
                  {beneficiary ? (
                    <span className="chip-muted">
                      → {beneficiary} {(beneRate / 100).toFixed(0)}%
                    </span>
                  ) : null}
                  {flexPool ? <span className="chip-muted">flex pool #{flexPool}</span> : null}
                  {!flexPool && h.swapUnderlyingDefault && h.quoteSymbol ? (
                    <span className="chip-muted" title="makeitrain swaps native rewards into the launch quote">
                      → {h.quoteSymbol} default
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busyAny}
                    onClick={() => void poke(h, "rain")}
                  >
                    {poking === `${h.key}:rain` ? "Signing…" : "Make it rain"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busyAny}
                    title="Raises protocol skim if the LP lock has expired."
                    onClick={() => void poke(h, "checklock")}
                  >
                    {poking === `${h.key}:checklock` ? "Signing…" : "Check lock"}
                  </button>
                  {h.program === "flexforex" ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busyAny || h.angelPool <= 0}
                        onClick={() => void poke(h, "pullangel")}
                      >
                        {poking === `${h.key}:pullangel` ? "Signing…" : "Pull angel"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busyAny || h.jackpotPool <= 0}
                        onClick={() => void poke(h, "pulljackpot")}
                      >
                        {poking === `${h.key}:pulljackpot` ? "Signing…" : "Pull jackpot"}
                      </button>
                    </>
                  ) : null}
                  {h.quoteSymbol ? (
                    <a
                      href={alcorSwapUrl(h.quoteSymbol, h.quoteContract, h.symbol, h.contract)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                    >
                      Trade
                    </a>
                  ) : null}
                  <Link to={`/token/${h.contract}/${h.symbol}`} className="btn btn-outline btn-sm">
                    Manage
                  </Link>
                  {msg?.tx ? <TxLink tx={msg.tx} prefix="tx " /> : null}
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
