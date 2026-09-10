import { useEffect, useState } from "react";
import { hasAngelChannels, hasSetmin, type FlexProgram } from "@/config/launch";
import { Field } from "@/components/launch/ui";
import { TaxBucketsForm } from "@/components/launch/TaxBucketsForm";
import { validAccount, validSymbol } from "@/services/assets";
import {
  abiSymbol,
  addpoolAction,
  ratiosAction,
  setdistAction,
  setfeesAction,
  setminAction,
  type ChainAction,
} from "@/services/launchActions";
import {
  hasProjectTax,
  taxFromSettings,
  taxSetfeesValid,
  taxSum,
  type TaxDraft,
} from "@/services/taxRates";
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
  settings: Record<string, unknown> | null;
  busy: boolean;
  transact: (actions: ChainAction[]) => Promise<unknown>;
  onDone: () => void;
};

export function IssuerTools({ program, contract, symbol, settings, busy, transact, onDone }: Props) {
  const angelOk = hasAngelChannels(program);
  const setminOk = hasSetmin(program);
  const projectOk = hasProjectTax(program);
  const distLocked = Boolean(pick(settings, "dist_locked"));
  const chainTax = taxFromSettings(program, settings);
  const lockedTotal = taxSum(chainTax, program);

  const [tax, setTax] = useState<TaxDraft>(chainTax);
  const [winners, setWinners] = useState(String(Number(pick(settings, "jackpot_winners") ?? 3) || 3));
  const [minHold, setMinHold] = useState(String(Number(pick(settings, "jackpot_min_hold") ?? 0)));
  const [cooldown, setCooldown] = useState(String(Number(pick(settings, "angel_numbers_cooldown") ?? 86400) || 86400));
  const [keeperMin, setKeeperMin] = useState(String(Number(pick(settings, "keeper_min") ?? 0)));
  const [reflectMin, setReflectMin] = useState(String(Number(pick(settings, "reflect_min") ?? 0)));

  const [poolId, setPoolId] = useState("");
  const [outSym, setOutSym] = useState("");
  const [outPrec, setOutPrec] = useState("4");
  const [outContract, setOutContract] = useState("");

  const [msg, setMsg] = useState<{ tx?: string; err?: string }>({});
  const [signing, setSigning] = useState(false);
  const disabled = busy || signing;

  useEffect(() => {
    setTax(taxFromSettings(program, settings));
    setWinners(String(Number(pick(settings, "jackpot_winners") ?? 3) || 3));
    setMinHold(String(Number(pick(settings, "jackpot_min_hold") ?? 0)));
    setCooldown(String(Number(pick(settings, "angel_numbers_cooldown") ?? 86400) || 86400));
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

  const feesErr = taxSetfeesValid(tax, program, lockedTotal);
  const channelsChanged =
    angelOk && (tax.angelNumbersBps !== chainTax.angelNumbersBps || tax.jackpotBps !== chainTax.jackpotBps);
  const feesChanged =
    tax.reflectionRate !== chainTax.reflectionRate ||
    tax.burnRate !== chainTax.burnRate ||
    (projectOk &&
      (tax.projectRate !== chainTax.projectRate ||
        tax.projectAccount.trim().toLowerCase() !== chainTax.projectAccount.trim().toLowerCase()));

  return (
    <section className="space-y-5 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div>
        <h3 className="text-sm font-bold tracking-tight">Issuer tools</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Reallocate the locked transfer tax, add flex reward pools
          {angelOk ? "; configure angel / jackpot channels" : ""}
          {setminOk ? "; set the makeitrain pool floor" : ""}.
        </p>
      </div>

      <TaxBucketsForm
        program={program}
        value={tax}
        lockedTotal={lockedTotal}
        disabled={disabled || !settings}
        onChange={setTax}
      />
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={disabled || !settings || Boolean(feesErr) || (!feesChanged && !channelsChanged)}
        onClick={() => {
          if (feesErr) {
            setMsg({ err: feesErr });
            return;
          }
          if (angelOk && tax.angelNumbersBps + tax.jackpotBps > 10000) {
            setMsg({ err: "angel + jackpot bps must sum to ≤ 10000." });
            return;
          }
          const actions: ChainAction[] = [];
          if (feesChanged) {
            actions.push(
              setfeesAction(
                contract,
                symbol,
                {
                  reflectionRate: tax.reflectionRate,
                  burnRate: tax.burnRate,
                  projectRate: tax.projectRate,
                  projectAccount: tax.projectAccount,
                },
                projectOk
              )
            );
          }
          if (channelsChanged) {
            actions.push(ratiosAction(contract, symbol, tax.angelNumbersBps, tax.jackpotBps));
          }
          if (!actions.length) {
            setMsg({ err: "No fee changes to sign." });
            return;
          }
          void run(actions);
        }}
      >
        {signing ? "Signing…" : "Save tax buckets"}
      </button>
      {feesErr ? <p className="text-xs text-destructive">{feesErr}</p> : null}

      {angelOk ? (
        <Field
          label="Distribution ops (setdist)"
          hint={
            distLocked
              ? "Already locked - issuer cannot re-run. Use ratios above for channel bps; contract can still reset ops."
              : "One-shot for issuer: channel bps + winners, cooldown, keeper/reflect mins. Locks after success."
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

      <Field label="Add flex reward pool" hint="Alcor pool must pair this token with the output asset and be active.">
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

      {msg.tx ? <p className="font-mono text-xs text-success">tx {msg.tx.slice(0, 12)}…</p> : null}
      {msg.err ? <p className="text-xs text-destructive">{msg.err}</p> : null}
    </section>
  );
}
