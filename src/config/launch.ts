import { CHAIN_ENDPOINTS } from "@/services/walletConstants";

export type FlexProgram = "easyflex" | "complexflex" | "flexforex";

export const FLEXFOREX_CONTRACT =
  import.meta.env.VITE_FLEXFOREX_CONTRACT?.trim() || "flexforex";
export const EASYFLEX_CONTRACT = import.meta.env.VITE_EASYFLEX?.trim() || "easyflex";
export const COMPLEXFLEX_CONTRACT = import.meta.env.VITE_COMPLEXFLEX?.trim() || "complexflex";
export const SWAP_ALCOR = import.meta.env.VITE_SWAP_ALCOR?.trim() || "swap.alcor";

/** Hardcoded in all three contracts as MON3Y — liftoff reads EASY here, not VITE_EASYFLEX. */
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
    blurb: "Simple reflections + burn. Issue supply. No inheritance or luck. Hold 5,000 EASY to launch.",
    supply: "issue",
    payoutSigner: "sender",
    launchEasyMin: 5_000,
    vaults: ["alcor", EASYFLEX_CONTRACT, SWAP_ALCOR],
  },
  {
    id: "complexflex",
    title: "complexflex",
    blurb: "Reflections + project tax + inheritance. Grams-style. Hold 10,000 EASY to launch.",
    supply: "mint",
    payoutSigner: "sender",
    launchEasyMin: 10_000,
    vaults: ["alcor", COMPLEXFLEX_CONTRACT, SWAP_ALCOR],
  },
  {
    id: "flexforex",
    title: "flexforex",
    blurb: "Full stack: inheritance, angel numbers, jackpot, optional keeper. Hold 50,000 EASY to launch.",
    supply: "mint",
    payoutSigner: "keeper",
    launchEasyMin: 50_000,
    vaults: ["alcor", COMPLEXFLEX_CONTRACT, SWAP_ALCOR],
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

export function holdEasyToLaunch(amount: number) {
  return `Hold ${amount.toLocaleString()} EASY to launch`;
}

export function allFlexAccounts(): string[] {
  return [...new Set(FLEX_PROGRAMS.map((p) => flexAccount(p.id)))];
}

export const EOSIO_TOKEN = "eosio.token";
export const XTOKENS = "xtokens";
export const XPR_SYMBOL = "XPR";
export const XPR_PRECISION = 4;
export const XUSDC_SYMBOL = "XUSDC";

export const EXPLORER = "https://testnet.explorer.xprnetwork.org";
export const FAUCET_URL = "https://resources.xprnetwork.org/faucet";
export const XPR_TESTNET_CHAIN_ID = "71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd";
export const TESTNET_PROOF_XTOKEN = "FOOBAR";
export const TESTNET_PROOF_POOL_ID = "0";

export const LOCK_MIN_SECONDS = 7_776_000;
export const LOCK_MIN_DAYS = 90;

export const ALCOR_MIN_TICK = -443636;
export const ALCOR_MAX_TICK = 443636;

export const FEE_TIERS = [
  { fee: 500, spacing: 10, label: "0.05%" },
  { fee: 3000, spacing: 60, label: "0.30%" },
  { fee: 10000, spacing: 200, label: "1.00%" },
] as const;

export type FeeTier = (typeof FEE_TIERS)[number]["fee"];

export type QuotePreset = {
  id: "easy" | "won" | "grams" | "meme" | "xtoken";
  symbol: string;
  contract: string;
  precision: number;
  priceLower: string;
  priceUpper: string;
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
    id: "xtoken",
    symbol: "FOOBAR",
    contract: XTOKENS,
    precision: 6,
    priceLower: "0.000001",
    priceUpper: "1000000",
    flexQuote: false,
    label: "xtoken",
  },
];

export const RPC_ENDPOINTS = [...CHAIN_ENDPOINTS];

export const HYPERION_ENDPOINTS = [
  "https://test.proton.eosusa.io",
  "https://api-xprnetwork-test.saltant.io",
];

export function explorerAccount(name: string) {
  return `${EXPLORER}/account/${name}`;
}

export function explorerTx(id: string) {
  return `${EXPLORER}/transaction/${id}`;
}

export function alcorSwapUrl(_quoteSymbol: string, _quoteContract: string, _tokenSymbol: string, tokenContract: string) {
  return explorerAccount(tokenContract);
}

export function tickSpacing(fee: number) {
  return FEE_TIERS.find((t) => t.fee === fee)?.spacing ?? 60;
}
