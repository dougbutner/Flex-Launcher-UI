import { useCallback, useEffect, useMemo, useState } from "react";
import { FLEXFOREX_CONTRACT, LOCK_MIN_DAYS } from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { useWallet } from "@/hooks/useWallet";
import { planFromDraft } from "@/components/launch/draftPlan";
import { StatusIcon, StepShell, TxLink } from "@/components/launch/ui";
import {
  activepoolTransfer,
  addliquidAction,
  buyContractRam,
  createpoolAction,
  depositAction,
  forgeAction,
  lockposAction,
  mintAction,
  reglaunchAction,
  stampAction,
  type ChainAction,
} from "@/services/launchActions";
import { unlockTimeUnix, type LaunchPlan } from "@/services/launchMath";
import { findPool, readAlcorSystem, readPool } from "@/services/flexTables";
import { assetAmountNumber } from "@/services/assets";
import { hintForError, logpoolIdFromResult, txErrorMessage, txIdFromResult } from "@/services/txParse";
import { runPreflight, type PreflightItem } from "@/services/preflight";

type Props = {
  draft: LaunchDraft;
  patch: (p: Partial<LaunchDraft>) => void;
  onBack: () => void;
  onDone: () => void;
};

type ExecDef = {
  id: string;
  label: string;
  detail: string;
  txOf: (d: LaunchDraft) => string;
  build: (ctx: { actor: string; plan: LaunchPlan; draft: LaunchDraft }) => Promise<ChainAction[] | "skip">;
  after?: (ctx: {
    result: unknown;
    patch: (p: Partial<LaunchDraft>) => void;
    plan: LaunchPlan;
  }) => Promise<void>;
};

const EXEC_STEPS: ExecDef[] = [
  {
    id: "ram",
    label: "Buy contract RAM",
    detail: `5,000.0000 XPR → ${FLEXFOREX_CONTRACT}`,
    txOf: (d) => d.ramTx,
    build: async ({ actor }) => [buyContractRam(actor)],
  },
  {
    id: "forge",
    label: "Forge token",
    detail: "Create symbol + max supply",
    txOf: (d) => d.forgeTx,
    build: async ({ actor, plan }) => [forgeAction(actor, plan.fullSupply)],
  },
  {
    id: "mint",
    label: "Mint 100%",
    detail: "Full supply to issuer",
    txOf: (d) => d.mintTx,
    build: async ({ actor, plan }) => [mintAction(actor, plan.fullSupply)],
  },
  {
    id: "reglaunch",
    label: "Register launch",
    detail: `Quote, fee, ticks, sqrtPriceX64 on ${FLEXFOREX_CONTRACT}`,
    txOf: (d) => d.regTx,
    build: async ({ plan, draft }) => [reglaunchAction(plan, Number(draft.proofPoolId || 0))],
  },
  {
    id: "createpool",
    label: "Create Alcor pool",
    detail: "Zero-amount extended assets, same sqrt price",
    txOf: (d) => d.poolTx,
    build: async ({ actor, plan }) => [createpoolAction(actor, plan)],
    after: async ({ result, patch, plan }) => {
      let poolId = logpoolIdFromResult(result);
      if (poolId == null) {
        const found = await findPool(plan.tokenA, plan.tokenB, plan.fee);
        poolId = found ? Number(found.id) : null;
      }
      if (poolId == null) throw new Error("Pool created but id not detected — enter it manually below.");
      patch({ poolId });
    },
  },
  {
    id: "activate",
    label: "Activate pool",
    detail: "Pay activeFee only if the pool starts inactive",
    txOf: (d) => d.activateTx,
    build: async ({ actor, draft }) => {
      const poolId = draft.poolId;
      if (poolId == null) throw new Error("Missing pool id.");
      const [sys, pool] = await Promise.all([readAlcorSystem(), readPool(poolId)]);
      const fee = sys?.activeFee;
      const amount = fee ? assetAmountNumber(fee.quantity) : 0;
      if (!fee || amount <= 0 || Boolean(pool?.active)) return "skip";
      return [activepoolTransfer(actor, fee.quantity, fee.contract, poolId)];
    },
  },
  {
    id: "deposit",
    label: "Deposit 100% of supply",
    detail: "transfer to swap.alcor, memo “deposit”",
    txOf: (d) => d.depositTx,
    build: async ({ actor, plan }) => [depositAction(actor, plan.fullSupply)],
  },
  {
    id: "addliquid",
    label: "Add one-sided liquidity",
    detail: "Full supply into the registered ticks",
    txOf: (d) => d.rangeTx,
    build: async ({ actor, plan, draft }) => {
      if (draft.poolId == null) throw new Error("Missing pool id.");
      return [addliquidAction(actor, draft.poolId, plan)];
    },
  },
  {
    id: "lockpos",
    label: "Lock position",
    detail: `≥ ${LOCK_MIN_DAYS} days — collect still works, subliquid fails`,
    txOf: (d) => d.lockTx,
    build: async ({ actor, plan, draft }) => {
      if (draft.poolId == null) throw new Error("Missing pool id.");
      return [lockposAction(actor, draft.poolId, plan, unlockTimeUnix(draft.lockDays))];
    },
  },
];

export function ExecuteStep({ draft, patch, onBack, onDone }: Props) {
  const { actor, isLoggedIn, transact } = useWallet();
  const plan = useMemo(() => planFromDraft(draft), [draft]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preflight, setPreflight] = useState<PreflightItem[] | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [stampError, setStampError] = useState("");
  const [manualPoolId, setManualPoolId] = useState("");

  const run = async (step: ExecDef) => {
    if (!actor || !plan) return;
    setBusyId(step.id);
    setErrors((e) => ({ ...e, [step.id]: "" }));
    try {
      const actions = await step.build({ actor, plan, draft });
      if (actions === "skip") {
        patch({ activateTx: "skipped" });
        return;
      }
      const result = await transact(actions);
      await step.after?.({ result, patch, plan });
      const txId = txIdFromResult(result) || "ok";
      const key = (
        {
          ram: "ramTx",
          forge: "forgeTx",
          mint: "mintTx",
          reglaunch: "regTx",
          createpool: "poolTx",
          activate: "activateTx",
          deposit: "depositTx",
          addliquid: "rangeTx",
          lockpos: "lockTx",
        } as Record<string, keyof LaunchDraft>
      )[step.id];
      if (key) patch({ [key]: txId } as Partial<LaunchDraft>);
    } catch (err) {
      const msg = txErrorMessage(err);
      const hint = hintForError(msg);
      setErrors((e) => ({ ...e, [step.id]: hint ? `${msg} — ${hint}` : msg }));
    } finally {
      setBusyId(null);
    }
  };

  const checkPreflight = useCallback(async () => {
    if (!actor || !plan || draft.poolId == null) return;
    setPreflightBusy(true);
    try {
      setPreflight(await runPreflight(plan, draft.poolId, actor));
    } catch (err) {
      setPreflight(null);
      setStampError(txErrorMessage(err));
    } finally {
      setPreflightBusy(false);
    }
  }, [actor, plan, draft.poolId]);

  const locked = Boolean(draft.lockTx);
  useEffect(() => {
    if (locked && !draft.stampTx) void checkPreflight();
  }, [locked, draft.stampTx, checkPreflight]);

  const stamp = async () => {
    if (!actor || !plan || draft.poolId == null) return;
    setBusyId("stamp");
    setStampError("");
    try {
      const result = await transact([stampAction(plan, draft.poolId)]);
      patch({ stampTx: txIdFromResult(result) || "ok" });
      onDone();
    } catch (err) {
      const msg = txErrorMessage(err);
      const hint = hintForError(msg);
      setStampError(hint ? `${msg} — ${hint}` : msg);
    } finally {
      setBusyId(null);
    }
  };

  if (!plan) {
    return (
      <StepShell title="Execute" desc="Finish the earlier steps first." footer={<button type="button" className="btn btn-ghost" onClick={onBack}>Back</button>}>
        <p className="text-sm text-warning">The launch plan is incomplete — go back and fill in token, quote, and range.</p>
      </StepShell>
    );
  }

  const preflightOk = preflight != null && preflight.every((i) => i.pass);

  return (
    <StepShell
      title="Execute"
      desc={`Signing as ${actor ?? "…"}. Order matters — each step unlocks when the one above it lands on-chain.`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
          <span className="text-xs text-muted-foreground">
            {EXEC_STEPS.filter((s) => s.txOf(draft)).length}/{EXEC_STEPS.length + 1} complete
          </span>
        </>
      }
    >
      <ol className="space-y-2">
        {EXEC_STEPS.map((step, i) => {
          const tx = step.txOf(draft);
          const prevDone = i === 0 || Boolean(EXEC_STEPS[i - 1].txOf(draft));
          const needsPool = ["activate", "addliquid", "lockpos"].includes(step.id);
          const ready = prevDone && (!needsPool || draft.poolId != null);
          const busy = busyId === step.id;
          const err = errors[step.id];
          return (
            <li
              key={step.id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                tx ? "border-success/25 bg-success/5" : err ? "border-destructive/40 bg-destructive/5" : "border-border bg-background/40"
              }`}
            >
              <StatusIcon state={tx ? "done" : err ? "error" : busy ? "active" : "todo"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{step.label}</span>
                  {tx ? <TxLink tx={tx} /> : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">{step.detail}</p>
                {err ? <p className="mt-1 text-xs font-medium text-destructive">{err}</p> : null}
              </div>
              {!tx ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm shrink-0"
                  disabled={!isLoggedIn || !ready || busyId != null}
                  onClick={() => void run(step)}
                >
                  {busy ? "Signing…" : "Sign"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      {draft.poolTx && draft.poolId == null ? (
        <div className="flex items-end gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3">
          <div className="flex-1">
            <span className="label">Pool id (manual)</span>
            <input
              className="input font-mono"
              inputMode="numeric"
              placeholder="From the explorer logpool row"
              value={manualPoolId}
              onChange={(e) => setManualPoolId(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!manualPoolId}
            onClick={() => patch({ poolId: Number(manualPoolId) })}
          >
            Set
          </button>
        </div>
      ) : null}

      {locked && !draft.stampTx ? (
        <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-primary">Stamp preflight</span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={preflightBusy} onClick={() => void checkPreflight()}>
              {preflightBusy ? "Checking…" : "Re-check"}
            </button>
          </div>
          {preflight ? (
            <ul className="space-y-1.5">
              {preflight.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-xs">
                  <StatusIcon state={item.pass ? "done" : "error"} />
                  <span className={item.pass ? "text-foreground" : "text-destructive"}>{item.label}</span>
                  {item.detail ? <span className="ml-auto text-muted-foreground">{item.detail}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Reading chain state…</p>
          )}
          {stampError ? <p className="text-xs font-medium text-destructive">{stampError}</p> : null}
          <button
            type="button"
            className="btn btn-accent btn-lg w-full"
            disabled={!preflightOk || busyId != null}
            onClick={() => void stamp()}
          >
            {busyId === "stamp" ? "Stamping…" : "Stamp — make it transferable"}
          </button>
        </div>
      ) : null}
    </StepShell>
  );
}
