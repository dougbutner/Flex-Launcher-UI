import {
  CONTRACT_RAM_QUANT,
  EOSIO,
  EOSIO_TOKEN,
  FLEXFOREX_CONTRACT,
  SWAP_ALCOR,
} from "@/config/launch";
import { extendedAsset, zeroAsset } from "@/services/assets";
import type { LaunchPlan } from "@/services/launchMath";

export type ChainAction = {
  account: string;
  name: string;
  data: Record<string, unknown>;
  authorization?: Array<{ actor: string; permission: string }>;
};

export function buyContractRam(payer: string): ChainAction {
  return {
    account: EOSIO,
    name: "buyram",
    data: { payer, receiver: FLEXFOREX_CONTRACT, quant: CONTRACT_RAM_QUANT },
  };
}

export function forgeAction(issuer: string, maximumSupply: string): ChainAction {
  return {
    account: FLEXFOREX_CONTRACT,
    name: "forge",
    data: { issuer, maximum_supply: maximumSupply },
  };
}

export function mintAction(issuer: string, quantity: string): ChainAction {
  return {
    account: FLEXFOREX_CONTRACT,
    name: "mint",
    data: { to: issuer, quantity, memo: "initial supply" },
  };
}

export function reglaunchAction(plan: LaunchPlan, proofPoolId: number): ChainAction {
  return {
    account: FLEXFOREX_CONTRACT,
    name: "reglaunch",
    data: {
      token_symbol: plan.launched.symbol,
      quote: extendedAsset(plan.quoteZero, plan.quote.contract),
      fee: plan.fee,
      tick_lower: plan.tickLower,
      tick_upper: plan.tickUpper,
      sqrt_price_x64: plan.sqrtPriceX64,
      proof_pool_id: proofPoolId,
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

export function depositAction(issuer: string, quantity: string): ChainAction {
  return {
    account: FLEXFOREX_CONTRACT,
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

export function stampAction(plan: LaunchPlan, poolId: number): ChainAction {
  return {
    account: FLEXFOREX_CONTRACT,
    name: "stamp",
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

/** keeper collects the optional crank tip (contract requires its auth when keeper_min > 0). */
export function reflectAction(tokenSymbol: string, keeper: string): ChainAction {
  return {
    account: FLEXFOREX_CONTRACT,
    name: "reflect",
    data: { token_symbol: tokenSymbol, keeper },
  };
}
