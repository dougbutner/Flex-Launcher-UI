import { useState } from "react";
import { hasAngelChannels, hasSetmin, type FlexProgram } from "@/config/launch";
import { Field } from "@/components/launch/ui";
import { validAccount, validSymbol } from "@/services/assets";
import {
  abiSymbol,
  addpoolAction,
  ratiosAction,
  setdistAction,
  setminAction,
  type ChainAction,
} from "@/services/launchActions";
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
  const distLocked = Boolean(pick(settings, "dist_locked"));
  const curAngel = Number(pick(settings, "angel_numbers_bps") ?? 0);
  const curJack = Number(pick(settings, "jackpot_bps") ?? 0);

  const [angelBps, setAngelBps] = useState(String(curAngel || 1000));
  const [jackBps, setJackBps] = useState(String(curJack || 1000));
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

  const run = async (action: ChainAction) => {
    setSigning(true);
    setMsg({});
    try {
      const res = await transact([action]);
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

  return (
    <section className="space-y-5 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div>
        <h3 className="text-sm font-bold tracking-tight">Issuer tools</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Add flex reward pools
          {angelOk ? "; configure angel / jackpot channels" : ""}
          {setminOk ? "; set the makeitrain pool floor" : ""}. Tax rates stay contract-only (`setconfig`).
        </p>
      </div>

      {angelOk ? (
        <>
          <Field
            label="Channel ratios"
            hint="Share of reflection_rate cut into angel / jackpot pots on transfer (bps). Sum ≤ 10000."
          >
            <div className="flex flex-wrap gap-2">
              <input
                className="input w-28"
                inputMode="numeric"
                placeholder="angel bps"
                value={angelBps}
                disabled={disabled}
                onChange={(e) => setAngelBps(e.target.value.replace(/\D/g, ""))}
              />
              <input
                className="input w-28"
                inputMode="numeric"
                placeholder="jackpot bps"
                value={jackBps}
                disabled={disabled}
                onChange={(e) => setJackBps(e.target.value.replace(/\D/g, ""))}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={disabled}
                onClick={() => {
                  const a = Number(angelBps);
                  const j = Number(jackBps);
                  if (!Number.isFinite(a) || !Number.isFinite(j) || a + j > 10000) {
                    setMsg({ err: "angel + jackpot bps must sum to ≤ 10000." });
                    return;
                  }
                  void run(ratiosAction(contract, symbol, a, j));
                }}
              >
                {signing ? "Signing…" : "Save ratios"}
              </button>
            </div>
          </Field>

          <Field
            label="Distribution ops (setdist)"
            hint={
              distLocked
                ? "Already locked - issuer cannot re-run. Use ratios for channel bps; contract can still reset ops."
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
              className="btn btn-primary btn-sm mt-2"
              disabled={disabled || distLocked}
              onClick={() => {
                const a = Number(angelBps);
                const j = Number(jackBps);
                const w = Number(winners);
                const cool = Number(cooldown);
                if (!Number.isFinite(a) || !Number.isFinite(j) || a + j > 10000) {
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
                void run(
                  setdistAction(contract, symbol, {
                    angelNumbersBps: a,
                    jackpotBps: j,
                    jackpotWinners: w,
                    jackpotMinHold: Number(minHold) || 0,
                    angelNumbersCooldown: cool,
                    keeperMin: Number(keeperMin) || 0,
                    reflectMin: Number(reflectMin) || 0,
                  })
                );
              }}
            >
              {distLocked ? "setdist locked" : signing ? "Signing…" : "Lock setdist"}
            </button>
          </Field>
        </>
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
              onClick={() => void run(setminAction(contract, symbol, Number(reflectMin) || 0))}
            >
              {signing ? "Signing…" : "Save setmin"}
            </button>
          </div>
        </Field>
      ) : null}

      <Field
        label="Add flex reward pool"
        hint="Alcor pool must pair this token with the output asset and be active."
      >
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
            void run(addpoolAction(contract, id, symbol, abiSymbol(prec, outSym), outContract));
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
