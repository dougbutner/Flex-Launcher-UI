import { useState } from "react";
import { hasAngelChannels, hasInheritance, type FlexProgram } from "@/config/launch";
import { TxLink } from "@/components/launch/ui";
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
import { percentInputToBps, sanitizePercentInput } from "@/services/taxRates";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

function poolLabel(row: Record<string, unknown>): string {
  const out = parseProtonSymbol(pick(row, "output_symbol"));
  const contract = String(pick(row, "output_contract") ?? "");
  const code = out?.code || "?";
  return contract ? `${code}@${contract}` : code;
}

type Slot = "flex" | "optout" | "angel" | "heir" | "memo";

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

  const [open, setOpen] = useState<Slot | null>(null);
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
      setOpen(null);
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

  const sendFlex = () => {
    if (rewardKey === "native") {
      void run(chooserewardAction(contract, actor, symbol, abiSymbol(precision, symbol), ""));
      return;
    }
    const pool = pools.find((p) => String(pick(p, "id")) === rewardKey);
    if (!pool) return;
    const out = parseProtonSymbol(pick(pool, "output_symbol"));
    const outContract = String(pick(pool, "output_contract") ?? "");
    if (!out || !outContract) return;
    void run(chooserewardAction(contract, actor, symbol, abiSymbol(out.precision, out.code), outContract));
  };

  const sendHeir = () => {
    const bps = percentInputToBps(ratePct);
    if (ratePct !== "" && (bps < 0 || bps > 10000 || Number(sanitizePercentInput(ratePct)) > 100)) {
      setMsg({ err: "Rate must be 0-100%." });
      return;
    }
    if (bene !== "" && !validAccount(bene)) {
      setMsg({ err: "Heir must be a valid account." });
      return;
    }
    void run(inheritanceAction(contract, actor, bene, bps, symbol));
  };

  const chip = (slot: Slot, label: string, extraDisabled = false) => (
    <button
      type="button"
      className={`btn btn-sm ${open === slot ? "btn-primary" : "btn-outline"}`}
      disabled={disabled || extraDisabled}
      onClick={() => {
        setMsg({});
        setOpen((cur) => (cur === slot ? null : slot));
      }}
    >
      {label}
    </button>
  );

  const sendBtn = (onSend: () => void, extraDisabled = false) => (
    <button type="button" className="btn btn-primary btn-sm" disabled={disabled || extraDisabled} onClick={onSend}>
      {signing ? "Signing…" : "Send"}
    </button>
  );

  return (
    <section className="border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {open === "flex" ? (
          <>
            <select
              className="input h-9 max-w-md py-0 text-sm"
              value={rewardKey}
              disabled={disabled}
              onChange={(e) => setRewardKey(e.target.value)}
            >
              <option value="native">Native rain</option>
              {pools.map((p) => {
                const id = String(pick(p, "id") ?? "");
                return (
                  <option key={id} value={id}>
                    {poolLabel(p)}
                  </option>
                );
              })}
            </select>
            {sendBtn(sendFlex)}
          </>
        ) : (
          chip("flex", "Flex")
        )}

        {open === "optout" ? (
          <>
            <span className="text-xs text-muted-foreground">Avoid tax. Forfeit rain forever.</span>
            {sendBtn(() => void run(feeoptoutAction(contract, actor, true, symbol)), optedOut)}
          </>
        ) : (
          chip("optout", optedOut ? "Opted out" : "Opt out", optedOut)
        )}

        {angelEnabled ? (
          open === "angel" ? (
            <>
              <input
                className="input h-9 w-24 py-0"
                inputMode="numeric"
                placeholder="0-999"
                value={angel}
                disabled={disabled}
                onChange={(e) => setAngel(e.target.value.replace(/\D/g, "").slice(0, 3))}
              />
              {sendBtn(() => void run(setangelnumAction(contract, actor, symbol, Number(angel))), angel === "" || Number(angel) > 999)}
            </>
          ) : (
            chip("angel", "Angel")
          )
        ) : null}

        {inheritOk ? (
          open === "heir" ? (
            <>
              <input
                className="input h-9 w-40 py-0"
                placeholder="heir account"
                value={bene}
                disabled={disabled}
                onChange={(e) => setBene(e.target.value.trim().toLowerCase())}
              />
              <input
                className="input h-9 w-20 py-0"
                inputMode="decimal"
                placeholder="%"
                value={ratePct}
                disabled={disabled}
                onChange={(e) => setRatePct(sanitizePercentInput(e.target.value))}
              />
              {sendBtn(sendHeir)}
            </>
          ) : (
            chip("heir", "Heir")
          )
        ) : null}

        {inheritOk ? (
          open === "memo" ? (
            <>
              <input
                className="input h-9 min-w-[10rem] flex-1 py-0"
                placeholder="memo"
                value={memo}
                maxLength={200}
                disabled={disabled}
                onChange={(e) => setMemo(e.target.value)}
              />
              {sendBtn(() => void run(inheritmemoAction(contract, actor, memo, symbol)), memo.length > 200)}
            </>
          ) : (
            chip("memo", "Memo")
          )
        ) : null}
      </div>
      {msg.tx ? (
        <p className="mt-2">
          <TxLink tx={msg.tx} prefix="tx " />
        </p>
      ) : null}
      {msg.err ? <p className="mt-2 text-xs text-destructive">{msg.err}</p> : null}
    </section>
  );
}
