import {
  flexAccount,
  flexMeta,
  hasAngelChannels,
  hasInheritance,
  hasSetmin,
  type FlexProgram,
} from "@/config/launch";
import {
  addliquidAction,
  addLaunchQuotePoolAction,
  addpoolAction,
  abiSymbol,
  checklockAction,
  chooserewardAction,
  createTokenAction,
  createpoolAction,
  depositAction,
  feeoptoutAction,
  inheritanceAction,
  inheritmemoAction,
  liftoffAction,
  lockposAction,
  payoutAction,
  pullangelAction,
  pulljackpotAction,
  ratiosAction,
  setangelnumAction,
  setdistAction,
  setfeesAction,
  setminAction,
  startlaunchAction,
  supplyAction,
  type ChainAction,
} from "@/services/launchActions";
import type { LaunchPlan } from "@/services/launchMath";
import { defaultTaxDraft, hasProjectTax, type TaxDraft } from "@/services/taxRates";

/** Never emitted by issuer/holder UI. */
export const FORBIDDEN_UI_ACTIONS = ["setconfig", "receiverand"] as const;

export type LaunchFlowStep = {
  id: string;
  label: string;
  account: string;
  name: string;
  actions: ChainAction[];
};

export function simulateLaunchFlow(args: {
  program: FlexProgram;
  actor: string;
  plan: LaunchPlan;
  proofPoolId: number;
  swapUnderlyingDefault: boolean;
  poolId: number;
  unlockTime: number;
  tax?: TaxDraft;
}): LaunchFlowStep[] {
  const code = flexAccount(args.program);
  const meta = flexMeta(args.program);
  const { actor, plan } = args;
  const tax = args.tax ?? defaultTaxDraft(args.program);
  const setfeesActions: ChainAction[] = [
    setfeesAction(
      code,
      plan.launched.precision,
      plan.launched.symbol,
      {
        reflectionRate: tax.reflectionRate,
        burnRate: tax.burnRate,
        projectRate: tax.projectRate,
        projectAccount: tax.projectAccount,
      },
      hasProjectTax(args.program),
      actor
    ),
  ];
  if (hasAngelChannels(args.program) && (tax.angelNumbersBps > 0 || tax.jackpotBps > 0)) {
    setfeesActions.push(ratiosAction(code, plan.launched.symbol, tax.angelNumbersBps, tax.jackpotBps));
  }
  return [
    {
      id: "create",
      label: "Create token",
      account: code,
      name: "create",
      actions: [createTokenAction(code, actor, plan.fullSupply)],
    },
    {
      id: "setfees",
      label: "Set fees",
      account: code,
      name: "setfees",
      actions: setfeesActions,
    },
    {
      id: "supply",
      label: meta.supply === "issue" ? "Issue 100%" : "Mint 100%",
      account: code,
      name: meta.supply,
      actions: [supplyAction(code, meta.supply, actor, plan.fullSupply)],
    },
    {
      id: "startlaunch",
      label: "Start launch",
      account: code,
      name: "startlaunch",
      actions: [startlaunchAction(code, plan, args.proofPoolId, args.swapUnderlyingDefault)],
    },
    {
      id: "createpool",
      label: "Create Alcor pool",
      account: createpoolAction(actor, plan).account,
      name: "createpool",
      actions: [createpoolAction(actor, plan)],
    },
    {
      id: "deposit",
      label: "Deposit 100% of supply",
      account: code,
      name: "transfer",
      actions: [depositAction(code, actor, plan.fullSupply)],
    },
    {
      id: "addliquid",
      label: "Add one-sided liquidity",
      account: addliquidAction(actor, args.poolId, plan).account,
      name: "addliquid",
      actions: [addliquidAction(actor, args.poolId, plan)],
    },
    {
      id: "lockpos",
      label: "Lock position",
      account: lockposAction(actor, args.poolId, plan, args.unlockTime).account,
      name: "lockpos",
      actions: [lockposAction(actor, args.poolId, plan, args.unlockTime)],
    },
    {
      id: "liftoff",
      label: "Liftoff",
      account: code,
      name: "liftoff",
      actions: [liftoffAction(code, plan, args.poolId)],
    },
    {
      id: "addpool",
      label: "Add launch quote pool",
      account: code,
      name: "addpool",
      actions: [addLaunchQuotePoolAction(code, args.poolId, plan.launched.symbol, plan.quote)],
    },
  ];
}

/** Every flex-contract action the UI can sign after liftoff, gated by program. */
export function simulateManageActions(args: {
  program: FlexProgram;
  actor: string;
  symbol: string;
  precision?: number;
}): ChainAction[] {
  const code = flexAccount(args.program);
  const { actor, symbol } = args;
  const precision = args.precision ?? 4;
  const meta = flexMeta(args.program);
  const out: ChainAction[] = [
    payoutAction(code, symbol, actor, meta.payoutSigner),
    checklockAction(code, symbol),
    addpoolAction(code, 99, symbol, abiSymbol(6, "EASY"), "mon3y"),
    chooserewardAction(code, actor, symbol, abiSymbol(precision, symbol), ""),
    feeoptoutAction(code, actor, true, symbol),
  ];
  if (hasSetmin(args.program)) {
    out.push(setminAction(code, symbol, 0));
  }
  out.push(
    setfeesAction(
      code,
      precision,
      symbol,
      {
        reflectionRate: 100,
        burnRate: hasProjectTax(args.program) ? 0 : 100,
        projectRate: 100,
        projectAccount: actor,
      },
      hasProjectTax(args.program),
      actor
    )
  );
  if (hasInheritance(args.program)) {
    out.push(inheritanceAction(code, actor, "bob", 2500, symbol));
    out.push(inheritmemoAction(code, actor, "hi @@", symbol));
  }
  if (hasAngelChannels(args.program)) {
    out.push(ratiosAction(code, symbol, 1000, 500));
    out.push(
      setdistAction(code, symbol, {
        angelNumbersBps: 1000,
        jackpotBps: 500,
        jackpotWinners: 3,
        jackpotMinHold: 0,
        angelNumbersCooldown: 86400,
        keeperMin: 0,
        reflectMin: 0,
      })
    );
    out.push(setangelnumAction(code, actor, symbol, 42));
    out.push(pullangelAction(code, symbol));
    out.push(pulljackpotAction(code, symbol));
  }
  return out;
}
