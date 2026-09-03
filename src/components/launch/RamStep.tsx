import { useCallback, useEffect, useState } from "react";
import { CONTRACT_RAM_QUANT, CONTRACT_RAM_XPR, flexAccount } from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { useWallet } from "@/hooks/useWallet";
import { buyContractRam } from "@/services/launchActions";
import { readContractRam, readXprBalance } from "@/services/flexTables";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";
import { Field, StepShell, TxLink } from "@/components/launch/ui";

type Props = {
  draft: LaunchDraft;
  patch: (p: Partial<LaunchDraft>) => void;
  onNext: () => void;
  onBack: () => void;
};

function kb(bytes: number) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function RamStep({ draft, patch, onNext, onBack }: Props) {
  const { actor, isLoggedIn, transact } = useWallet();
  const tokenContract = flexAccount(draft.program);
  const [balance, setBalance] = useState<number | null>(null);
  const [ram, setRam] = useState<{ quota: number; usage: number } | null>(null);
  const [chainErr, setChainErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!actor) return;
    setChainErr("");
    try {
      const [bal, info] = await Promise.all([readXprBalance(actor), readContractRam(tokenContract)]);
      setBalance(bal);
      setRam(info);
      if (!info) setChainErr(`${tokenContract} is not a live account yet. Set VITE_EASYFLEX / VITE_COMPLEXFLEX / VITE_FLEXFOREX_CONTRACT.`);
    } catch (err) {
      setChainErr(txErrorMessage(err));
    }
  }, [actor, tokenContract]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const buy = async () => {
    if (!actor) return;
    setBusy(true);
    setError("");
    try {
      const res = await transact([buyContractRam(actor, tokenContract)]);
      const txId = txIdFromResult(res);
      patch({ ramTx: txId || "ok" });
      await refresh();
    } catch (err) {
      const msg = txErrorMessage(err);
      setError(hintForError(msg) ? `${msg} — ${hintForError(msg)}` : msg);
    } finally {
      setBusy(false);
    }
  };

  const enough = balance != null && balance >= CONTRACT_RAM_XPR;

  return (
    <StepShell
      title="Buy contract RAM"
      desc={`A one-time gift of ${CONTRACT_RAM_QUANT} to ${tokenContract} pays for the tables your launch creates. Required before create.`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn btn-primary" disabled={!draft.ramTx} onClick={onNext}>
            Continue
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="stat-box">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Your XPR</div>
          <div className={`mt-1 font-mono text-lg font-bold ${enough ? "text-success" : "text-warning"}`}>
            {balance == null ? "…" : balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </div>
        </div>
        <div className="stat-box">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Contract RAM quota</div>
          <div className="mt-1 font-mono text-lg font-bold">{ram ? kb(ram.quota) : "—"}</div>
        </div>
        <div className="stat-box">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">RAM in use</div>
          <div className="mt-1 font-mono text-lg font-bold">{ram ? kb(ram.usage) : "—"}</div>
        </div>
      </div>

      <Field label="RAM gift">
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <div>
            <div className="font-mono text-lg font-bold text-primary">{CONTRACT_RAM_QUANT}</div>
            <div className="text-xs text-muted-foreground">
              → <span className="font-mono">{tokenContract}</span> via <span className="font-mono">eosio::buyram</span>
            </div>
          </div>
          {draft.ramTx ? <span className="chip-success">Paid</span> : <span className="chip-warn">Required</span>}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          RAM stays on the contract account — it is not refunded to you. Alcor pool RAM is a separate, later cost on{" "}
          <span className="font-mono">createpool</span>.
        </p>
      </Field>

      {chainErr ? <p className="rounded-xl bg-destructive/10 p-3 text-xs font-medium text-destructive">{chainErr}</p> : null}
      {error ? <p className="rounded-xl bg-destructive/10 p-3 text-xs font-medium text-destructive">{error}</p> : null}

      {draft.ramTx ? (
        <div className="flex items-center justify-between rounded-md border border-success/30 bg-success/5 px-4 py-3">
          <span className="text-sm font-medium text-success">RAM purchased for this draft.</span>
          <TxLink tx={draft.ramTx} />
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-lg w-full"
          disabled={!isLoggedIn || busy || !enough || Boolean(chainErr)}
          onClick={() => void buy()}
        >
          {!isLoggedIn
            ? "Connect wallet first"
            : busy
              ? "Signing…"
              : balance == null
                ? "Reading balance…"
                : !enough
                  ? `Need ≥ ${CONTRACT_RAM_XPR.toLocaleString()} XPR`
                  : `Buy ${CONTRACT_RAM_QUANT} for the contract`}
        </button>
      )}
    </StepShell>
  );
}
