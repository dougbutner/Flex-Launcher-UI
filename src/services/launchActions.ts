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

export function payoutAction(
  tokenContract: string,
  tokenSymbol: string,
  signer: string,
  role: "sender" | "keeper"
): ChainAction {
  return {
    account: tokenContract,
    name: "makeitrain",
    data: role === "keeper" ? { token_symbol: tokenSymbol, keeper: signer } : { token_symbol: tokenSymbol, sender: signer },
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
