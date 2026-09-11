import { CHAIN_ENDPOINTS } from "@/services/walletConstants";

export type FlexProgram = "easyflex" | "complexflex" | "flexforex";

export const FLEXFOREX_CONTRACT = import.meta.env.VITE_FLEXFOREX_CONTRACT?.trim() || "for3x";
export const EASYFLEX_CONTRACT = import.meta.env.VITE_EASYFLEX?.trim() || "3asy";
export const COMPLEXFLEX_CONTRACT = import.meta.env.VITE_COMPLEXFLEX?.trim() || "fl3x";
export const SWAP_ALCOR = import.meta.env.VITE_SWAP_ALCOR?.trim() || "swap.alcor";

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
    title: "easyflex",
    blurb: "Simple reflections + burn. Issue supply. No inheritance or luck.",
    supply: "issue",
    payoutSigner: "sender",
    launchEasyMin: 5_000,
    /** C++ makeitrain denom excludes these accounts (not the program contract). */
    vaults: ["alcor", MON3Y, SWAP_ALCOR],
  },
  {
    id: "complexflex",
    title: "complexflex",
    blurb: "Reflections + project tax + inheritance. Grams-style.",
    supply: "mint",
    payoutSigner: "sender",
    launchEasyMin: 10_000,
    vaults: ["alcor", "gold.mon3y", SWAP_ALCOR],
  },
  {
    id: "flexforex",
    title: "flexforex",
    blurb: "Full stack: inheritance, angel numbers, jackpot, optional keeper.",
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
  return `Hold ${amount.toLocaleString()} EASY to launch`;
}

/** First promo month starts 2026-09-09 00:00 UTC. 90% off, then -10% every 30 days until 0. */
export const EASY_HOLD_PROMO_START_SEC = 1_788_912_000;
const PROMO_MONTH_SECS = 30 * 86_400;

export function easyHoldOffPercent(nowMs = Date.now()): number {
  const nowSec = Math.floor(nowMs / 1000);
  if (nowSec < EASY_HOLD_PROMO_START_SEC) return 90;
  const months = Math.floor((nowSec - EASY_HOLD_PROMO_START_SEC) / PROMO_MONTH_SECS);
  return Math.max(0, 90 - 10 * months);
}

export function easyHoldNeed(baseWhole: number, prior = 0, nowMs = Date.now()): number {
  const full = baseWhole * (prior + 1);
  return (full * (100 - easyHoldOffPercent(nowMs))) / 100;
}

export function easyHoldPromoCopy(nowMs = Date.now()): string | null {
  const off = easyHoldOffPercent(nowMs);
  if (off <= 0) return null;
  return `Hold EASY, don't spend it. ${off}% off this month. -10%/mo until full price.`;
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

export const LOCK_MIN_SECONDS = 7_776_000;
export const LOCK_MIN_DAYS = 90;
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

export type QuotePreset = {
  id: "easy" | "won" | "grams" | "meme" | "xpr" | "xmd" | "loan" | "xtoken";
  symbol: string;
  contract: string;
  precision: number;
  priceLower: string;
  priceUpper: string;
  /** Flex quotes: 0% skim, no proof pool. Else: 0.5% skim + proof pool vs XUSDC/XPR. */
  flexQuote: boolean;
  label: string;
};

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

export function alcorSwapUrl(quoteSymbol: string, quoteContract: string, tokenSymbol: string, tokenContract: string) {
  const input = `${quoteSymbol.toLowerCase()}-${quoteContract}`;
  const output = `${tokenSymbol.toLowerCase()}-${tokenContract}`;
  return `${ALCOR_SWAP}?input=${encodeURIComponent(input)}&output=${encodeURIComponent(output)}`;
}

export function tickSpacing(fee: number) {
  return FEE_TIERS.find((t) => t.fee === fee)?.spacing ?? 60;
}
