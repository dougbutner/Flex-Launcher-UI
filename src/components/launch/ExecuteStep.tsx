import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EASY_SYMBOL,
  EOSIO_TOKEN,
  FLEX_PROGRAMS,
  LOCK_MIN_DAYS,
  MON3Y,
  SWAP_ALCOR,
  XPR_SYMBOL,
  alcorSwapUrl,
  flexAccount,
  flexMeta,
  hasAngelChannels,
} from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { useWallet } from "@/hooks/useWallet";
import { planFromDraft, taxFromDraft } from "@/components/launch/draftPlan";
import { StatusIcon, StepShell, TxLink } from "@/components/launch/ui";
import {
  activepoolTransfer,
  addLaunchQuotePoolAction,
  addliquidAction,
  createTokenAction,
  createpoolAction,
  depositAction,
  liftoffAction,
  lockposAction,
  ratiosAction,
  setfeesAction,
  startlaunchAction,
  supplyAction,
  type ChainAction,
} from "@/services/launchActions";
import { unlockTimeUnix, type LaunchPlan } from "@/services/launchMath";
import { readAlcorSystem, readPool, resolvePoolIdAfterCreatepool } from "@/services/flexTables";
import { assetAmountNumber } from "@/services/assets";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";
import { hasProjectTax } from "@/services/taxRates";
import { persistLaunchDraft } from "@/services/managerApi";
import { runCreateGates, runPreflight, type PreflightItem } from "@/services/preflight";

type Props = {
  draft: LaunchDraft;
  patch: (p: Partial<LaunchDraft>) => void;
  onBack: () => void;
  onDone: () => void;
};

const EASY_SWAP = alcorSwapUrl(XPR_SYMBOL, EOSIO_TOKEN, EASY_SYMBOL, MON3Y);

function GateDetail({ text }: { text: string }) {
  if (!text.includes("EASY before liftoff")) return <>{text}</>;
  const parts = text.split("EASY");
  return (
    <>
      {parts[0]}
      <a href={EASY_SWAP} target="_blank" rel="noopener noreferrer" className="link">
        EASY
      </a>
      {parts.slice(1).join("EASY")}
    </>
  );
}

type ExecDef = {
  id: string;
  label: string;
  detail: string;
  sig: string;
  txOf: (d: LaunchDraft) => string;
  build: (ctx: { actor: string; plan: LaunchPlan; draft: LaunchDraft }) => Promise<ChainAction[] | "skip">;
  after?: (ctx: {
    result: unknown;
    patch: (p: Partial<LaunchDraft>) => void;
    plan: LaunchPlan;
  }) => Promise<void>;
};

const TX_KEY: Record<string, keyof LaunchDraft> = {
  create: "createTx",
  setfees: "feesTx",
  supply: "mintTx",
  startlaunch: "startTx",
  createpool: "poolTx",
  activate: "activateTx",
  deposit: "depositTx",
  addliquid: "rangeTx",
  lockpos: "lockTx",
};

function execSteps(draft: LaunchDraft): ExecDef[] {
  const code = flexAccount(draft.program);
  const meta = flexMeta(draft.program);
  return [
    {
      id: "create",
      label: "Create token",
      detail: `create on ${code}`,
      sig: `${code}::create`,
      txOf: (d) => d.createTx,
      build: async ({ actor, plan }) => {
        const actions: ChainAction[] = [createTokenAction(code, actor, plan.fullSupply)];
        return actions;
      },
    },
    {
      id: "setfees",
      label: "Set fees",
      detail: `setfees on ${code}`,
      sig: `${code}::setfees`,
      txOf: (d) => d.feesTx,
      build: async ({ actor, plan, draft: d }) => {
        const tax = taxFromDraft(d);
        const actions: ChainAction[] = [
          setfeesAction(
            code,
            d.precision,
            plan.launched.symbol,
            {
              reflectionRate: tax.reflectionRate,
              burnRate: tax.burnRate,
              projectRate: tax.projectRate,
              projectAccount: tax.projectAccount,
            },
            hasProjectTax(d.program),
            actor
          ),
        ];
        if (hasAngelChannels(d.program) && (tax.angelNumbersBps > 0 || tax.jackpotBps > 0)) {
          actions.push(ratiosAction(code, plan.launched.symbol, tax.angelNumbersBps, tax.jackpotBps));
        }
        return actions;
      },
    },
    {
      id: "supply",
      label: meta.supply === "issue" ? "Issue 100%" : "Mint 100%",
      detail: `${meta.supply} full supply to issuer`,
      sig: `${code}::${meta.supply}`,
      txOf: (d) => d.mintTx,
      build: async ({ actor, plan }) => [supplyAction(code, meta.supply, actor, plan.fullSupply)],
    },
    {
      id: "startlaunch",
      label: "Start launch",
      detail: `Quote, fee, ticks, sqrtPriceX64, swap_underlying_default=${draft.swapUnderlyingDefault} on ${code}`,
      sig: `${code}::startlaunch`,
      txOf: (d) => d.startTx,
      build: async ({ plan, draft: d }) => [
        startlaunchAction(code, plan, Number(d.proofPoolId || 0), d.swapUnderlyingDefault),
      ],
    },
    {
      id: "createpool",
      label: "Create Alcor pool",
      detail: "Zero-amount extended assets, same sqrt price",
      sig: `${SWAP_ALCOR}::createpool`,
      txOf: (d) => d.poolTx,
      build: async ({ actor, plan }) => [createpoolAction(actor, plan)],
      after: async ({ result, patch, plan }) => {
        const poolId = await resolvePoolIdAfterCreatepool(result, plan);
        if (poolId != null) patch({ poolId });
      },
    },
    {
      id: "activate",
      label: "Activate pool",
      detail: "Pay activeFee only if the pool starts inactive",
      sig: `transfer memo activepool#id`,
      txOf: (d) => d.activateTx,
      build: async ({ actor, draft: d }) => {
        const poolId = d.poolId;
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
      sig: `${code}::transfer`,
      txOf: (d) => d.depositTx,
      build: async ({ actor, plan }) => [depositAction(code, actor, plan.fullSupply)],
    },
    {
      id: "addliquid",
      label: "Add one-sided liquidity",
      detail: "Full supply into the startlaunch ticks",
      sig: `${SWAP_ALCOR}::addliquid`,
      txOf: (d) => d.rangeTx,
      build: async ({ actor, plan, draft: d }) => {
        if (d.poolId == null) throw new Error("Missing pool id.");
        return [addliquidAction(actor, d.poolId, plan)];
      },
    },
    {
      id: "lockpos",
      label: "Lock position",
      detail: `≥ ${LOCK_MIN_DAYS} days - collect still works, subliquid fails`,
      sig: `${SWAP_ALCOR}::lockpos`,
      txOf: (d) => d.lockTx,
      build: async ({ actor, plan, draft: d }) => {
        if (d.poolId == null) throw new Error("Missing pool id.");
        return [lockposAction(actor, d.poolId, plan, unlockTimeUnix(d.lockDays))];
      },
    },
  ];
}

export function ExecuteStep({ draft, patch, onBack, onDone }: Props) {
  const { actor, isLoggedIn, transact } = useWallet();
  const plan = useMemo(() => planFromDraft(draft), [draft]);
  const steps = useMemo(() => execSteps(draft), [draft]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preflight, setPreflight] = useState<PreflightItem[] | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [liftoffError, setLiftoffError] = useState("");
  const [addpoolError, setAddpoolError] = useState("");
  const [manualPoolId, setManualPoolId] = useState("");
  const [gates, setGates] = useState<PreflightItem[] | null>(null);
  const [gatesBusy, setGatesBusy] = useState(false);
  const code = flexAccount(draft.program);

  const checkGates = useCallback(async () => {
    if (!actor || draft.createTx) return;
    setGatesBusy(true);
    try {
      setGates(await runCreateGates(draft.program, draft.symbol, actor));
    } catch {
      setGates(null);
    } finally {
      setGatesBusy(false);
    }
  }, [actor, draft.createTx, draft.program, draft.symbol]);

  useEffect(() => {
    void checkGates();
  }, [checkGates]);

  const run = async (step: ExecDef) => {
    if (!actor || !plan) return;
    setBusyId(step.id);
    setErrors((e) => ({ ...e, [step.id]: "" }));
    try {
      let next = { ...draft };
      const wrapPatch = (p: Partial<LaunchDraft>) => {
        next = { ...next, ...p };
        patch(p);
      };
      const actions = await step.build({ actor, plan, draft });
      if (actions === "skip") {
        const key = TX_KEY[step.id];
        if (key) wrapPatch({ [key]: "skipped" } as Partial<LaunchDraft>);
        void persistLaunchDraft(actor, next);
        return;
      }
      const result = await transact(actions);
      const txId = txIdFromResult(result) || "ok";
      const key = TX_KEY[step.id];
      if (key) wrapPatch({ [key]: txId } as Partial<LaunchDraft>);
      await step.after?.({ result, patch: wrapPatch, plan });
      void persistLaunchDraft(actor, next);
    } catch (err) {
      const msg = txErrorMessage(err);
      const hint = hintForError(msg);
      setErrors((e) => ({ ...e, [step.id]: hint ? `${msg} - ${hint}` : msg }));
    } finally {
      setBusyId(null);
    }
  };

  const checkPreflight = useCallback(async () => {
    if (!actor || !plan || draft.poolId == null) return;
    setPreflightBusy(true);
    try {
      setPreflight(await runPreflight(plan, draft.poolId, actor, draft.program));
    } catch (err) {
      setPreflight(null);
      setLiftoffError(txErrorMessage(err));
    } finally {
      setPreflightBusy(false);
    }
  }, [actor, plan, draft.poolId]);

  const locked = Boolean(draft.lockTx);
  useEffect(() => {
    if (locked && !draft.liftoffTx) void checkPreflight();
  }, [locked, draft.liftoffTx, checkPreflight]);

  const liftoff = async () => {
    if (!actor || !plan || draft.poolId == null) return;
    setBusyId("liftoff");
    setLiftoffError("");
    try {
      const result = await transact([liftoffAction(code, plan, draft.poolId)]);
      const next = { ...draft, liftoffTx: txIdFromResult(result) || "ok" };
      patch({ liftoffTx: next.liftoffTx });
      void persistLaunchDraft(actor, next);
    } catch (err) {
      const msg = txErrorMessage(err);
      const hint = hintForError(msg);
      setLiftoffError(hint ? `${msg} - ${hint}` : msg);
    } finally {
      setBusyId(null);
    }
  };

  const addLaunchPool = async () => {
    if (!actor || !plan || draft.poolId == null) return;
    setBusyId("addpool");
    setAddpoolError("");
    try {
      const result = await transact([
        addLaunchQuotePoolAction(code, draft.poolId, plan.launched.symbol, plan.quote),
      ]);
      const next = { ...draft, addpoolTx: txIdFromResult(result) || "ok" };
      patch({ addpoolTx: next.addpoolTx });
      void persistLaunchDraft(actor, next);
      onDone();
    } catch (err) {
      const msg = txErrorMessage(err);
      const hint = hintForError(msg);
      setAddpoolError(hint ? `${msg} - ${hint}` : msg);
    } finally {
      setBusyId(null);
    }
  };

  if (!plan) {
    return (
      <StepShell title="Execute" desc="Finish the earlier steps first." footer={<button type="button" className="btn btn-ghost" onClick={onBack}>Back</button>}>
        <p className="text-sm text-warning">The launch plan is incomplete - go back and fill in token, quote, and range.</p>
      </StepShell>
    );
  }

  const preflightOk = preflight != null && preflight.every((i) => i.pass);
  const gatesOk = !gates || gates.every((i) => i.pass);

  return (
    <StepShell
      title="Execute"
      desc={`Signing as ${actor ?? "…"}. ${FLEX_PROGRAMS.find((p) => p.id === draft.program)?.title} on ${code}. Order matters.`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
          <span className="text-xs text-muted-foreground">
            {steps.filter((s) => s.txOf(draft)).length + (draft.liftoffTx ? 1 : 0) + (draft.addpoolTx ? 1 : 0)}/
            {steps.length + 2} complete
          </span>
        </>
      }
    >
      {!draft.createTx ? (
        <div className="space-y-2 rounded-xl border border-border bg-background/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Before create</span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={gatesBusy || !actor} onClick={() => void checkGates()}>
              {gatesBusy ? "Checking…" : "Re-check"}
            </button>
          </div>
          {gates ? (
            <ul className="space-y-1.5">
              {gates.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-xs">
                  <StatusIcon state={item.pass ? "done" : "error"} />
                  <span className={item.pass ? "text-foreground" : "text-destructive"}>{item.label}</span>
                  {item.detail ? (
                    <span className="ml-auto text-muted-foreground">
                      <GateDetail text={item.detail} />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{actor ? "Reading chain state…" : "Connect a wallet to check ticker and EASY."}</p>
          )}
        </div>
      ) : null}

      <ol className="space-y-2">
        {steps.map((step, i) => {
          const tx = step.txOf(draft);
          const prevDone = i === 0 || Boolean(steps[i - 1].txOf(draft));
          const needsPool = ["activate", "addliquid", "lockpos"].includes(step.id);
          const gateBlock = step.id === "create" && !gatesOk;
          const ready = prevDone && (!needsPool || draft.poolId != null) && !gateBlock;
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
                <p className="font-mono text-[11px] text-muted-foreground">{tx ? "Signed" : "Wallet will ask for"} {step.sig}</p>
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
            onClick={() => {
              const poolId = Number(manualPoolId);
              patch({ poolId });
              if (actor) void persistLaunchDraft(actor, { ...draft, poolId });
            }}
          >
            Set
          </button>
        </div>
      ) : null}

      {locked && !draft.liftoffTx ? (
        <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-primary">Liftoff preflight</span>
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
                  {item.detail ? (
                    <span className="ml-auto text-muted-foreground">
                      <GateDetail text={item.detail} />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Reading chain state…</p>
          )}
          {liftoffError ? <p className="text-xs font-medium text-destructive">{liftoffError}</p> : null}
          <p className="font-mono text-[11px] text-muted-foreground">Wallet will ask for {code}::liftoff</p>
          <button
            type="button"
            className="btn btn-accent btn-lg w-full"
            disabled={!preflightOk || busyId != null}
            onClick={() => void liftoff()}
          >
            {busyId === "liftoff" ? "Signing…" : "Liftoff - make it transferable"}
          </button>
        </div>
      ) : null}

      {draft.liftoffTx && !draft.addpoolTx ? (
        <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <span className="text-sm font-semibold text-primary">Register launch quote in flexpools</span>
          <p className="text-xs text-muted-foreground">
            addpool({draft.poolId ?? "pool"}, "{plan.launched.symbol}", {plan.quote.precision},{plan.quote.symbol},{" "}
            {plan.quote.contract}). Holders can then choosereward this pair. Empty output_contract returns to native (pid
            0).
          </p>
          {addpoolError ? <p className="text-xs font-medium text-destructive">{addpoolError}</p> : null}
          <p className="font-mono text-[11px] text-muted-foreground">Wallet will ask for {code}::addpool</p>
          <button
            type="button"
            className="btn btn-accent btn-lg w-full"
            disabled={draft.poolId == null || busyId != null}
            onClick={() => void addLaunchPool()}
          >
            {busyId === "addpool" ? "Signing…" : `Add ${plan.quote.symbol} reward pool`}
          </button>
        </div>
      ) : null}
    </StepShell>
  );
}
