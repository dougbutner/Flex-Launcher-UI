import { useState } from "react";
import { hasAngelChannels, hasInheritance, type FlexProgram } from "@/config/launch";
import { Field, TxLink } from "@/components/launch/ui";
import { validAccount } from "@/services/assets";
import {
  abiSymbol,
  chooserewardAction,
  feeoptoutAction,
  inheritanceAction,
  inheritmemoAction,
  setangelnumAction,
  type ChainAction,
} from "@/services/launchActions";
import { parseProtonSymbol } from "@/services/tokenProton";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

function poolLabel(row: Record<string, unknown>): string {
  const id = Number(pick(row, "id") ?? 0);
  const out = parseProtonSymbol(pick(row, "output_symbol"));
  const contract = String(pick(row, "output_contract") ?? "");
  const sym = out ? `${out.precision},${out.code}` : "?";
  return `#${id} → ${sym} @ ${contract || "?"}`;
}

type Props = {
  program: FlexProgram;
  contract: string;
  symbol: string;
  precision: number;
  actor: string;
  flexer: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  pools: Record<string, unknown>[];
  swapUnderlyingDefault?: boolean;
  quoteSymbol?: string;
  busy: boolean;
  transact: (actions: ChainAction[]) => Promise<unknown>;
  onDone: () => void;
};

export function HolderPrefs({
  program,
  contract,
  symbol,
  precision,
  actor,
  flexer,
  settings,
  pools,
  swapUnderlyingDefault = false,
  quoteSymbol = "",
  busy,
  transact,
  onDone,
}: Props) {
  const angelEnabled = hasAngelChannels(program) && Number(pick(settings, "angel_numbers_bps") ?? 0) > 0;
  const inheritOk = hasInheritance(program);
  const optedOut = Boolean(pick(flexer, "fee_opted_out"));
  const currentAngel = Number(pick(flexer, "angel_number") ?? 1000);
  const currentBene = String(pick(flexer, "beneficiary") ?? "");
  const currentRate = Number(pick(flexer, "bene_rate") ?? 10000);
  const currentMemo = String(pick(flexer, "custom_memo") ?? "");
  const currentPool = Number(pick(flexer, "flex_reward_pool_id") ?? 0);

  const [angel, setAngel] = useState(currentAngel === 1000 ? "0" : String(currentAngel));
  const [rewardKey, setRewardKey] = useState(currentPool ? String(currentPool) : "native");
  const [bene, setBene] = useState(currentBene && currentBene !== actor ? currentBene : "");
  const [ratePct, setRatePct] = useState(String(Math.min(100, Math.max(0, currentRate / 100))));
  const [memo, setMemo] = useState(currentMemo);
  const [msg, setMsg] = useState<{ tx?: string; err?: string }>({});
  const [signing, setSigning] = useState(false);

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

  const disabled = busy || signing;

  return (
    <section className="space-y-5 rounded-xl border border-border/60 bg-background/40 p-4">
      <div>
        <h3 className="text-sm font-bold tracking-tight">Holder prefs</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Reward route, fee opt-out
          {angelEnabled ? ", angel number" : ""}
          {inheritOk ? ", inheritance" : ""}.
        </p>
      </div>

      <Field
        label="Flex reward"
        hint={
          swapUnderlyingDefault
            ? `Empty output_contract = native (pid 0). pid 0 pays ${quoteSymbol || "the launch quote"} because swap_underlying_default was true at startlaunch.`
            : "Empty output_contract = native (pid 0). pid 0 pays the native ticker unless swap_underlying_default was true at startlaunch."
        }
      >
        <div className="flex flex-wrap gap-2">
          <select
            className="input max-w-md"
            value={rewardKey}
            disabled={disabled}
            onChange={(e) => setRewardKey(e.target.value)}
          >
            <option value="native">Native (pid 0)</option>
            {pools.map((p) => {
              const id = String(pick(p, "id") ?? "");
              return (
                <option key={id} value={id}>
                  {poolLabel(p)}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={disabled}
            onClick={() => {
              if (rewardKey === "native") {
                void run(chooserewardAction(contract, actor, symbol, abiSymbol(precision, symbol), ""));
                return;
              }
              const pool = pools.find((p) => String(pick(p, "id")) === rewardKey);
              if (!pool) return;
              const out = parseProtonSymbol(pick(pool, "output_symbol"));
              const outContract = String(pick(pool, "output_contract") ?? "");
              if (!out || !outContract) return;
              void run(
                chooserewardAction(contract, actor, symbol, abiSymbol(out.precision, out.code), outContract)
              );
            }}
          >
            {signing ? "Signing…" : "Save reward"}
          </button>
        </div>
      </Field>

      <Field
        label="Transfer fees"
        hint={optedOut ? "Already opted out - irreversible for self." : "Self can only opt out (ban_status true)."}
      >
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={disabled || optedOut}
          onClick={() => {
            if (!window.confirm(`Opt out of transfer fees on $${symbol}? This cannot be undone by you.`)) return;
            void run(feeoptoutAction(contract, actor, true, symbol));
          }}
        >
          {optedOut ? "Fees opted out" : signing ? "Signing…" : "Opt out of fees"}
        </button>
      </Field>

      {angelEnabled ? (
        <Field label="Angel number" hint="0-999. Required for angel pot draws.">
          <div className="flex flex-wrap gap-2">
            <input
              className="input w-28"
              inputMode="numeric"
              value={angel}
              disabled={disabled}
              onChange={(e) => setAngel(e.target.value.replace(/\D/g, "").slice(0, 3))}
            />
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={disabled || angel === "" || Number(angel) > 999}
              onClick={() => void run(setangelnumAction(contract, actor, symbol, Number(angel)))}
            >
              {signing ? "Signing…" : "Set number"}
            </button>
          </div>
        </Field>
      ) : hasAngelChannels(program) ? (
        <p className="text-xs text-muted-foreground">
          Angel numbers are off until the issuer enables them with setdist / ratios.
        </p>
      ) : null}

      {inheritOk ? (
        <>
          <Field
            label="Inheritance"
            hint="Percent of your splash paid to the beneficiary (0-100). Leave account blank for self."
          >
            <div className="flex flex-wrap gap-2">
              <input
                className="input w-40"
                placeholder="beneficiary"
                value={bene}
                disabled={disabled}
                onChange={(e) => setBene(e.target.value.trim().toLowerCase())}
              />
              <input
                className="input w-24"
                inputMode="decimal"
                placeholder="% to bene"
                value={ratePct}
                disabled={disabled}
                onChange={(e) => setRatePct(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={disabled || (bene !== "" && !validAccount(bene))}
                onClick={() => {
                  const pct = Number(ratePct);
                  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
                    setMsg({ err: "Rate must be 0-100%." });
                    return;
                  }
                  void run(inheritanceAction(contract, actor, bene, Math.round(pct * 100), symbol));
                }}
              >
                {signing ? "Signing…" : "Save inheritance"}
              </button>
            </div>
          </Field>
          <Field label="Inherit memo" hint="Optional · ≤200 chars · @@ = recipient, $$ = amount, ** = symbol">
            <div className="flex flex-wrap gap-2">
              <input
                className="input min-w-[12rem] flex-1"
                value={memo}
                maxLength={200}
                disabled={disabled}
                onChange={(e) => setMemo(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={disabled || memo.length > 200}
                onClick={() => void run(inheritmemoAction(contract, actor, memo, symbol))}
              >
                {signing ? "Signing…" : "Save memo"}
              </button>
            </div>
          </Field>
        </>
      ) : null}

      {msg.tx ? <p><TxLink tx={msg.tx} prefix="tx " /></p> : null}
      {msg.err ? <p className="text-xs text-destructive">{msg.err}</p> : null}
    </section>
  );
}
