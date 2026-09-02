import { CHAIN_ENDPOINTS } from "@/services/walletConstants";

export const FLEXFOREX_CONTRACT =
  import.meta.env.VITE_FLEXFOREX_CONTRACT?.trim() || "flex.mon3y";

export const SWAP_ALCOR = "swap.alcor";
export const EOSIO = "eosio";
export const EOSIO_TOKEN = "eosio.token";
export const XTOKENS = "xtokens";
export const XPR_SYMBOL = "XPR";
export const XPR_PRECISION = 4;
export const XUSDC_SYMBOL = "XUSDC";

export const EXPLORER = "https://explorer.xprnetwork.org";
export const ALCOR_UI = "https://alcor.exchange/v/xpr";
export const ALCOR_API = "https://proton.alcor.exchange/api/v2";

export const CONTRACT_RAM_XPR = 5000;
export const CONTRACT_RAM_QUANT = "5000.0000 XPR";
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

/** Live mainnet precisions (get_currency_stats). Caps from UI-LAUNCH.md. */
export const QUOTE_PRESETS: QuotePreset[] = [
  {
    id: "easy",
    symbol: "EASY",
    contract: "mon3y",
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
    symbol: "XUSDC",
    contract: XTOKENS,
    precision: 6,
    priceLower: "0.000001",
    priceUpper: "1000000",
    flexQuote: false,
    label: "xtoken",
  },
];

export const RPC_ENDPOINTS = [...CHAIN_ENDPOINTS, "https://proton.eosusa.io"];

export const HYPERION_ENDPOINTS = [
  "https://proton.eosusa.io",
  "https://proton.protonuk.io",
  "https://proton-api.eosiomadrid.io",
  "https://api-xprnetwork-main.saltant.io",
];

export function explorerAccount(name: string) {
  return `${EXPLORER}/account/${name}`;
}

export function explorerTx(id: string) {
  return `${EXPLORER}/transaction/${id}`;
}

export function alcorSwapUrl(quoteSymbol: string, quoteContract: string, tokenSymbol: string) {
  return `${ALCOR_UI}/swap?input=${quoteSymbol}-${quoteContract}&output=${tokenSymbol}-${FLEXFOREX_CONTRACT}`;
}

export function tickSpacing(fee: number) {
  return FEE_TIERS.find((t) => t.fee === fee)?.spacing ?? 60;
}
