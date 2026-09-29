import { CHAIN_ENDPOINTS } from "@/services/walletConstants";

export type FlexProgram = "easyflex" | "complexflex" | "flexforex";

const viteEnv = import.meta.env as
  | {
      VITE_FLEXFOREX_CONTRACT?: string;
      VITE_EASYFLEX?: string;
      VITE_COMPLEXFLEX?: string;
      VITE_SWAP_ALCOR?: string;
    }
  | undefined;

export const FLEXFOREX_CONTRACT = viteEnv?.VITE_FLEXFOREX_CONTRACT?.trim() || "for3x";
export const EASYFLEX_CONTRACT = viteEnv?.VITE_EASYFLEX?.trim() || "3asy";
export const COMPLEXFLEX_CONTRACT = viteEnv?.VITE_COMPLEXFLEX?.trim() || "fl3x";
export const SWAP_ALCOR = viteEnv?.VITE_SWAP_ALCOR?.trim() || "swap.alcor";

/** Hardcoded in all three contracts as MON3Y - liftoff reads EASY here, not VITE_EASYFLEX. */
export const MON3Y = "mon3y";
export const EASY_SYMBOL = "EASY";
export const EASY_PRECISION = 6;

export const FLEX_PROGRAMS: Array<{
  id: FlexProgram;
  title: string;
  blurb: string;
  supply: "issue" | "mint";
  payoutSigner: "sender" | "keeper";
  launchEasyMin: number;
  vaults: string[];
}> = [
  {
    id: "easyflex",
    title: EASYFLEX_CONTRACT,
    blurb: "Simple reflections (rains) + burn. No inheritance, jackpot or luck.",
    supply: "issue",
    payoutSigner: "sender",
    launchEasyMin: 5_000,
    /** C++ makeitrain denom excludes these accounts (not the program contract). */
    vaults: ["alcor", MON3Y, SWAP_ALCOR],
  },
  {
    id: "complexflex",
    title: COMPLEXFLEX_CONTRACT,
    blurb: "Reflections + project tax + inheritance of rain to others.",
    supply: "mint",
    payoutSigner: "sender",
    launchEasyMin: 10_000,
    vaults: ["alcor", "gold.mon3y", SWAP_ALCOR],
  },
  {
    id: "flexforex",
    title: FLEXFOREX_CONTRACT,
    blurb: "Full stack: inheritance, angel numbers, jackpot, optionally pay whoever sends out reflections.",
    supply: "mint",
    payoutSigner: "keeper",
    launchEasyMin: 50_000,
    vaults: ["alcor", "gold.mon3y", SWAP_ALCOR],
  },
];

export function flexAccount(program: FlexProgram): string {
  if (program === "easyflex") return EASYFLEX_CONTRACT;
  if (program === "complexflex") return COMPLEXFLEX_CONTRACT;
  return FLEXFOREX_CONTRACT;
}

export function flexMeta(program: FlexProgram) {
  return FLEX_PROGRAMS.find((p) => p.id === program) ?? FLEX_PROGRAMS[2];
}

/** Resolve program from a live contract account (env-aware). */
export function programFromAccount(code: string): FlexProgram | null {
  for (const p of FLEX_PROGRAMS) {
    if (flexAccount(p.id) === code) return p.id;
  }
  return null;
}

export function hasAngelChannels(program: FlexProgram): boolean {
  return program === "flexforex";
}

export function hasInheritance(program: FlexProgram): boolean {
  return program === "complexflex" || program === "flexforex";
}

/** Live 3asy / fl3x ABI: issuer `setmin`. for3x uses `setdist.reflect_min` instead. */
export function hasSetmin(program: FlexProgram): boolean {
  return program === "easyflex" || program === "complexflex";
}

export function holdEasyToLaunch(amount: number) {
  if (amount <= 0) return "No EASY hold";
  return `Hold ${amount.toLocaleString()} EASY to launch`;
}

/** Flex quote pairs that get the early-user EASY hold discount (UI gate). */
export const FLEX_QUOTE_HOLD_LABEL = "EASY, WON, GRAMS, or MEME";

/** First promo month starts 2026-09-09 00:00 UTC. 90% off, then -10% every 30 days until 0. */
export const EASY_HOLD_PROMO_START_SEC = 1_788_912_000;
const PROMO_MONTH_SECS = 30 * 86_400;

export function easyHoldOffPercent(nowMs = Date.now()): number {
  const nowSec = Math.floor(nowMs / 1000);
  if (nowSec < EASY_HOLD_PROMO_START_SEC) return 90;
  const months = Math.floor((nowSec - EASY_HOLD_PROMO_START_SEC) / PROMO_MONTH_SECS);
  return Math.max(0, 90 - 10 * months);
}

/** Full EASY hold before the promo (base × prior+1). */
export function easyHoldFull(baseWhole: number, prior = 0): number {
  return baseWhole * (prior + 1);
}

/** How liftoff prices the EASY hold. `true` is flex, `false` is other. */
export type HoldKind = "flex" | "geasy" | "other";

export function holdKindOf(quoteId: string, flexQuote: boolean): HoldKind {
  if (quoteId === "geasy") return "geasy";
  return flexQuote ? "flex" : "other";
}

export function holdKindFromQuote(symbol: string, contract: string): HoldKind {
  if (symbol === "GEASY" && contract === COMPLEXFLEX_CONTRACT) return "geasy";
  if (isFlexQuoteToken(symbol, contract)) return "flex";
  return "other";
}

/** GEASY@fl3x is a flex quote on every program. A verified first launch waives the EASY hold. */
export function geasyQuoteAllowed(_program: FlexProgram): boolean {
  return true;
}

/**
 * EASY hold liftoff checks, whole tokens.
 * Flex quotes (EASY, WON, GRAMS, MEME) stay at 90% off.
 * GEASY is 0 on the first launch when `verified`. Later GEASY launches use the monthly promo.
 * Other quotes use only the monthly promo: 90% off from 2026-09-09, then 10 points less every 30 days.
 */
export function easyHoldNeed(
  baseWhole: number,
  prior = 0,
  nowMs = Date.now(),
  quote: boolean | HoldKind = "flex",
  verified = true,
): number {
  const kind: HoldKind = quote === true ? "flex" : quote === false ? "other" : quote;
  if (kind === "geasy" && prior === 0 && verified) return 0;
  const full = easyHoldFull(baseWhole, prior);
  let off = easyHoldOffPercent(nowMs);
  if (kind === "flex") off = 90;
  return Math.floor((full * (100 - off)) / 100);
}

export function easyHoldPromoCopy(nowMs = Date.now()): string | null {
  const off = easyHoldOffPercent(nowMs);
  const other =
    off > 0
      ? `XPR, XMD, LOAN, and xtokens are ${off}% off the EASY hold this month.`
      : "XPR, XMD, LOAN, and xtokens are at the full EASY hold.";
  return `EASY, WON, GRAMS, and MEME always use the 10% EASY hold, not the full hold. That price does not rise. GEASY on 3asy, fl3x, and for3x has no EASY hold on a verified first launch. ${other}`;
}

/**
 * Kept so older call sites compile. The promo is the same for every backing,
 * so there is no cheaper Flex-pair alternative to suggest.
 */
export function easyHoldFlexAltTip(_args: {
  easyBal: number;
  fullNeed: number;
  flexNeed: number;
}): string | null {
  return null;
}

export function allFlexAccounts(): string[] {
  return [...new Set(FLEX_PROGRAMS.map((p) => flexAccount(p.id)))];
}

export function isFlexContractActor(actor: string | null | undefined): boolean {
  if (!actor) return false;
  return allFlexAccounts().includes(actor);
}

export const EOSIO_TOKEN = "eosio.token";
export const XTOKENS = "xtokens";
export const XMD_TOKEN = "xmd.token";
export const LOAN_TOKEN = "loan.token";
export const XPR_SYMBOL = "XPR";
export const XPR_PRECISION = 4;
export const XUSDC_SYMBOL = "XUSDC";
export const XMD_SYMBOL = "XMD";
export const LOAN_SYMBOL = "LOAN";

export const EXPLORER = "https://explorer.xprnetwork.org";
export const ALCOR_SWAP = "https://alcor.exchange/v/xpr/swap";
export const ALCOR_SWAP_WIDGET = "https://alcor.exchange/v/xpr/swap-widget";
export const ALCOR_CHART_WIDGET = "https://alcor.exchange/v/xpr/chart-widget";
export const ALCOR_ANALYTICS = "https://alcor.exchange/v/xpr/analytics/tokens";

export const LOCK_MIN_SECONDS = 7_776_000;
/** On-chain remaining lock. The wizard asks for one extra day so a 90-day pick does not fail later. */
export const LOCK_MIN_DAYS = 90;
export const LOCK_UI_MIN_DAYS = 91;
/** Default slider end. Typing a larger day count stretches this, up to EOSIO_MAX_TIME_SEC. */
export const LOCK_SLIDER_MAX_DAYS = 730;
/** uint32 / time_point_sec max. 2106-02-07T06:28:15Z. Alcor lockpos.unlockTime. */
export const EOSIO_MAX_TIME_SEC = 4_294_967_295;

export const ALCOR_MIN_TICK = -443636;
export const ALCOR_MAX_TICK = 443636;

export const FEE_TIERS = [
  { fee: 500, spacing: 10, label: "0.05%" },
  { fee: 3000, spacing: 60, label: "0.30%" },
  { fee: 10000, spacing: 200, label: "1.00%" },
] as const;

export type FeeTier = (typeof FEE_TIERS)[number]["fee"];

/** One-sided launch width presets (quote-per-token max / start). */
export const RANGE_WIDTH_PRESETS = [
  {
    id: "slow",
    label: "Slow",
    title: "100x range. Price walks from start to 100x start. Steeper curve, sells out sooner.",
    kind: "mult" as const,
    mult: 100,
  },
  {
    id: "easy",
    label: "EASY",
    title: "10 million x range. Very wide band from start to 10,000,000x start.",
    kind: "mult" as const,
    mult: 10_000_000,
  },
  {
    id: "fast",
    label: "Fast",
    title: "No cap. Buyers can keep paying more.",
    kind: "inf" as const,
    mult: null,
  },
] as const;

export type RangeWidthId = (typeof RANGE_WIDTH_PRESETS)[number]["id"];

/** Start FDV presets (USD). Only rewrite priceLower. */
export const START_MCAP_PRESETS = [
  { id: "10k", usd: 10_000, label: "$10k" },
  { id: "100k", usd: 100_000, label: "$100k" },
  { id: "1m", usd: 1_000_000, label: "$1M" },
] as const;

export const START_MCAP_MORE_ROWS = [
  [
    { id: "1k", usd: 1_000, label: "$1k" },
    { id: "10k", usd: 10_000, label: "$10k" },
    { id: "100k", usd: 100_000, label: "$100k" },
  ],
  [
    { id: "10k", usd: 10_000, label: "$10k" },
    { id: "100k", usd: 100_000, label: "$100k" },
    { id: "1m", usd: 1_000_000, label: "$1M" },
  ],
  [
    { id: "500k", usd: 500_000, label: "$500k" },
    { id: "5m", usd: 5_000_000, label: "$5M" },
    { id: "10m", usd: 10_000_000, label: "$10M" },
  ],
] as const;

export type QuotePreset = {
  id: "easy" | "won" | "grams" | "meme" | "geasy" | "xpr" | "xmd" | "loan" | "metal" | "xtoken";
  symbol: string;
  contract: string;
  precision: number;
  priceLower: string;
  priceUpper: string;
  /** Flex quotes: 0% skim, no proof pool. Else: 0.5% skim (1% after the LP unlock) + proof pool vs XUSDC/XPR. */
  flexQuote: boolean;
  label: string;
};

/** Core project tokens (not 3asy / fl3x / for3x launches). Rain actions match live ABIs. */
export const PROJECT_CORE_TOKENS = [
  { symbol: "EASY", contract: MON3Y, rainAction: "distribute" as const },
  { symbol: "WON", contract: "w3won", rainAction: "radiate" as const },
  { symbol: "GRAMS", contract: "gold.mon3y", rainAction: "reflect" as const },
  { symbol: "MEME", contract: "m3m3", rainAction: "distribute" as const },
] as const;

/** True when quote is a flex quote (0% skim, proof id 0), including GEASY@fl3x. */
export function isFlexQuoteToken(symbol: string, contract: string): boolean {
  if (symbol === "GEASY" && contract === COMPLEXFLEX_CONTRACT) return true;
  return PROJECT_CORE_TOKENS.some((t) => t.symbol === symbol && t.contract === contract);
}

/** Flex-quote contracts match C++ (`mon3y` / `w3won` / `m3m3` / `gold.mon3y`), not VITE_EASYFLEX. */
export const QUOTE_PRESETS: QuotePreset[] = [
  {
    id: "easy",
    symbol: "EASY",
    contract: MON3Y,
    precision: 6,
    priceLower: "0.000001",
    priceUpper: "1000000",
    flexQuote: true,
    label: "EASY",
  },
  {
    id: "won",
    symbol: "WON",
    contract: "w3won",
    precision: 6,
    priceLower: "1",
    priceUpper: "10000",
    flexQuote: true,
    label: "WON",
  },
  {
    id: "grams",
    symbol: "GRAMS",
    contract: "gold.mon3y",
    precision: 6,
    priceLower: "1",
    priceUpper: "1000",
    flexQuote: true,
    label: "GRAMS",
  },
  {
    id: "meme",
    symbol: "MEME",
    contract: "m3m3",
    precision: 4,
    priceLower: "1",
    priceUpper: "100000000000",
    flexQuote: true,
    label: "MEME",
  },
  {
    id: "geasy",
    symbol: "GEASY",
    contract: COMPLEXFLEX_CONTRACT,
    precision: 6,
    priceLower: "0.000001",
    priceUpper: "1000000",
    flexQuote: true,
    label: "GEASY",
  },
  {
    id: "xpr",
    symbol: XPR_SYMBOL,
    contract: EOSIO_TOKEN,
    precision: XPR_PRECISION,
    priceLower: "0.0001",
    priceUpper: "1000000",
    flexQuote: false,
    label: "XPR",
  },
  {
    id: "xmd",
    symbol: XMD_SYMBOL,
    contract: XMD_TOKEN,
    precision: 6,
    priceLower: "0.000001",
    priceUpper: "1000000",
    flexQuote: false,
    label: "XMD",
  },
  {
    id: "loan",
    symbol: LOAN_SYMBOL,
    contract: LOAN_TOKEN,
    precision: 4,
    priceLower: "0.0001",
    priceUpper: "1000000",
    flexQuote: false,
    label: "LOAN",
  },
  {
    id: "metal",
    symbol: "METAL",
    contract: XTOKENS,
    precision: 8,
    priceLower: "0.000001",
    priceUpper: "100000",
    flexQuote: false,
    label: "METAL",
  },
  {
    id: "xtoken",
    symbol: XUSDC_SYMBOL,
    contract: XTOKENS,
    precision: 6,
    priceLower: "0.000001",
    priceUpper: "1000000",
    flexQuote: false,
    label: "xtoken",
  },
];

/** Non-flex quotes need a non-zero Alcor proof pool (C++ `check(xtoken_proof_pool_id)`). */
export function quoteNeedsProof(preset: QuotePreset | undefined): boolean {
  return Boolean(preset && !preset.flexQuote);
}

export const RPC_ENDPOINTS = [...CHAIN_ENDPOINTS];

export const HYPERION_ENDPOINTS = ["https://proton.eosusa.io"];

export function explorerAccount(name: string) {
  return `${EXPLORER}/account/${name}`;
}

export function explorerTx(id: string) {
  return `${EXPLORER}/transaction/${id}`;
}

/** Alcor UI token id: `symbol-contract` (lowercase). */
export function alcorTokenId(symbol: string, contract: string) {
  return `${symbol.toLowerCase()}-${contract.toLowerCase()}`;
}

export function alcorSwapUrl(quoteSymbol: string, quoteContract: string, tokenSymbol: string, tokenContract: string) {
  const input = alcorTokenId(quoteSymbol, quoteContract);
  const output = alcorTokenId(tokenSymbol, tokenContract);
  return `${ALCOR_SWAP}?input=${encodeURIComponent(input)}&output=${encodeURIComponent(output)}`;
}

export function alcorSwapWidgetUrl(quoteSymbol: string, quoteContract: string, tokenSymbol: string, tokenContract: string) {
  const input = alcorTokenId(quoteSymbol, quoteContract);
  const output = alcorTokenId(tokenSymbol, tokenContract);
  return `${ALCOR_SWAP_WIDGET}?input=${encodeURIComponent(input)}&output=${encodeURIComponent(output)}`;
}

export function alcorChartWidgetUrl(
  quoteSymbol: string,
  quoteContract: string,
  tokenSymbol: string,
  tokenContract: string,
  poolId = 0
) {
  const input = alcorTokenId(quoteSymbol, quoteContract);
  const output = alcorTokenId(tokenSymbol, tokenContract);
  const base = `${ALCOR_CHART_WIDGET}?input=${encodeURIComponent(input)}&output=${encodeURIComponent(output)}`;
  return poolId > 0 ? `${base}&pool=${poolId}` : base;
}

export function alcorAnalyticsUrl(symbol: string, contract: string) {
  return `${ALCOR_ANALYTICS}/${encodeURIComponent(alcorTokenId(symbol, contract))}`;
}

export function tickSpacing(fee: number) {
  return FEE_TIERS.find((t) => t.fee === fee)?.spacing ?? 60;
}
