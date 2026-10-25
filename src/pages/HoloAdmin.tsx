import { useEffect, useMemo, useRef, useState } from "react";
import { planFromDraft } from "@/components/launch/draftPlan";
import { ClubTimeField } from "@/components/launch/ClubTimeField";
import { ExecuteStep } from "@/components/launch/ExecuteStep";
import { PctBpsField } from "@/components/launch/PctBpsField";
import { TxLink } from "@/components/launch/ui";
import { Pulse } from "@/components/ui/Pulse";
import { FEE_TIERS, FLEXFOREX_CONTRACT } from "@/config/launch";
import {
  HOLO_FEES,
  HOLO_ISSUER,
  HOLO_TOKENS,
  HOLO_TX_KEYS,
  holoBandFromTicks,
  holoDraft,
  holoFeeTier,
  holoNeedsProof,
  holoReflectionSplit,
  holoSchedule,
  type HoloBand,
  type HoloFees,
  type HoloToken,
} from "@/config/holoLaunch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { useWallet } from "@/hooks/useWallet";
import { parseAsset } from "@/services/assets";
import { readFlexpools, readLaunch, readLaunches, readPresale, readSettings, readStat } from "@/services/flexTables";
import { insidersStepValid, localToUnix } from "@/services/insidersClub";
import { goliveAction } from "@/services/launchActions";
import { formatNiceNumber, fmtUsd } from "@/services/money";
import { symbolCodeOf } from "@/services/preflight";
import { formatBpsPercent, taxCreateValid } from "@/services/taxRates";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";
import { findProofPoolId, fetchAlcorUsdPrice, fetchXtokensByPopularity } from "@/services/xtokenCatalog";

const SAVE_KEY = "holo-admin-v1";

type RowSave = {
  insider?: string;
  launch?: string;
  proofPoolId?: string;
  goliveTx?: string;
  band?: HoloBand;
  txs?: Partial<LaunchDraft>;
};

type Save = {
  fees: HoloFees;
  rows: Record<string, RowSave>;
};

type Mark = { launched: boolean; hasLaunch: boolean };

function clampBps(n: unknown, fallback: number): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(10000, v));
}

function loadSave(): Save {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "") as Partial<Save>;
    const fees = raw.fees ?? HOLO_FEES;
    return {
      fees: {
        holdersBps: clampBps(fees.holdersBps, HOLO_FEES.holdersBps),
        angelBps: clampBps(fees.angelBps, HOLO_FEES.angelBps),
        jackpotBps: clampBps(fees.jackpotBps, HOLO_FEES.jackpotBps),
        burnBps: clampBps(fees.burnBps, HOLO_FEES.burnBps),
        projectBps: clampBps(fees.projectBps, HOLO_FEES.projectBps),
        poolFee: holoFeeTier(Number(fees.poolFee)),
        insiderBps: clampBps(fees.insiderBps, HOLO_FEES.insiderBps),
        lockedInsiderBps: clampBps(fees.lockedInsiderBps, HOLO_FEES.lockedInsiderBps),
        lockDays: Math.max(91, Math.min(4000, Math.floor(Number(fees.lockDays) || HOLO_FEES.lockDays))),
        proofLockDays: Math.max(0, Math.min(87, Math.floor(Number(fees.proofLockDays) ?? HOLO_FEES.proofLockDays))),
      },
      rows: raw.rows && typeof raw.rows === "object" ? raw.rows : {},
    };
  } catch {
    return { fees: HOLO_FEES, rows: {} };
  }
}

function when(local: string): string {
  const unix = localToUnix(local);
  if (!unix) return "";
  return new Date(unix * 1000).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function publicUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).href;
}

async function chainTx(
  token: HoloToken,
  quotePrecision: number
): Promise<{ txs: Partial<LaunchDraft>; launched: boolean; band: HoloBand | null }> {
  const code = FLEXFOREX_CONTRACT;
  const symbol = token.symbol;
  const [stat, settings, launch, presale, pools] = await Promise.all([
    readStat(code, symbol).catch(() => null),
    readSettings(code, symbol).catch(() => null),
    readLaunch(code, symbol).catch(() => null),
    readPresale(code, symbol).catch(() => null),
    readFlexpools(code, symbol).catch(() => [] as Record<string, unknown>[]),
  ]);
  const txs: Partial<LaunchDraft> = {};
  if (stat) txs.createTx = "onchain";
  const rates =
    Number(settings?.reflection_rate ?? 0) + Number(settings?.burn_rate ?? 0) + Number(settings?.project_rate ?? 0);
  if (rates > 0) txs.feesTx = "onchain";
  const supply = parseAsset(String(stat?.supply ?? ""));
  if (supply && Number(supply.amount) > 0) txs.mintTx = "onchain";
  if (launch) txs.startTx = "onchain";
  const poolId = Number(launch?.pure_liquid_alcor_pool_id ?? 0);
  const launched = Boolean(launch?.launched);
  if (poolId > 0) {
    txs.poolId = poolId;
    txs.poolTx = "onchain";
    txs.activateTx = "onchain";
    txs.depositTx = "onchain";
    txs.rangeTx = "onchain";
    txs.lockTx = "onchain";
    txs.liftoffTx = "onchain";
  }
  if (launched || (poolId > 0 && pools.some((p) => Number(p.id) === poolId))) txs.addpoolTx = "onchain";
  if (presale) txs.presaleTx = "onchain";
  const band = launch
    ? holoBandFromTicks({
        symbol,
        quote: { symbol: token.quoteSymbol, contract: token.quoteContract, precision: quotePrecision },
        fee: Number(launch.fee ?? 0),
        tickLower: Number(launch.tick_lower),
        tickUpper: Number(launch.tick_upper),
      })
    : null;
  return { txs, launched, band };
}

function mergeTx(local: Partial<LaunchDraft> | undefined, found: Partial<LaunchDraft>): Partial<LaunchDraft> {
  const txs = { ...local };
  for (const key of HOLO_TX_KEYS) {
    if (key === "poolId") {
      if (!(Number(txs.poolId) > 0) && Number(found.poolId) > 0) txs.poolId = found.poolId;
      continue;
    }
    if (!txs[key] && found[key]) txs[key] = found[key];
  }
  return txs;
}

export default function HoloAdmin() {
  const { actor, isLoggedIn, transact } = useWallet();
  const allowed = actor?.toLowerCase() === HOLO_ISSUER;
  const [save, setSave] = useState<Save>(loadSave);
  const [index, setIndex] = useState(0);
  const [booting, setBooting] = useState(true);
  const [usd, setUsd] = useState<Record<string, number>>({});
  const [prec, setPrec] = useState<Record<string, number>>({});
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [proof, setProof] = useState({ id: "", note: "" });
  const [proofBusy, setProofBusy] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveErr, setLiveErr] = useState("");
  const picked = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const token = HOLO_TOKENS[index] ?? HOLO_TOKENS[0];
  const row = save.rows[token.symbol];
  const schedule = holoSchedule(index);
  const insider = row?.insider || schedule.insider;
  const launch = row?.launch || schedule.launch;
  const quoteUsd = usd[`${token.quoteContract}:${token.quoteSymbol}`] ?? 0;
  const quotePrecision = token.quoteId === "xtoken" ? prec[token.quoteSymbol] || token.quotePrecision : token.quotePrecision;
  const savedProof = row?.proofPoolId ?? "";
  const feesLocked = Boolean(row?.txs?.feesTx);
  const rangeLocked = Boolean(row?.txs?.startTx);
  const lockLocked = Boolean(row?.txs?.lockTx);
  const clubLocked = Boolean(row?.txs?.presaleTx);

  useEffect(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }, [save]);

  useEffect(() => {
    if (!allowed) {
      setBooting(false);
      return;
    }
    let live = true;
    setBooting(true);
    void (async () => {
      const [launchRows, xtRows] = await Promise.all([
        readLaunches(FLEXFOREX_CONTRACT, 400).catch(() => [] as Record<string, unknown>[]),
        fetchXtokensByPopularity().catch(() => []),
      ]);
      const prices = await Promise.all(
        HOLO_TOKENS.map(async (t) => {
          const n = await fetchAlcorUsdPrice(t.quoteContract, t.quoteSymbol).catch(() => 0);
          return [`${t.quoteContract}:${t.quoteSymbol}`, n] as const;
        })
      );
      if (!live) return;
      const nextMarks: Record<string, Mark> = {};
      for (const launchRow of launchRows) {
        const sym = symbolCodeOf(launchRow.token_symbol);
        if (!sym) continue;
        nextMarks[sym] = { launched: Boolean(launchRow.launched), hasLaunch: true };
      }
      const nextPrec: Record<string, number> = {};
      for (const xt of xtRows) nextPrec[xt.symbol] = xt.precision;
      setMarks(nextMarks);
      setPrec(nextPrec);
      setUsd(Object.fromEntries(prices));
      setBooting(false);
    })();
    return () => {
      live = false;
    };
  }, [allowed]);

  const nextIndex = useMemo(() => {
    const launching = HOLO_TOKENS.findIndex((t) => !save.rows[t.symbol]?.txs?.addpoolTx && !marks[t.symbol]?.launched);
    if (launching >= 0) return launching;
    const waiting = HOLO_TOKENS.findIndex((t) => !marks[t.symbol]?.launched && !save.rows[t.symbol]?.goliveTx);
    return waiting >= 0 ? waiting : 0;
  }, [marks, save.rows]);

  useEffect(() => {
    if (picked.current || booting || !allowed) return;
    setIndex(nextIndex);
  }, [allowed, booting, nextIndex]);

  useEffect(() => {
    if (!allowed || booting) return;
    let live = true;
    void chainTx(token, quotePrecision).then((found) => {
      if (!live) return;
      setSave((s) => {
        const prev = s.rows[token.symbol] ?? {};
        const txs = mergeTx(prev.txs, found.txs);
        const goliveTx = prev.goliveTx || (found.launched ? "onchain" : "");
        const band = prev.band ?? found.band ?? undefined;
        const sameTx = HOLO_TX_KEYS.every((key) => txs[key] === prev.txs?.[key]);
        if (sameTx && goliveTx === (prev.goliveTx || "") && band === prev.band) return s;
        return { ...s, rows: { ...s.rows, [token.symbol]: { ...prev, txs, goliveTx, band } } };
      });
    });
    return () => {
      live = false;
    };
  }, [allowed, booting, quotePrecision, token]);

  useEffect(() => {
    if (!holoNeedsProof(token)) {
      setProof({ id: "0", note: "" });
      setProofBusy(false);
      return;
    }
    if (savedProof) {
      setProof({ id: savedProof, note: "" });
      setProofBusy(false);
      return;
    }
    let live = true;
    setProofBusy(true);
    setProof({ id: "", note: "" });
    void findProofPoolId(token.quoteSymbol, token.quoteContract)
      .then((hit) => {
        if (!live) return;
        setProof(hit ? { id: String(hit.poolId), note: hit.against } : { id: "", note: "" });
      })
      .catch(() => {
        if (live) setProof({ id: "", note: "" });
      })
      .finally(() => {
        if (live) setProofBusy(false);
      });
    return () => {
      live = false;
    };
  }, [savedProof, token]);

  const draft = useMemo(() => {
    if (!(quoteUsd > 0) && !row?.band) return null;
    return holoDraft({
      token,
      fees: save.fees,
      insider,
      launch,
      quoteUsd,
      proofPoolId: proof.id,
      quotePrecision,
      txs: row?.txs,
      band: row?.band,
      logoUrl: publicUrl(token.logo),
    });
  }, [insider, launch, proof.id, quotePrecision, quoteUsd, row?.band, row?.txs, save.fees, token]);

  const plan = useMemo(() => (draft ? planFromDraft(draft) : null), [draft]);
  const split = holoReflectionSplit(save.fees);
  const taxErr = taxCreateValid(
    {
      reflectionRate: split.reflectionRate,
      burnRate: save.fees.burnBps,
      projectRate: save.fees.projectBps,
      projectAccount: HOLO_ISSUER,
      angelNumbersBps: split.angelNumbersBps,
      jackpotBps: split.jackpotBps,
    },
    "flexforex"
  );
  const clubErr = draft ? insidersStepValid(draft) : null;
  const lo = plan ? Math.min(plan.quotePerTokenLower, plan.quotePerTokenUpper) : 0;
  const hi = plan ? Math.max(plan.quotePerTokenLower, plan.quotePerTokenUpper) : 0;
  const openAt = localToUnix(launch);
  const publicOpen = openAt > 0 && Math.floor(Date.now() / 1000) >= openAt;

  const patchFees = (p: Partial<HoloFees>) => setSave((s) => ({ ...s, fees: { ...s.fees, ...p } }));
  const patchRow = (p: Partial<RowSave>) =>
    setSave((s) => ({ ...s, rows: { ...s.rows, [token.symbol]: { ...s.rows[token.symbol], ...p } } }));

  const patch = (p: Partial<LaunchDraft>) => {
    setSave((s) => {
      const prev = s.rows[token.symbol] ?? {};
      const txs = { ...prev.txs };
      for (const key of HOLO_TX_KEYS) {
        if (p[key] !== undefined) txs[key] = p[key] as never;
      }
      const band =
        prev.band ??
        (txs.startTx && draft
          ? { priceLower: draft.priceLower, priceUpper: draft.priceUpper, fee: draft.fee }
          : undefined);
      return { ...s, rows: { ...s.rows, [token.symbol]: { ...prev, txs, band } } };
    });
  };

  const choose = (i: number) => {
    picked.current = true;
    setIndex(i);
    setLiveErr("");
  };

  const signLive = async () => {
    setLiveBusy(true);
    setLiveErr("");
    try {
      const result = await transact([goliveAction(FLEXFOREX_CONTRACT, token.symbol)]);
      patchRow({ goliveTx: txIdFromResult(result) || "ok" });
    } catch (err) {
      const msg = txErrorMessage(err);
      const hint = hintForError(msg);
      setLiveErr(hint ? `${msg} - ${hint}` : msg);
    } finally {
      setLiveBusy(false);
    }
  };

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Holo releases</h1>
        <p className="mt-3 text-sm text-muted-foreground">Connect holo.fl3x to release these tokens.</p>
      </div>
    );
  }

  if (booting) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6" aria-busy="true">
        <Pulse className="h-8 w-48" />
        <Pulse className="mt-3 h-4 w-72" />
        <Pulse className="mt-6 h-40 w-full" />
        <div className="mt-4 space-y-2">
          {HOLO_TOKENS.slice(0, 8).map((t) => (
            <Pulse key={t.symbol} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight">Holo releases</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick the next Wednesday or any token. Set the dates, then sign each step. 10,000 tokens. Unpaid holders are paid in the backing token.
      </p>

      <section className="card mt-6 space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Fees</h2>
          <p className="font-mono text-xs text-muted-foreground">
            Reflection {formatBpsPercent(split.reflectionRate)} · holders {formatBpsPercent(save.fees.holdersBps)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Angel numbers and jackpot come out of the reflection fee. Project pays holo.fl3x.
          {feesLocked ? ` Fees for ${token.symbol} are already signed.` : ""}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <PctBpsField
            sentence
            label="Holders"
            hint="Stays with holders."
            bps={save.fees.holdersBps}
            disabled={feesLocked}
            onBps={(holdersBps) => patchFees({ holdersBps })}
          />
          <PctBpsField
            sentence
            label="Angel numbers"
            hint="Comes out of the reflection fee."
            bps={save.fees.angelBps}
            disabled={feesLocked}
            onBps={(angelBps) => patchFees({ angelBps })}
          />
          <PctBpsField
            sentence
            label="Jackpot"
            hint="Comes out of the reflection fee."
            bps={save.fees.jackpotBps}
            disabled={feesLocked}
            onBps={(jackpotBps) => patchFees({ jackpotBps })}
          />
          <PctBpsField
            sentence
            label="Burn"
            bps={save.fees.burnBps}
            disabled={feesLocked}
            onBps={(burnBps) => patchFees({ burnBps })}
          />
          <PctBpsField
            sentence
            label="Project"
            hint="Paid to holo.fl3x."
            bps={save.fees.projectBps}
            disabled={feesLocked}
            onBps={(projectBps) => patchFees({ projectBps })}
          />
        </div>
        {taxErr ? <p className="text-xs font-medium text-destructive">{taxErr}</p> : null}

        <div>
          <p className="text-sm font-semibold">Pool fee</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {FEE_TIERS.map((tier) => {
              const shown = row?.band?.fee ?? save.fees.poolFee;
              return (
                <button
                  key={tier.fee}
                  type="button"
                  disabled={Boolean(row?.band)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    shown === tier.fee ? "border-primary bg-primary/10 text-primary" : "border-border"
                  }`}
                  onClick={() => patchFees({ poolFee: tier.fee })}
                >
                  {tier.label}
                </button>
              );
            })}
          </div>
          {row?.band ? (
            <p className="text-xs text-muted-foreground">Pool fee for this token is already set.</p>
          ) : null}
        </div>

        <label className="block text-sm">
          <span className="font-semibold">Liquidity lock (days)</span>
          <input
            className="input mt-1 font-mono"
            inputMode="numeric"
            disabled={lockLocked}
            value={save.fees.lockDays}
            onChange={(e) => patchFees({ lockDays: Math.max(91, Math.floor(Number(e.target.value) || 0)) })}
          />
        </label>
      </section>

      <div ref={listRef} className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Order</h2>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => choose(nextIndex)}>
          Next in line
        </button>
      </div>
      <ol className="mt-2 space-y-1">
        {HOLO_TOKENS.map((t, i) => {
          const times = holoSchedule(i);
          const chosen = i === index;
          const mark = marks[t.symbol];
          const saved = save.rows[t.symbol];
          const state = mark?.launched || saved?.goliveTx ? "Live" : saved?.txs?.addpoolTx ? "Public sale" : mark?.hasLaunch || saved?.txs?.createTx ? "In progress" : "";
          return (
            <li key={t.symbol}>
              <button
                type="button"
                onClick={() => choose(i)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left ${
                  chosen ? "border-primary bg-primary/10" : "border-border bg-background/40"
                }`}
              >
                <span className="w-6 font-mono text-xs text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{t.symbol}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {when(saved?.insider || times.insider)} · {t.quoteSymbol}
                    {i === nextIndex ? " · next" : ""}
                  </span>
                </span>
                {state ? <span className="text-xs text-muted-foreground">{state}</span> : null}
              </button>
            </li>
          );
        })}
      </ol>

      <section className="card mt-6 space-y-4 p-4 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold">{token.symbol}</h2>
          <p className="text-xs text-muted-foreground">
            {token.quoteSymbol} · {quotePrecision} decimals
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ClubTimeField
            label="Insider buys start"
            hint="Approved accounts can buy."
            value={insider}
            disabled={clubLocked}
            onChange={(presaleInsiderTime) => patchRow({ insider: presaleInsiderTime })}
          />
          <ClubTimeField
            label="Public sale"
            hint="Thirty days later unless you change it. Must be after insider buys start."
            value={launch}
            disabled={clubLocked}
            onChange={(presaleLaunchTime) => patchRow({ launch: presaleLaunchTime })}
          />
          <PctBpsField
            sentence
            emptyZero
            label="Insider max"
            hint="Most of the supply one account can hold."
            bps={save.fees.insiderBps}
            disabled={clubLocked}
            onBps={(insiderBps) => patchFees({ insiderBps })}
          />
          <PctBpsField
            sentence
            emptyZero
            label="Locked position cap"
            hint="Higher cap after they prove a locked position."
            bps={save.fees.lockedInsiderBps}
            disabled={clubLocked}
            onBps={(lockedInsiderBps) => patchFees({ lockedInsiderBps })}
          />
        </div>
        <label className="block text-sm">
          <span className="font-semibold">Days the lock must still have</span>
          <span className="mt-1 block text-xs text-muted-foreground">87 is the longest this sale allows.</span>
          <input
            className="input mt-1 font-mono"
            inputMode="numeric"
            disabled={clubLocked}
            value={save.fees.proofLockDays || ""}
            onChange={(e) =>
              patchFees({ proofLockDays: Math.max(0, Math.min(87, Math.floor(Number(e.target.value) || 0))) })
            }
          />
        </label>
        {clubErr ? <p className="text-xs font-medium text-warning">{clubErr}</p> : null}

        {quoteUsd > 0 && plan ? (
          <p className="text-sm">
            {formatNiceNumber(lo)} {token.quoteSymbol} ({fmtUsd(lo * quoteUsd)}) to {formatNiceNumber(hi)} {token.quoteSymbol} ({fmtUsd(hi * quoteUsd)})
          </p>
        ) : (
          <p className="text-sm text-warning">Waiting on the {token.quoteSymbol} price.</p>
        )}

        {holoNeedsProof(token) ? (
          <label className="block text-sm">
            <span className="font-semibold">Pool pairing {token.quoteSymbol}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {proofBusy ? "Looking up the live pool." : proof.note ? `Paired with ${proof.note}.` : "Paste the pool id if none is filled in."}
            </span>
            <input
              className="input mt-1 font-mono"
              inputMode="numeric"
              disabled={rangeLocked}
              value={proof.id}
              onChange={(e) => {
                const id = e.target.value.replace(/\D/g, "");
                setProof({ id, note: proof.note });
                patchRow({ proofPoolId: id });
              }}
            />
          </label>
        ) : null}
      </section>

      {draft && plan ? (
        <div className="mt-6">
          <ExecuteStep
            draft={draft}
            patch={patch}
            onBack={() => listRef.current?.scrollIntoView({ behavior: "smooth" })}
            onDone={() => undefined}
            onReset={() => choose(Math.min(HOLO_TOKENS.length - 1, index + 1))}
          />
        </div>
      ) : null}

      {draft?.liftoffTx ? (
        <section className="card mt-4 space-y-3 p-4 sm:p-6">
          <h2 className="text-sm font-semibold">Public sale</h2>
          {row?.goliveTx ? (
            <p className="flex items-center gap-2 text-sm">
              Open <TxLink tx={row.goliveTx} />
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {publicOpen
                  ? "Anyone can transfer after you sign."
                  : `Opens ${when(launch)}. The button stays off until then.`}
              </p>
              {liveErr ? <p className="text-xs font-medium text-destructive">{liveErr}</p> : null}
              <button
                type="button"
                className="btn btn-accent"
                disabled={!isLoggedIn || !publicOpen || !draft.addpoolTx || liveBusy}
                onClick={() => void signLive()}
              >
                {liveBusy ? "Signing…" : "Open public sale"}
              </button>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
