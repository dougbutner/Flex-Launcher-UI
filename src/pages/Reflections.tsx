import { useCallback, useEffect, useState } from "react";
import { TxLink } from "@/components/launch/ui";
import { FLEX_PROGRAMS, explorerTx, flexAccount, flexMeta, type FlexProgram } from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { parseAsset } from "@/services/assets";
import { readLaunches, readStat } from "@/services/flexTables";
import { payoutAction } from "@/services/launchActions";
import { getActions, type HyperionAction } from "@/services/rpc";
import { symbolCodeOf } from "@/services/preflight";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";
import { fetchAlcorUsdPrice } from "@/services/xtokenCatalog";

const PAGE = 25;
const DIST_BPS = 0.382;

type Row = HyperionAction & { contract: string; actionName: string };

type Dryland = {
  key: string;
  program: FlexProgram;
  contract: string;
  symbol: string;
  precision: number;
  pool: number;
  usd: number;
};

function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

function ts(a: HyperionAction): string {
  const raw = a["@timestamp"] ?? a.timestamp;
  if (!raw) return "-";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString();
}

function dataSummary(data: Record<string, unknown> | undefined): Array<[string, string]> {
  if (!data) return [];
  return Object.entries(data)
    .filter(([, v]) => typeof v === "string" || typeof v === "number")
    .slice(0, 6)
    .map(([k, v]) => [k, String(v)]);
}

function fmtUsd(n: number): string {
  if (!(n > 0) || !Number.isFinite(n)) return "-";
  if (n >= 1e12) return `$${(n / 1e12).toPrecision(3)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toPrecision(3)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toPrecision(3)}M`;
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(3)}`;
}

function fmtPool(n: number, precision: number): string {
  const digits = n >= 1000 ? Math.min(2, precision) : precision;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

async function loadDrylands(): Promise<Dryland[]> {
  const groups = await Promise.all(
    FLEX_PROGRAMS.map(async (p) => {
      const code = flexAccount(p.id);
      const launches = await readLaunches(code, 200).catch(() => [] as Record<string, unknown>[]);
      const items = launches
        .filter((row) => Boolean(pick(row, "launched")))
        .map((row) => ({ code, program: p.id, symbol: symbolCodeOf(pick(row, "token_symbol", "symbol")) }))
        .filter((item) => item.symbol);
      return Promise.all(
        items.map(async ({ code, program, symbol }) => {
          const stat = await readStat(code, symbol).catch(() => null);
          const poolAsset = parseAsset(String(pick(stat, "reflection_pool") ?? ""));
          const pool = poolAsset ? Number(poolAsset.amount) : 0;
          if (!(pool > 0)) return null;
          const usdPrice = await fetchAlcorUsdPrice(code, symbol).catch(() => 0);
          return {
            key: `${code}:${symbol}`,
            program,
            contract: code,
            symbol,
            precision: poolAsset?.precision ?? 4,
            pool,
            usd: usdPrice > 0 ? pool * usdPrice : 0,
          } satisfies Dryland;
        })
      );
    })
  );
  return groups
    .flat()
    .filter((row): row is Dryland => row != null)
    .sort((a, b) => b.usd - a.usd || b.pool - a.pool || a.symbol.localeCompare(b.symbol));
}

export default function Reflections() {
  const { actor, isLoggedIn, addWebAuthWallet, transact } = useWallet();
  const [actions, setActions] = useState<Row[]>([]);
  const [drylands, setDrylands] = useState<Dryland[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [raining, setRaining] = useState<string | null>(null);
  const [rainMsg, setRainMsg] = useState<Record<string, { tx?: string; err?: string }>>({});

  const pull = useCallback(async () => {
    const [pages, pending] = await Promise.all([
      Promise.all(
        FLEX_PROGRAMS.map(async (p) => {
          const account = flexAccount(p.id);
          const actionName = "makeitrain";
          const res = await getActions({
            account,
            filter: `${account}:${actionName}`,
            limit: PAGE,
            skip: 0,
          });
          return res.actions.map((a) => ({ ...a, contract: account, actionName }));
        })
      ),
      loadDrylands().catch(() => [] as Dryland[]),
    ]);
    const merged = pages.flat().sort((a, b) => {
      const ta = Date.parse(String(a["@timestamp"] ?? a.timestamp ?? 0));
      const tb = Date.parse(String(b["@timestamp"] ?? b.timestamp ?? 0));
      return tb - ta;
    });
    setActions(merged);
    setDrylands(pending);
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await pull();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [pull]);

  const rain = async (d: Dryland) => {
    if (!isLoggedIn || !actor) {
      void addWebAuthWallet();
      return;
    }
    setRaining(d.key);
    setRainMsg((m) => ({ ...m, [d.key]: {} }));
    try {
      const res = await transact([
        payoutAction(d.contract, d.symbol, actor, flexMeta(d.program).payoutSigner),
      ]);
      setRainMsg((m) => ({ ...m, [d.key]: { tx: txIdFromResult(res) || "ok" } }));
      await pull();
    } catch (err) {
      const msg = txErrorMessage(err);
      const hint = hintForError(msg);
      setRainMsg((m) => ({ ...m, [d.key]: { err: hint ? `${msg} - ${hint}` : msg } }));
    } finally {
      setRaining(null);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Reflections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pending pools on-contract, then stored <span className="font-mono">makeitrain</span> history.
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void load()}>
          {busy && drylands == null && actions.length === 0 ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-bold tracking-tight">Drylands</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Unpaid <span className="font-mono">reflection_pool</span> sitting on each launched token.
        </p>
        {drylands == null && busy ? (
          <p className="mt-4 text-sm text-muted-foreground">Reading pools…</p>
        ) : !drylands?.length ? (
          <div className="card mt-4 p-8 text-center text-sm text-muted-foreground">
            No pending reflection pools. After tax accrues, unpaid rain shows here.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {drylands.map((d) => {
              const splash = d.pool * DIST_BPS;
              const splashUsd = d.usd * DIST_BPS;
              const msg = rainMsg[d.key];
              return (
                <article
                  key={d.key}
                  tabIndex={0}
                  aria-label={`Make it rain ${d.symbol}`}
                  className="group card flex min-h-[13.5rem] cursor-pointer flex-col transition-colors hover:border-[#1e3a8a] hover:bg-[#1e3a8a] focus-visible:border-[#1e3a8a] focus-visible:bg-[#1e3a8a] focus-visible:outline-none"
                  onClick={() => void rain(d)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void rain(d);
                    }
                  }}
                >
                  <div className="flex flex-1 flex-col items-center justify-center px-2 pt-3">
                    <span className="font-mono text-xl font-black tracking-tight text-foreground group-hover:text-primary group-focus-visible:text-primary sm:text-2xl">
                      {d.symbol}
                    </span>
                    <span className="mt-1 h-5 text-sm font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      {raining === d.key ? "Signing…" : "Make it rain"}
                    </span>
                  </div>
                  <div className="flex min-h-[4.5rem] flex-col items-center justify-end px-2 pb-3 text-center">
                    <div className="flex flex-col items-center gap-0.5 group-hover:hidden group-focus-visible:hidden">
                      <span className="break-all font-mono text-[11px] leading-tight text-muted-foreground">
                        {fmtPool(d.pool, d.precision)} {d.symbol}
                      </span>
                      <span className="font-mono text-sm font-semibold text-primary">{fmtUsd(d.usd)}</span>
                    </div>
                    <div className="hidden flex-col items-center group-hover:flex group-focus-visible:flex">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-primary/90">
                        splash 38.2%
                      </span>
                      <span className="break-all font-mono text-base font-bold leading-tight text-white">
                        {fmtPool(splash, d.precision)} {d.symbol}
                      </span>
                      <span className="font-mono text-[10px] text-white/70">{fmtUsd(splashUsd)}</span>
                    </div>
                  </div>
                  {msg?.tx ? (
                    <p className="px-2 pb-2 text-center">
                      <TxLink tx={msg.tx} prefix="tx " />
                    </p>
                  ) : null}
                  {msg?.err ? (
                    <p className="px-2 pb-2 text-center text-[10px] font-medium text-red-200">{msg.err}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold tracking-tight">Stored reflections</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-mono">makeitrain</span> on all three programs. Skim first, then the 38.2% splash.
        </p>
        <div className="mt-4 space-y-2">
          {actions.length === 0 && !busy ? (
            <div className="card p-8 text-center text-sm text-muted-foreground">
              No payouts yet. After liftoff, anyone can poke <span className="font-mono">makeitrain</span>.
            </div>
          ) : (
            actions.map((a, i) => {
              const id = a.trx_id ?? "";
              const rows = dataSummary(a.act?.data);
              return (
                <article key={`${id}-${i}`} className="card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{ts(a)}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {a.contract}::{a.actionName}
                    </span>
                    {id ? (
                      <a
                        href={explorerTx(id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link font-mono text-xs"
                      >
                        {id.slice(0, 12)}…
                      </a>
                    ) : null}
                  </div>
                  {rows.length ? (
                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                      {rows.map(([k, v]) => (
                        <div key={k} className="flex items-baseline gap-1.5 text-xs">
                          <dt className="text-muted-foreground">{k}</dt>
                          <dd className="font-mono font-medium">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
