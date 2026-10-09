import { useCallback, useEffect, useState } from "react";
import { Amount, DecimalText } from "@/components/Amount";
import { TokenIcon } from "@/components/TokenIcon";
import { RainSkeleton } from "@/components/ui/PageSkeletons";
import { TxLink } from "@/components/launch/ui";
import { flexMeta, splashShare } from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { pullangelAction, pulljackpotAction } from "@/services/launchActions";
import { loadDrylands, type Dryland } from "@/services/rainBoard";
import { storedPayoutAction } from "@/services/rainDefaults";
import { rainCash, whenWalletClosed } from "@/components/rain/moneyRain";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

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

  const rain = async (d: Dryland, from: HTMLElement, kind: "rain" | "angel" | "jackpot" = "rain") => {
    if (kind === "rain" && d.poolRaw < d.floorRaw) return;
    if (kind === "angel" && !(d.angel > 0)) return;
    if (kind === "jackpot" && !(d.jackpot > 0)) return;
    if (!isLoggedIn || !actor) {
      void addWebAuthWallet();
      return;
    }
    const box = from.getBoundingClientRect();
    const origin = { x: box.left + box.width / 2, y: box.top };
    const usd = kind === "angel" ? d.px * d.angel : kind === "jackpot" ? d.px * d.jackpot : d.usd * splashShare(d.contract, d.symbol);
    const id = `${kind}:${d.key}`;
    setRaining(id);
    setRainMsg((m) => ({ ...m, [id]: {} }));
    try {
      const action =
        kind === "angel"
          ? pullangelAction(d.contract, d.symbol)
          : kind === "jackpot"
            ? pulljackpotAction(d.contract, d.symbol)
            : d.rainAction
              ? { account: d.contract, name: d.rainAction, data: {} }
              : await storedPayoutAction(d.contract, d.symbol, actor, flexMeta(d.program ?? "easyflex").payoutSigner);
      const res = await transact([action]);
      setRainMsg((m) => ({ ...m, [id]: { tx: txIdFromResult(res) || "ok" } }));
      await whenWalletClosed();
      rainCash(usd, origin);
      await load();
    } catch (err) {
      const msg = txErrorMessage(err);
      const hint = hintForError(msg);
      setRainMsg((m) => ({ ...m, [id]: { err: hint ? `${msg} - ${hint}` : msg } }));
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
        ) : !drylands?.some((d) => d.pool > 0 || d.program == null || d.rainAction) ? (
          <div className="card mt-4 p-8 text-center text-sm text-muted-foreground">
            No pending reflection pools. After tax accrues, unpaid rain shows here.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {drylands
              .filter((d) => d.pool > 0 || d.program == null || d.rainAction)
              .map((d) => {
              const below = d.poolRaw < d.floorRaw;
              const share = splashShare(d.contract, d.symbol);
              const splash = d.pool * share;
              const splashUsd = d.usd * share;
              const id = `rain:${d.key}`;
              const msg = rainMsg[id];
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
                  onClick={(e) => {
                    if (below) return;
                    void rain(d, e.currentTarget);
                  }}
                  onKeyDown={(e) => {
                    if (below) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void rain(d, e.currentTarget);
                    }
                  }}
                >
                  <div className="flex flex-1 flex-col items-center justify-center px-2 pt-3">
                    <TokenIcon contract={d.contract} symbol={d.symbol} size={36} />
                    <span className="mt-2 font-mono text-xl font-black tracking-tight text-foreground group-hover:text-primary group-focus:text-primary sm:text-2xl">
                      {d.symbol}
                    </span>
                    <span className="mt-1 h-5 text-sm font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                      {below ? "" : raining === id ? "Signing…" : "Make it rain"}
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
                          splash {(share * 100).toFixed(1)}%
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

      {drylands == null ? null : (
        <>
          <PotSection
            title="Angels"
            empty="No angel pots waiting."
            label="Call angels"
            tone="white"
            rows={drylands.filter((d) => d.angel > 0)}
            raining={raining}
            rainMsg={rainMsg}
            onCall={(d, from) => void rain(d, from, "angel")}
          />
          <PotSection
            title="Jackpot"
            empty="No jackpot pots waiting."
            label="Call jackpot"
            tone="gold"
            rows={drylands.filter((d) => d.jackpot > 0)}
            raining={raining}
            rainMsg={rainMsg}
            onCall={(d, from) => void rain(d, from, "jackpot")}
          />
        </>
      )}
    </div>
  );
}

function PotSection({
  title,
  empty,
  label,
  tone,
  rows,
  raining,
  rainMsg,
  onCall,
}: {
  title: string;
  empty: string;
  label: string;
  tone: "white" | "gold";
  rows: Dryland[];
  raining: string | null;
  rainMsg: Record<string, { tx?: string; err?: string }>;
  onCall: (d: Dryland, from: HTMLElement) => void;
}) {
  const kind = tone === "white" ? "angel" : "jackpot";
  const hot =
    tone === "white"
      ? "hover:border-white hover:bg-white focus:border-white focus:bg-white"
      : "hover:border-[#d4af37] hover:bg-[#d4af37] focus:border-[#d4af37] focus:bg-[#d4af37]";
  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {kind === "angel" ? (
          <>
            Unpaid <span className="font-mono">angel_numbers_pool</span>. Anyone can call{" "}
            <span className="font-mono">pullangel</span>.
          </>
        ) : (
          <>
            Unpaid <span className="font-mono">jackpot_pool</span>. Anyone can call{" "}
            <span className="font-mono">pulljackpot</span>.
          </>
        )}
      </p>
      {!rows.length ? (
        <div className="card mt-4 p-8 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {rows.map((d) => {
            const amount = kind === "angel" ? d.angel : d.jackpot;
            const usd = d.px * amount;
            const id = `${kind}:${d.key}`;
            const msg = rainMsg[id];
            return (
              <article
                key={d.key}
                role="button"
                tabIndex={0}
                aria-label={`${label} ${d.symbol}`}
                className={`group card flex min-h-[13.5rem] cursor-pointer flex-col transition-colors focus:outline-none ${hot}`}
                onClick={(e) => onCall(d, e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onCall(d, e.currentTarget);
                  }
                }}
              >
                <div className="flex flex-1 flex-col items-center justify-center px-2 pt-3">
                  <TokenIcon contract={d.contract} symbol={d.symbol} size={36} />
                  <span className="mt-2 font-mono text-xl font-black tracking-tight text-foreground group-hover:text-neutral-950 group-focus:text-neutral-950 sm:text-2xl">
                    {d.symbol}
                  </span>
                  <span className="mt-1 h-5 text-sm font-semibold text-primary opacity-0 transition-opacity group-hover:text-neutral-950 group-hover:opacity-100 group-focus:text-neutral-950 group-focus:opacity-100">
                    {raining === id ? "Signing…" : label}
                  </span>
                </div>
                <div className="px-2 pb-3 text-center">
                  <span className="break-all font-mono text-[11px] leading-tight text-muted-foreground group-hover:text-neutral-800 group-focus:text-neutral-800">
                    <DecimalText text={fmtPool(amount, d.precision)} /> {d.symbol}
                  </span>
                  <span className="mt-0.5 block font-mono text-sm font-semibold text-primary group-hover:text-neutral-950 group-focus:text-neutral-950">
                    <Amount value={usd} kind="usd" />
                  </span>
                </div>
                {msg?.tx ? (
                  <p className="px-2 pb-2 text-center">
                    <TxLink tx={msg.tx} prefix="tx " />
                  </p>
                ) : null}
                {msg?.err ? (
                  <p className="px-2 pb-2 text-center text-[10px] font-medium text-red-200 group-hover:text-red-700 group-focus:text-red-700">
                    {msg.err}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
