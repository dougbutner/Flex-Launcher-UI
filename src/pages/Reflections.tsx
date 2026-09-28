import { useCallback, useEffect, useState } from "react";
import { Amount, DecimalText } from "@/components/Amount";
import { TokenIcon } from "@/components/TokenIcon";
import { RainSkeleton } from "@/components/ui/PageSkeletons";
import { TxLink } from "@/components/launch/ui";
import { flexMeta } from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { loadDrylands, type Dryland } from "@/services/rainBoard";
import { storedPayoutAction } from "@/services/rainDefaults";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

const DIST_BPS = 0.382;

function fmtPool(n: number, precision: number): string {
  const digits = n >= 1000 ? Math.min(2, precision) : precision;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export default function Reflections() {
  const { actor, isLoggedIn, addWebAuthWallet, transact } = useWallet();
  const [drylands, setDrylands] = useState<Dryland[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [raining, setRaining] = useState<string | null>(null);
  const [rainMsg, setRainMsg] = useState<Record<string, { tx?: string; err?: string }>>({});

  const load = useCallback(async (force = false) => {
    setBusy(true);
    setError("");
    try {
      setDrylands(await loadDrylands({ force }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const rain = async (d: Dryland) => {
    if (d.poolRaw < d.floorRaw) return;
    if (!isLoggedIn || !actor) {
      void addWebAuthWallet();
      return;
    }
    setRaining(d.key);
    setRainMsg((m) => ({ ...m, [d.key]: {} }));
    try {
      const action = d.rainAction
        ? { account: d.contract, name: d.rainAction, data: {} }
        : await storedPayoutAction(d.contract, d.symbol, actor, flexMeta(d.program ?? "easyflex").payoutSigner);
      const res = await transact([action]);
      setRainMsg((m) => ({ ...m, [d.key]: { tx: txIdFromResult(res) || "ok" } }));
      await load();
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
          <h1 className="text-3xl font-black tracking-tight">The rain dance that always hits.</h1>
        </div>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void load(true)}>
          {busy && drylands == null ? "Loading…" : "Refresh"}
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
          <RainSkeleton />
        ) : !drylands?.length ? (
          <div className="card mt-4 p-8 text-center text-sm text-muted-foreground">
            No pending reflection pools. After tax accrues, unpaid rain shows here.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {drylands.map((d) => {
              const below = d.poolRaw < d.floorRaw;
              const splash = d.pool * DIST_BPS;
              const splashUsd = d.usd * DIST_BPS;
              const msg = rainMsg[d.key];
              return (
                <article
                  key={d.key}
                  role="button"
                  tabIndex={below ? -1 : 0}
                  aria-disabled={below}
                  aria-label={below ? `${d.symbol} below rain threshold` : `Make it rain ${d.symbol}`}
                  className={
                    below
                      ? "card flex min-h-[13.5rem] cursor-not-allowed flex-col opacity-40 grayscale"
                      : "group card flex min-h-[13.5rem] cursor-pointer flex-col transition-colors hover:border-[#1e3a8a] hover:bg-[#1e3a8a] focus:border-[#1e3a8a] focus:bg-[#1e3a8a] focus:outline-none"
                  }
                  onClick={() => {
                    if (!below) void rain(d);
                  }}
                  onKeyDown={(e) => {
                    if (below) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void rain(d);
                    }
                  }}
                >
                  <div className="flex flex-1 flex-col items-center justify-center px-2 pt-3">
                    <TokenIcon contract={d.contract} symbol={d.symbol} size={36} />
                    <span className="mt-2 font-mono text-xl font-black tracking-tight text-foreground group-hover:text-primary group-focus:text-primary sm:text-2xl">
                      {d.symbol}
                    </span>
                    <span className="mt-1 h-5 text-sm font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                      {below ? "" : raining === d.key ? "Signing…" : "Make it rain"}
                    </span>
                  </div>
                  <div className="relative min-h-[4.75rem] px-2 pb-3 text-center">
                    <div className="flex flex-col items-center gap-0.5 transition-opacity group-hover:opacity-0 group-focus:opacity-0">
                      <span className="break-all font-mono text-[11px] leading-tight text-muted-foreground">
                        <DecimalText text={fmtPool(d.pool, d.precision)} /> {d.symbol}
                      </span>
                      <span className="font-mono text-sm font-semibold text-primary">
                        <Amount value={d.usd} kind="usd" />
                      </span>
                      {below ? (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          below min
                        </span>
                      ) : null}
                    </div>
                    {below ? null : (
                      <div className="pointer-events-none absolute inset-x-2 bottom-3 flex flex-col items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-primary">
                          splash 38.2%
                        </span>
                        <span className="break-all font-mono text-base font-bold leading-tight text-white">
                          <DecimalText text={fmtPool(splash, d.precision)} /> {d.symbol}
                        </span>
                        <span className="font-mono text-[10px] text-white/70">
                          <Amount value={splashUsd} kind="usd" />
                        </span>
                      </div>
                    )}
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
    </div>
  );
}
