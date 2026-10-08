import { useEffect, useState } from "react";
import { hasAngelChannels, hasSetmin, type FlexProgram } from "@/config/launch";
import { Field, TxLink } from "@/components/launch/ui";
import { TaxBucketsForm } from "@/components/launch/TaxBucketsForm";
import { parseAsset, validAccount, validSymbol } from "@/services/assets";
import {
  abiSymbol,
  addLaunchQuotePoolAction,
  addpoolAction,
  ratiosAction,
  setdistAction,
  setfeesAction,
  setminAction,
  type ChainAction,
} from "@/services/launchActions";
import { hasProjectTax, taxAdjustValid, taxFromSettings, taxSavePlan, type TaxDraft } from "@/services/taxRates";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

type Props = {
  program: FlexProgram;
  contract: string;
  symbol: string;
  precision: number;
  actor: string;
  settings: Record<string, unknown> | null;
  launch?: Record<string, unknown> | null;
  pools?: Record<string, unknown>[];
  busy: boolean;
  transact: (actions: ChainAction[]) => Promise<unknown>;
  onDone: () => void;
};

export function IssuerTools({
  program,
  contract,
  symbol,
  precision,
  actor,
  settings,
  launch = null,
  pools = [],
  busy,
  transact,
  onDone,
}: Props) {
  const angelOk = hasAngelChannels(program);
  const setminOk = hasSetmin(program);
  const distLocked = Boolean(pick(settings, "dist_locked"));
  const chainTax = taxFromSettings(program, settings);

  const [tax, setTax] = useState<TaxDraft>(chainTax);
  const [winners, setWinners] = useState(String(Number(pick(settings, "jackpot_winners") ?? 3) || 3));
  const [minHold, setMinHold] = useState(String(Number(pick(settings, "jackpot_min_hold") ?? 0)));
  const [cooldown, setCooldown] = useState(String(Number(pick(settings, "angel_numbers_cooldown") ?? 86400) || 86400));
  const [keeperMin, setKeeperMin] = useState(String(Number(pick(settings, "keeper_min") ?? 0)));
  const [reflectMin, setReflectMin] = useState(String(Number(pick(settings, "reflect_min") ?? 0)));

  const [poolId, setPoolId] = useState("");
  const [outSym, setOutSym] = useState("");
  const [outPrec, setOutPrec] = useState("");
  const [outContract, setOutContract] = useState("");

  const [msg, setMsg] = useState<{ tx?: string; err?: string }>({});
  const [signing, setSigning] = useState(false);
  const disabled = busy || signing;
  const launchPoolId = Number(pick(launch, "pure_liquid_alcor_pool_id") ?? 0);
  const launchQuote = pick(launch, "quote") as { quantity?: string; contract?: string } | undefined;
  const launchQuoteParsed = parseAsset(launchQuote?.quantity ?? "");
  const launchQuoteContract = String(launchQuote?.contract ?? "");
  const launchPairAdded = pools.some((p) => Number(pick(p, "id")) === launchPoolId && launchPoolId > 0);

  const launchQuotePrecision = launchQuoteParsed?.precision;
  const launchQuoteSymbol = launchQuoteParsed?.symbol ?? "";

  useEffect(() => {
    if (!(launchPoolId > 0) || launchQuotePrecision == null || !launchQuoteSymbol || !launchQuoteContract) return;
    setPoolId((prev) => prev || String(launchPoolId));
    setOutSym((prev) => prev || launchQuoteSymbol);
    setOutPrec((prev) => prev || String(launchQuotePrecision));
    setOutContract((prev) => prev || launchQuoteContract);
  }, [launchPoolId, launchQuoteContract, launchQuotePrecision, launchQuoteSymbol]);

  useEffect(() => {
    setTax(taxFromSettings(program, settings));
    setWinners(String(Math.max(0, Math.floor(Number(pick(settings, "jackpot_winners")) || 0))));
    setMinHold(String(Math.max(0, Math.floor(Number(pick(settings, "jackpot_min_hold")) || 0))));
    setCooldown(String(Math.max(0, Math.floor(Number(pick(settings, "angel_numbers_cooldown")) || 0))));
    setKeeperMin(String(Number(pick(settings, "keeper_min") ?? 0)));
    setReflectMin(String(Number(pick(settings, "reflect_min") ?? 0)));
  }, [program, settings]);

  const run = async (actions: ChainAction[]) => {
    setSigning(true);
    setMsg({});
    try {
      const res = await transact(actions);
      setMsg({ tx: txIdFromResult(res) || "ok" });
      onDone();
    } catch (err) {
      const text = txErrorMessage(err);
      const hint = hintForError(text);
      setMsg({ err: hint ? `${text} - ${hint}` : text });
    } finally {
      setSigning(false);
    }
  };

  const plan = taxSavePlan(tax, program, chainTax, actor);
  const saveLabel = plan.fees && plan.channels ? "Save tax and channels" : plan.channels ? "Save reflection channels" : "Save tax";

  return (
    <section className="space-y-5 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div>
        <h3 className="text-sm font-bold tracking-tight">Issuer tools</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Add flex reward pools
          {angelOk ? "; angel / jackpot are a share of the reflection fee (ratios), not a cut of project" : ""}
          {setminOk ? "; set the makeitrain pool floor" : ""}. Transfer tax is setfees. Later calls cannot raise the
          total or lower reflection.
        </p>
      </div>

      <TaxBucketsForm
        program={program}
        value={tax}
        chain={chainTax}
        actor={actor}
        disabled={disabled || !settings}
        onChange={setTax}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={disabled || !settings || Boolean(taxAdjustValid(tax, program, chainTax)) || (!plan.fees && !plan.channels)}
          onClick={() => {
            const err = taxAdjustValid(tax, program, chainTax);
            if (err) {
              setMsg({ err });
              return;
            }
            if (!plan.fees && !plan.channels) return;
            const actions: ChainAction[] = [];
            if (plan.fees) {
              actions.push(
                setfeesAction(
                  contract,
                  precision,
                  symbol,
                  {
                    reflectionRate: tax.reflectionRate,
                    burnRate: tax.burnRate,
                    projectRate: tax.projectRate,
                    projectAccount: tax.projectAccount,
                  },
                  hasProjectTax(program),
                  actor
                )
              );
            }
            if (plan.channels) actions.push(ratiosAction(contract, symbol, tax.angelNumbersBps, tax.jackpotBps));
            void run(actions);
          }}
        >
          {signing ? "Signing…" : saveLabel}
        </button>
      </div>

      {angelOk ? (
        <Field
          label="Distribution ops (setdist)"
          hint={
            distLocked
              ? "Already locked - issuer cannot re-run. Use ratios above for channel bps; contract can still reset ops."
              : "One-shot for issuer. 0 is live: cooldown 0 is no wait, winners 0 pays 1. Saving setdist locks and, with channels on, needs cooldown and winners above 0."
          }
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="input"
              inputMode="numeric"
              placeholder="jackpot winners"
              value={winners}
              disabled={disabled || distLocked}
              onChange={(e) => setWinners(e.target.value.replace(/\D/g, ""))}
            />
            <input
              className="input"
              inputMode="numeric"
              placeholder="jackpot min hold (raw)"
              value={minHold}
              disabled={disabled || distLocked}
              onChange={(e) => setMinHold(e.target.value.replace(/\D/g, ""))}
            />
            <input
              className="input"
              inputMode="numeric"
              placeholder="angel cooldown (sec)"
              value={cooldown}
              disabled={disabled || distLocked}
              onChange={(e) => setCooldown(e.target.value.replace(/\D/g, ""))}
            />
            <input
              className="input"
              inputMode="numeric"
              placeholder="keeper_min (raw)"
              value={keeperMin}
              disabled={disabled || distLocked}
              onChange={(e) => setKeeperMin(e.target.value.replace(/\D/g, ""))}
            />
            <input
              className="input"
              inputMode="numeric"
              placeholder="reflect_min (raw)"
              value={reflectMin}
              disabled={disabled || distLocked}
              onChange={(e) => setReflectMin(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm mt-2"
            disabled={disabled || distLocked}
            onClick={() => {
              const a = tax.angelNumbersBps;
              const j = tax.jackpotBps;
              const w = Number(winners);
              const cool = Number(cooldown);
              if (a + j > 10000) {
                setMsg({ err: "angel + jackpot bps must sum to ≤ 10000." });
                return;
              }
              if (j > 0 && !(w > 0)) {
                setMsg({ err: "jackpot_bps > 0 needs winners > 0." });
                return;
              }
              if (a > 0 && !(cool > 0)) {
                setMsg({ err: "angel_numbers_bps > 0 needs cooldown > 0." });
                return;
              }
              void run([
                setdistAction(contract, symbol, {
                  angelNumbersBps: a,
                  jackpotBps: j,
                  jackpotWinners: w,
                  jackpotMinHold: Number(minHold) || 0,
                  angelNumbersCooldown: cool,
                  keeperMin: Number(keeperMin) || 0,
                  reflectMin: Number(reflectMin) || 0,
                }),
              ]);
            }}
          >
            {distLocked ? "setdist locked" : signing ? "Signing…" : "Lock setdist"}
          </button>
        </Field>
      ) : null}

      {setminOk ? (
        <Field
          label="Reflection floor (setmin)"
          hint="Raw int64. 0 means one whole token. makeitrain refuses until reflection_pool meets this floor."
        >
          <div className="flex flex-wrap gap-2">
            <input
              className="input w-40"
              inputMode="numeric"
              placeholder="reflect_min (raw)"
              value={reflectMin}
              disabled={disabled}
              onChange={(e) => setReflectMin(e.target.value.replace(/\D/g, ""))}
            />
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={disabled}
              onClick={() => void run([setminAction(contract, symbol, Number(reflectMin) || 0)])}
            >
              {signing ? "Signing…" : "Save setmin"}
            </button>
          </div>
        </Field>
      ) : null}

      <Field
        label="Add flex reward pool"
        hint="Alcor pool must pair this token with the output asset and be active. Launch pair uses pure_liquid_alcor_pool_id and the startlaunch quote."
      >
        {launchPoolId > 0 && launchQuoteParsed && validAccount(launchQuoteContract) ? (
          <button
            type="button"
            className="btn btn-outline btn-sm mb-2"
            disabled={disabled}
            onClick={() =>
              void run([
                addLaunchQuotePoolAction(contract, launchPoolId, symbol, {
                  precision: launchQuoteParsed.precision,
                  symbol: launchQuoteParsed.symbol,
                  contract: launchQuoteContract,
                }),
              ])
            }
          >
            {signing
              ? "Signing…"
              : launchPairAdded
                ? `Refresh launch pair #${launchPoolId} → ${launchQuoteParsed.precision},${launchQuoteParsed.symbol} @ ${launchQuoteContract}`
                : `Add launch pair #${launchPoolId} → ${launchQuoteParsed.precision},${launchQuoteParsed.symbol} @ ${launchQuoteContract}`}
          </button>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="input"
            inputMode="numeric"
            placeholder="Alcor pool id"
            value={poolId}
            disabled={disabled}
            onChange={(e) => setPoolId(e.target.value.replace(/\D/g, ""))}
          />
          <input
            className="input"
            placeholder="output contract"
            value={outContract}
            disabled={disabled}
            onChange={(e) => setOutContract(e.target.value.trim().toLowerCase())}
          />
          <input
            className="input"
            placeholder="output symbol"
            value={outSym}
            disabled={disabled}
            onChange={(e) => setOutSym(e.target.value.trim().toUpperCase())}
          />
          <input
            className="input"
            inputMode="numeric"
            placeholder="output precision"
            value={outPrec}
            disabled={disabled}
            onChange={(e) => setOutPrec(e.target.value.replace(/\D/g, "").slice(0, 2))}
          />
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm mt-2"
          disabled={disabled}
          onClick={() => {
            const id = Number(poolId);
            const prec = Number(outPrec);
            if (!(id > 0) || !validSymbol(outSym) || !validAccount(outContract) || !Number.isFinite(prec)) {
              setMsg({ err: "Need pool id, valid output symbol, precision, and contract." });
              return;
            }
            void run([addpoolAction(contract, id, symbol, abiSymbol(prec, outSym), outContract)]);
          }}
        >
          {signing ? "Signing…" : "Add pool"}
        </button>
      </Field>

      {msg.tx ? <p><TxLink tx={msg.tx} prefix="tx " /></p> : null}
      {msg.err ? <p className="text-xs text-destructive">{msg.err}</p> : null}
    </section>
  );
}
