import { useEffect, useMemo, useState } from "react";
import { ClubTimeField } from "@/components/launch/ClubTimeField";
import { DecimalText } from "@/components/Amount";
import { Field, TxLink } from "@/components/launch/ui";
import { alcorSwapUrl } from "@/config/launch";
import { assetAmountNumber, parseAsset, validAccount } from "@/services/assets";
import {
  addinsidersAction,
  goliveAction,
  presaleCapRaw,
  provelockAction,
  reginsiderAction,
  rminsiderAction,
  setlaunchtimeAction,
  setpresaleAction,
  type ChainAction,
} from "@/services/launchActions";
import { localToUnix, unixToLocal } from "@/services/insidersClub";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

function waitLabel(unix: number, nowSec: number): string {
  const sec = Math.max(0, unix - nowSec);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  if (mins > 0) return `${mins}m`;
  return "under a minute";
}

function fmtUnix(unix: number, nowSec: number): string {
  if (!unix) return "-";
  const when = new Date(unix * 1000).toLocaleString();
  if (nowSec >= unix) return `${when} · started`;
  return `${when} · in ${waitLabel(unix, nowSec)}`;
}

type Props = {
  contract: string;
  symbol: string;
  precision: number;
  actor: string | null;
  isIssuer: boolean;
  isLoggedIn: boolean;
  busy: boolean;
  launch: Record<string, unknown> | null;
  stat: Record<string, unknown> | null;
  presale: Record<string, unknown>;
  insider: Record<string, unknown> | null;
  quoteSymbol: string;
  quoteContract: string;
  holderBalanceRaw: number;
  onConnect: () => void;
  transact: (actions: ChainAction[]) => Promise<unknown>;
  onDone: () => void;
};

export function PresalePanel({
  contract,
  symbol,
  precision,
  actor,
  isIssuer,
  isLoggedIn,
  busy,
  launch,
  stat,
  presale,
  insider,
  quoteSymbol,
  quoteContract,
  holderBalanceRaw,
  onConnect,
  transact,
  onDone,
}: Props) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const insiderTime = Number(pick(presale, "insider_time") ?? 0);
  const launchTime = Number(pick(presale, "launch_time") ?? 0);
  const mode = Number(pick(presale, "mode") ?? 0);
  const insiderBps = Number(pick(presale, "insider_bps") ?? 0);
  const lockedBps = Number(pick(presale, "locked_insider_bps") ?? 0);
  const collection = String(pick(presale, "collection") ?? "");
  const schema = String(pick(presale, "schema") ?? "");
  const nftMin = Number(pick(presale, "nft_min") ?? 0);
  const minToken = pick(presale, "min_token") as { quantity?: string; contract?: string } | undefined;
  const lpMin = Number(pick(presale, "lp_min") ?? 0);
  const lockedLpMin = Number(pick(presale, "locked_lp_min") ?? 0);
  const lockSecs = Number(pick(presale, "lock_secs") ?? 0);
  const poolId = Number(pick(launch, "pure_liquid_alcor_pool_id", "pool_id") ?? 0);
  const approved = Boolean(pick(insider, "approved"));
  const lockedPos = Number(pick(insider, "locked_pos") ?? 0);
  const supplyRaw = (() => {
    const p = parseAsset(String(pick(stat, "supply") ?? ""));
    if (!p) return 0;
    const [i = "0", f = ""] = p.amount.replace("-", "").split(".");
    const frac = (f + "0".repeat(precision)).slice(0, precision);
    return Number(precision <= 0 ? i : `${i}${frac}`) || 0;
  })();
  const cap = useMemo(
    () => presaleCapRaw(supplyRaw, insiderBps, lockedBps, lockedPos),
    [supplyRaw, insiderBps, lockedBps, lockedPos]
  );
  const remaining = Math.max(0, cap - holderBalanceRaw);

  const [posId, setPosId] = useState("");
  const [addList, setAddList] = useState("");
  const [rmAccount, setRmAccount] = useState("");
  const [delayLaunch, setDelayLaunch] = useState(() => unixToLocal(launchTime));
  const [delayInsider, setDelayInsider] = useState(() => unixToLocal(insiderTime));
  const [signing, setSigning] = useState(false);
  const [msg, setMsg] = useState<{ tx?: string; err?: string }>({});
  const disabled = busy || signing;

  const gates: string[] = [];
  if (collection && schema) gates.push(`NFT ${collection}/${schema}${nftMin > 1 ? ` ×${nftMin}` : ""}`);
  if (minToken?.quantity && assetAmountNumber(minToken.quantity) > 0) {
    gates.push(`Hold ${minToken.quantity}@${minToken.contract ?? "?"}`);
  }
  if (lpMin > 0) gates.push(`LP ≥ ${lpMin} on pool ${poolId || "?"}`);
  if (!gates.length) gates.push("Open (no NFT / Min Hold / LP gate)");

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

  const buysOpen = now >= launchTime;
  const joinOpen = now >= insiderTime;

  return (
    <section className="mt-6 space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold tracking-tight">Insiders</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Buy & LP early.{" "}
            {mode === 0
              ? "Frozen."
              : joinOpen
                ? "Insider window is open."
                : `Presale starts in ${waitLabel(insiderTime, now)}.`}{" "}
            Insider Max {insiderBps / 100}% of supply
            {lockedBps > insiderBps ? ` (${lockedBps / 100}% LP provider bonus)` : ""}.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="chip-muted">insider buys {fmtUnix(insiderTime, now)}</span>
        <span className="chip-muted">public launch {fmtUnix(launchTime, now)}</span>
        {approved ? <span className="chip-success">approved</span> : <span className="chip-muted">not on list</span>}
        {lockedPos > 0 ? <span className="chip-success">lock pos {lockedPos}</span> : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Gates: {gates.join(" · ")}. Your remaining buy room:{" "}
        <span className="font-mono font-semibold text-foreground">
          <DecimalText text={(remaining / 10 ** precision).toLocaleString(undefined, { maximumFractionDigits: precision })} /> {symbol}
        </span>
      </p>

      {!isLoggedIn || !actor ? (
        <button type="button" className="btn btn-primary btn-sm" onClick={onConnect}>
          Connect to join
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={disabled || approved || !joinOpen}
            onClick={() => void run(reginsiderAction(contract, actor, symbol))}
          >
            {signing
              ? "Signing…"
              : approved
                ? "Already joined"
                : joinOpen
                  ? "Join"
                  : `Wait ${waitLabel(insiderTime, now)} for presale`}
          </button>
          {(lockedLpMin > 0 || lockSecs > 0) && poolId > 0 ? (
            <>
              <input
                className="input w-28 font-mono"
                placeholder="position id"
                inputMode="numeric"
                value={posId}
                onChange={(e) => setPosId(e.target.value.replace(/\D/g, ""))}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={disabled || !posId}
                onClick={() => void run(provelockAction(contract, actor, symbol, poolId, Number(posId)))}
              >
                Prove lock
              </button>
            </>
          ) : null}
          {buysOpen && quoteSymbol && approved ? (
            <a
              href={alcorSwapUrl(quoteSymbol, quoteContract, symbol, contract)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline btn-sm"
            >
              Buy on Alcor
            </a>
          ) : (
            <span className="self-center text-xs text-muted-foreground">
              {buysOpen ? "Join first to buy" : `Buys open in ${waitLabel(launchTime, now)}`}
            </span>
          )}
        </div>
      )}

      {isIssuer && actor ? (
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-xs font-semibold">Issuer</p>
          <Field label="Invites" sentence>
            <div className="flex flex-wrap gap-2">
              <input
                className="input min-w-[12rem] flex-1 font-mono"
                placeholder="alice,bob"
                value={addList}
                onChange={(e) => setAddList(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={disabled || !addList.trim()}
                onClick={() => void run(addinsidersAction(contract, symbol, addList))}
              >
                Add
              </button>
            </div>
          </Field>
          <Field label="Remove one" sentence>
            <div className="flex flex-wrap gap-2">
              <input
                className="input w-40 font-mono"
                placeholder="account"
                value={rmAccount}
                onChange={(e) => setRmAccount(e.target.value.trim().toLowerCase())}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={disabled || !validAccount(rmAccount)}
                onClick={() => void run(rminsiderAction(contract, rmAccount, symbol))}
              >
                Remove
              </button>
            </div>
          </Field>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <ClubTimeField
              label="Insider buys start"
              hint="Cannot pull earlier than the time already on chain."
              value={delayInsider}
              disabled={disabled}
              onChange={setDelayInsider}
            />
            <ClubTimeField
              label="Public launch"
              hint="Cannot pull earlier than the time already on chain."
              value={delayLaunch}
              disabled={disabled}
              onChange={setDelayLaunch}
            />
          </div>
          <Field label="Save times" sentence>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={disabled}
                onClick={() => {
                  const i = localToUnix(delayInsider);
                  const l = localToUnix(delayLaunch);
                  if (!i || !l || l <= i) {
                    setMsg({ err: "Insider buys start must precede public launch." });
                    return;
                  }
                  void run(setlaunchtimeAction(contract, symbol, l, i));
                }}
              >
                Save times
              </button>
            </div>
          </Field>
          <Field label="Freeze" hint="Dev only. Blocks gated transfers until you unfreeze or launch." sentence>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={disabled}
              onClick={() =>
                void run(
                  setpresaleAction(contract, symbol, {
                    launchTime,
                    insiderTime,
                    mode: mode === 0 ? 1 : 0,
                    insiderBps,
                    lockedInsiderBps: lockedBps,
                    collection,
                    schema,
                    nftMin,
                    minTokenQuantity: minToken?.quantity ?? "",
                    minTokenContract: String(minToken?.contract ?? ""),
                    lpMin,
                    lockedLpMin,
                    lockSecs,
                  })
                )
              }
            >
              {mode === 0 ? "Unfreeze (allow insider buys)" : "Freeze (block gated transfers)"}
            </button>
          </Field>
          <button
            type="button"
            className="btn btn-accent btn-sm"
            disabled={disabled || !(poolId > 0)}
            onClick={() => void run(goliveAction(contract, symbol))}
          >
            {signing ? "Signing…" : "Launch (open to everyone)"}
          </button>
        </div>
      ) : null}

      {msg.tx ? <TxLink tx={msg.tx} prefix="tx " /> : null}
      {msg.err ? <p className="text-xs text-destructive">{msg.err}</p> : null}
    </section>
  );
}
