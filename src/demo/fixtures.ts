import type { FlexProgram } from "@/config/launch";
import { FLEXFOREX_CONTRACT } from "@/config/launch";

/** Faux actor used on /preview so every manage panel paints. */
export const PREVIEW_ACTOR = "aliceflex";

export const PREVIEW_SYMBOL = "DEMO";
export const PREVIEW_PRECISION = 6;
export const PREVIEW_PROGRAM: FlexProgram = "flexforex";
export const PREVIEW_CONTRACT = FLEXFOREX_CONTRACT;

export const previewLaunch: Record<string, unknown> = {
  token_symbol: PREVIEW_SYMBOL,
  quote: { quantity: "0.000000 EASY", contract: "mon3y" },
  launched: true,
  pure_liquid_alcor_pool_id: 2142,
  swap_underlying_default: true,
  unlock_time: Math.floor(Date.now() / 1000) + 7_776_000,
  dev_bps: 25,
  club_bps: 25,
};

export const previewStat: Record<string, unknown> = {
  supply: "1000000.000000 DEMO",
  issuer: PREVIEW_ACTOR,
  reflection_pool: "12840.250000 DEMO",
  angel_numbers_pool: "420.000000 DEMO",
  jackpot_pool: "880.500000 DEMO",
};

export const previewSettings: Record<string, unknown> = {
  token_symbol: `${PREVIEW_PRECISION},${PREVIEW_SYMBOL}`,
  reflection_rate: 100,
  burn_rate: 0,
  project_rate: 100,
  project_account: PREVIEW_ACTOR,
  angel_numbers_bps: 1000,
  jackpot_bps: 500,
  dist_locked: false,
  jackpot_winners: 3,
  jackpot_min_hold: 0,
  angel_numbers_cooldown: 86400,
  keeper_min: 0,
  reflect_min: 0,
};

export const previewPools: Record<string, unknown>[] = [
  {
    id: 2142,
    output_symbol: "6,EASY",
    output_contract: "mon3y",
  },
  {
    id: 3001,
    output_symbol: "4,XPR",
    output_contract: "eosio.token",
  },
];

export const previewFlexer: Record<string, unknown> = {
  owner: PREVIEW_ACTOR,
  balance: "12500.000000 DEMO",
  fee_opted_out: false,
  flex_reward_pool_id: 2142,
  angel_number: 42,
  beneficiary: "bobflex",
  bene_rate: 2500,
  custom_memo: "Thanks @@ for $$ **",
};

export const previewHolding = {
  key: `${PREVIEW_CONTRACT}:${PREVIEW_SYMBOL}`,
  program: PREVIEW_PROGRAM,
  contract: PREVIEW_CONTRACT,
  symbol: PREVIEW_SYMBOL,
  precision: PREVIEW_PRECISION,
  quoteSymbol: "EASY",
  quoteContract: "mon3y",
  swapUnderlyingDefault: true,
  balance: 12500,
  flexer: previewFlexer,
  reflectionPool: 12840.25,
  angelPool: 420,
  jackpotPool: 880.5,
  estSplash: 61.2,
};

export const previewIssued = {
  key: `${PREVIEW_CONTRACT}:${PREVIEW_SYMBOL}`,
  program: PREVIEW_PROGRAM,
  contract: PREVIEW_CONTRACT,
  symbol: PREVIEW_SYMBOL,
  launched: true,
};

export const previewFlexers: Record<string, unknown>[] = [
  { owner: "topflexer", balance: "50000.000000 DEMO" },
  { owner: PREVIEW_ACTOR, balance: "12500.000000 DEMO" },
  { owner: "charlie", balance: "3200.000000 DEMO" },
];
