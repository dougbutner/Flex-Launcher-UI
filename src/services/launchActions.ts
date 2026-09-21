import { EOSIO_TOKEN, SWAP_ALCOR } from "@/config/launch";
import { extendedAsset, zeroAsset } from "@/services/assets";
import type { LaunchPlan } from "@/services/launchMath";

export type ChainAction = {
  account: string;
  name: string;
  data: Record<string, unknown>;
  authorization?: Array<{ actor: string; permission: string }>;
};

export function createTokenAction(
  tokenContract: string,
  issuer: string,
  maximumSupply: string
): ChainAction {
  return {
    account: tokenContract,
    name: "create",
    data: { issuer, maximum_supply: maximumSupply },
  };
}

/** Issuer or contract. First call (on-chain sum 0) sets tax. Later: total cannot rise, reflection cannot fall. */
export function setfeesAction(
  tokenContract: string,
  precision: number,
  symbol: string,
  tax: {
    reflectionRate: number;
    burnRate: number;
    projectRate?: number;
    projectAccount?: string;
  },
  withProject: boolean,
  issuer: string
): ChainAction {
  const data: Record<string, unknown> = {
    sym: abiSymbol(precision, symbol),
    reflection_rate: tax.reflectionRate,
    burn_rate: tax.burnRate,
  };
  if (withProject) {
    data.project_rate = tax.projectRate ?? 0;
    data.project_account = (tax.projectAccount || "").trim() || issuer;
  }
  return {
    account: tokenContract,
    name: "setfees",
    data,
  };
}

export function supplyAction(
  tokenContract: string,
  kind: "mint" | "issue",
  issuer: string,
  quantity: string
): ChainAction {
  return {
    account: tokenContract,
    name: kind,
    data: { to: issuer, quantity, memo: "initial supply" },
  };
}

export function startlaunchAction(
  tokenContract: string,
  plan: LaunchPlan,
  xtokenProofPoolId: number,
  swapUnderlyingDefault: boolean
): ChainAction {
  return {
    account: tokenContract,
    name: "startlaunch",
    data: {
      token_symbol: plan.launched.symbol,
      quote: extendedAsset(plan.quoteZero, plan.quote.contract),
      fee: plan.fee,
      tick_lower: plan.tickLower,
      tick_upper: plan.tickUpper,
      sqrt_price_x64: plan.sqrtPriceX64,
      xtoken_proof_pool_id: xtokenProofPoolId,
      swap_underlying_default: swapUnderlyingDefault,
    },
  };
}

export function createpoolAction(issuer: string, plan: LaunchPlan): ChainAction {
  return {
    account: SWAP_ALCOR,
    name: "createpool",
    data: {
      account: issuer,
      tokenA: extendedAsset(zeroAsset(plan.tokenA.precision, plan.tokenA.symbol), plan.tokenA.contract),
      tokenB: extendedAsset(zeroAsset(plan.tokenB.precision, plan.tokenB.symbol), plan.tokenB.contract),
      sqrtPriceX64: plan.sqrtPriceX64,
      fee: plan.fee,
    },
  };
}

export function depositAction(tokenContract: string, issuer: string, quantity: string): ChainAction {
  return {
    account: tokenContract,
    name: "transfer",
    data: { from: issuer, to: SWAP_ALCOR, quantity, memo: "deposit" },
  };
}

export function addliquidAction(issuer: string, poolId: number, plan: LaunchPlan): ChainAction {
  return {
    account: SWAP_ALCOR,
    name: "addliquid",
    data: {
      poolId,
      owner: issuer,
      tokenADesired: plan.tokenADesired,
      tokenBDesired: plan.tokenBDesired,
      tickLower: plan.tickLower,
      tickUpper: plan.tickUpper,
      tokenAMin: plan.tokenAMin,
      tokenBMin: plan.tokenBMin,
      deadline: 0,
    },
  };
}

export function lockposAction(issuer: string, poolId: number, plan: LaunchPlan, unlockTime: number): ChainAction {
  return {
    account: SWAP_ALCOR,
    name: "lockpos",
    data: {
      poolId,
      owner: issuer,
      tickLower: plan.tickLower,
      tickUpper: plan.tickUpper,
      unlockTime,
    },
  };
}

export function liftoffAction(tokenContract: string, plan: LaunchPlan, poolId: number): ChainAction {
  return {
    account: tokenContract,
    name: "liftoff",
    data: {
      token_symbol: plan.launched.symbol,
      pool_id: poolId,
      tick_lower: plan.tickLower,
      tick_upper: plan.tickUpper,
    },
  };
}

export function activepoolTransfer(from: string, quantity: string, contract: string, poolId: number): ChainAction {
  return {
    account: contract || EOSIO_TOKEN,
    name: "transfer",
    data: { from, to: SWAP_ALCOR, quantity, memo: `activepool#${poolId}` },
  };
}

/** Quote → swap.alcor after liftoff in the same tx so the issuer fills first. Min out is 0. */
export function firstBuySwapAction(
  from: string,
  quoteQuantity: string,
  quoteContract: string,
  poolId: number,
  minOutAsset: string,
  tokenContract: string
): ChainAction {
  return {
    account: quoteContract || EOSIO_TOKEN,
    name: "transfer",
    data: {
      from,
      to: SWAP_ALCOR,
      quantity: quoteQuantity,
      memo: `swapexactin#${poolId}#${from}#${minOutAsset}@${tokenContract}#0`,
    },
  };
}

export function payoutAction(
  tokenContract: string,
  tokenSymbol: string,
  signer: string,
  role: "sender" | "keeper",
  rain: { rainMinHold?: number; rainMinPool?: number } = {}
): ChainAction {
  const min_hold = Math.max(0, Math.floor(Number(rain.rainMinHold) || 0));
  const min_pool = Math.max(0, Math.floor(Number(rain.rainMinPool) || 0));
  const who = role === "keeper" ? { keeper: signer } : { sender: signer };
  return {
    account: tokenContract,
    name: "makeitrain",
    data: {
      token_symbol: tokenSymbol,
      ...who,
      ...(min_hold > 0 || min_pool > 0 ? { min_hold, min_pool } : {}),
    },
  };
}

export function checklockAction(tokenContract: string, tokenSymbol: string): ChainAction {
  return {
    account: tokenContract,
    name: "checklock",
    data: { token_symbol: tokenSymbol },
  };
}

export function pullangelAction(tokenContract: string, tokenSymbol: string): ChainAction {
  return {
    account: tokenContract,
    name: "pullangel",
    data: { token_symbol: tokenSymbol },
  };
}

export function pulljackpotAction(tokenContract: string, tokenSymbol: string): ChainAction {
  return {
    account: tokenContract,
    name: "pulljackpot",
    data: { token_symbol: tokenSymbol },
  };
}

/** ABI `symbol` JSON form: `"4,FOO"`. */
export function abiSymbol(precision: number, code: string): string {
  return `${precision},${code}`;
}

export function ratiosAction(
  tokenContract: string,
  tokenSymbol: string,
  angelNumbersBps: number,
  jackpotBps: number
): ChainAction {
  return {
    account: tokenContract,
    name: "ratios",
    data: {
      token_symbol: tokenSymbol,
      angel_numbers_bps: angelNumbersBps,
      jackpot_bps: jackpotBps,
    },
  };
}

export function setdistAction(
  tokenContract: string,
  tokenSymbol: string,
  args: {
    angelNumbersBps: number;
    jackpotBps: number;
    jackpotWinners: number;
    jackpotMinHold: number;
    angelNumbersCooldown: number;
    keeperMin: number;
    reflectMin: number;
  }
): ChainAction {
  return {
    account: tokenContract,
    name: "setdist",
    data: {
      token_symbol: tokenSymbol,
      angel_numbers_bps: args.angelNumbersBps,
      jackpot_bps: args.jackpotBps,
      jackpot_winners: args.jackpotWinners,
      jackpot_min_hold: args.jackpotMinHold,
      angel_numbers_cooldown: args.angelNumbersCooldown,
      keeper_min: args.keeperMin,
      reflect_min: args.reflectMin,
    },
  };
}

export function setangelnumAction(
  tokenContract: string,
  owner: string,
  tokenSymbol: string,
  angelNumber: number
): ChainAction {
  return {
    account: tokenContract,
    name: "setangelnum",
    data: { owner, token_symbol: tokenSymbol, angel_number: angelNumber },
  };
}

export function addpoolAction(
  tokenContract: string,
  poolId: number,
  tokenSymbol: string,
  outputSymbol: string,
  outputContract: string
): ChainAction {
  return {
    account: tokenContract,
    name: "addpool",
    data: {
      pool_id: poolId,
      token_symbol: tokenSymbol,
      output_symbol: outputSymbol,
      output_contract: outputContract,
    },
  };
}

/** After liftoff: flexpools row for the launch pair. Example GEASY@fl3x: addpool(11525, "GEASY", "6,EASY", "mon3y"). */
export function addLaunchQuotePoolAction(
  tokenContract: string,
  poolId: number,
  tokenSymbol: string,
  quote: { precision: number; symbol: string; contract: string }
): ChainAction {
  return addpoolAction(
    tokenContract,
    poolId,
    tokenSymbol,
    abiSymbol(quote.precision, quote.symbol),
    quote.contract
  );
}

/** Empty `outputContract` clears reward → native (`flex_reward_pool_id = 0`). pid 0 pays the launch quote only if startlaunch set swap_underlying_default. */
export function chooserewardAction(
  tokenContract: string,
  owner: string,
  tokenSymbol: string,
  outputSymbol: string,
  outputContract: string
): ChainAction {
  return {
    account: tokenContract,
    name: "choosereward",
    data: {
      owner,
      token_symbol: tokenSymbol,
      output_symbol: outputSymbol,
      output_contract: outputContract,
    },
  };
}

/** Self may only pass `banStatus: true` (irreversible opt-out). */
export function feeoptoutAction(
  tokenContract: string,
  account: string,
  banStatus: boolean,
  tokenSymbol: string
): ChainAction {
  return {
    account: tokenContract,
    name: "feeoptout",
    data: { account, ban_status: banStatus, token_symbol: tokenSymbol },
  };
}

/** `rate` = bps of splash paid to beneficiary (0-10000). Empty beneficiary → self. */
export function inheritanceAction(
  tokenContract: string,
  flexer: string,
  beneficiary: string,
  rate: number,
  tokenSymbol: string
): ChainAction {
  return {
    account: tokenContract,
    name: "inheritance",
    data: { flexer, beneficiary, rate, token_symbol: tokenSymbol },
  };
}

export function inheritmemoAction(
  tokenContract: string,
  flexer: string,
  customMemo: string,
  tokenSymbol: string
): ChainAction {
  return {
    account: tokenContract,
    name: "inheritmemo",
    data: { flexer, custom_memo: customMemo, token_symbol: tokenSymbol },
  };
}

/** easyflex / complexflex only (live 3asy / fl3x). flexforex uses setdist. */
export function setminAction(tokenContract: string, tokenSymbol: string, reflectMin: number): ChainAction {
  return {
    account: tokenContract,
    name: "setmin",
    data: { token_symbol: tokenSymbol, reflect_min: reflectMin },
  };
}

/** Modes: 0 freeze, 1-3 insider window (UI uses 0 or 1). */
export type SetPresaleArgs = {
  launchTime: number;
  insiderTime: number;
  mode: number;
  insiderBps: number;
  lockedInsiderBps: number;
  collection?: string;
  schema?: string;
  nftMin?: number;
  minTokenQuantity?: string;
  minTokenContract?: string;
  lpMin?: number;
  lockedLpMin?: number;
  lockSecs?: number;
};

export function setpresaleAction(tokenContract: string, tokenSymbol: string, args: SetPresaleArgs): ChainAction {
  const minQty = (args.minTokenQuantity || "").trim();
  const minContract = (args.minTokenContract || "").trim();
  return {
    account: tokenContract,
    name: "setpresale",
    data: {
      token_symbol: tokenSymbol,
      launch_time: Math.max(0, Math.floor(args.launchTime)),
      insider_time: Math.max(0, Math.floor(args.insiderTime)),
      mode: Math.max(0, Math.min(3, Math.floor(args.mode))),
      insider_bps: Math.max(0, Math.min(10000, Math.floor(args.insiderBps))),
      locked_insider_bps: Math.max(0, Math.min(10000, Math.floor(args.lockedInsiderBps))),
      collection: (args.collection || "").trim() || "",
      schema: (args.schema || "").trim() || "",
      nft_min: Math.max(0, Math.floor(args.nftMin ?? 0)),
      min_token: extendedAsset(minQty || "0.0000 FOO", minContract || tokenContract),
      lp_min: Math.max(0, Math.floor(args.lpMin ?? 0)),
      locked_lp_min: Math.max(0, Math.floor(args.lockedLpMin ?? 0)),
      lock_secs: Math.max(0, Math.floor(args.lockSecs ?? 0)),
    },
  };
}

export function setlaunchtimeAction(
  tokenContract: string,
  tokenSymbol: string,
  launchTime?: number | null,
  insiderTime?: number | null
): ChainAction {
  const data: Record<string, unknown> = { token_symbol: tokenSymbol };
  if (launchTime != null && Number.isFinite(launchTime)) data.launch_time = Math.floor(launchTime);
  if (insiderTime != null && Number.isFinite(insiderTime)) data.insider_time = Math.floor(insiderTime);
  return { account: tokenContract, name: "setlaunchtime", data };
}

export function addinsidersAction(tokenContract: string, tokenSymbol: string, accounts: string): ChainAction {
  return {
    account: tokenContract,
    name: "addinsiders",
    data: { token_symbol: tokenSymbol, accounts },
  };
}

export function reginsiderAction(tokenContract: string, owner: string, tokenSymbol: string): ChainAction {
  return {
    account: tokenContract,
    name: "reginsider",
    data: { owner, token_symbol: tokenSymbol },
  };
}

export function rminsiderAction(tokenContract: string, account: string, tokenSymbol: string): ChainAction {
  return {
    account: tokenContract,
    name: "rminsider",
    data: { account, token_symbol: tokenSymbol },
  };
}

export function provelockAction(
  tokenContract: string,
  owner: string,
  tokenSymbol: string,
  poolId: number,
  positionId: number
): ChainAction {
  return {
    account: tokenContract,
    name: "provelock",
    data: {
      owner,
      token_symbol: tokenSymbol,
      pool_id: poolId,
      position_id: positionId,
    },
  };
}

export function goliveAction(tokenContract: string, tokenSymbol: string): ChainAction {
  return {
    account: tokenContract,
    name: "golive",
    data: { token_symbol: tokenSymbol },
  };
}

/** Cap in raw units: supply * bps / 10000. Uses locked_insider_bps when locked_pos is set. */
export function presaleCapRaw(supplyRaw: number, insiderBps: number, lockedInsiderBps: number, lockedPos: number): number {
  const bps = lockedPos > 0 && lockedInsiderBps > 0 ? lockedInsiderBps : insiderBps;
  if (!bps || supplyRaw <= 0) return 0;
  return Math.floor((supplyRaw * bps) / 10000);
}
