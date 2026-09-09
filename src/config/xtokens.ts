import { XTOKENS } from "@/config/launch";

/** Wrapped quotes on `xtokens`, ordered by typical underlying market cap (BTC first). */
export type XtokenQuote = {
  symbol: string;
  precision: number;
  label: string;
  wraps: string;
  accent: string;
  /** Rough underlying market-cap rank (1 = largest). */
  rank: number;
  priceLower: string;
  priceUpper: string;
};

export const XTOKEN_QUOTES: XtokenQuote[] = [
  { symbol: "XBTC", precision: 8, label: "XBTC", wraps: "Bitcoin", accent: "#f7931a", rank: 1, priceLower: "0.00000001", priceUpper: "1" },
  { symbol: "XETH", precision: 8, label: "XETH", wraps: "Ethereum", accent: "#627eea", rank: 2, priceLower: "0.000001", priceUpper: "100" },
  { symbol: "XXRP", precision: 6, label: "XXRP", wraps: "Ripple", accent: "#23292f", rank: 3, priceLower: "0.000001", priceUpper: "100000" },
  { symbol: "XBNB", precision: 8, label: "XBNB", wraps: "BNB", accent: "#f3ba2f", rank: 4, priceLower: "0.000001", priceUpper: "100" },
  { symbol: "XSOL", precision: 6, label: "XSOL", wraps: "Solana", accent: "#9945ff", rank: 5, priceLower: "0.000001", priceUpper: "1000" },
  { symbol: "XUSDC", precision: 6, label: "XUSDC", wraps: "USD Coin", accent: "#2775ca", rank: 6, priceLower: "0.000001", priceUpper: "1000000" },
  { symbol: "XUSDT", precision: 6, label: "XUSDT", wraps: "Tether", accent: "#26a17b", rank: 7, priceLower: "0.000001", priceUpper: "1000000" },
  { symbol: "XDOGE", precision: 6, label: "XDOGE", wraps: "Dogecoin", accent: "#c2a633", rank: 8, priceLower: "0.000001", priceUpper: "10000000" },
  { symbol: "XADA", precision: 6, label: "XADA", wraps: "Cardano", accent: "#0033ad", rank: 9, priceLower: "0.000001", priceUpper: "1000000" },
  { symbol: "XXLM", precision: 6, label: "XXLM", wraps: "Stellar", accent: "#000000", rank: 10, priceLower: "0.000001", priceUpper: "10000000" },
  { symbol: "XLTC", precision: 8, label: "XLTC", wraps: "Litecoin", accent: "#345d9d", rank: 11, priceLower: "0.000001", priceUpper: "1000" },
  { symbol: "XBCH", precision: 8, label: "XBCH", wraps: "Bitcoin Cash", accent: "#0ac18e", rank: 12, priceLower: "0.000001", priceUpper: "100" },
  { symbol: "XHBAR", precision: 6, label: "XHBAR", wraps: "Hedera", accent: "#000000", rank: 13, priceLower: "0.000001", priceUpper: "10000000" },
  { symbol: "XEOS", precision: 4, label: "XEOS", wraps: "EOS", accent: "#000000", rank: 14, priceLower: "0.0001", priceUpper: "100000" },
  { symbol: "METAL", precision: 8, label: "METAL", wraps: "Metal Blockchain", accent: "#c0c0c0", rank: 15, priceLower: "0.000001", priceUpper: "100000" },
  { symbol: "XMT", precision: 8, label: "XMT", wraps: "Metal DAO", accent: "#e8b923", rank: 16, priceLower: "0.000001", priceUpper: "100000" },
];

export const XTOKEN_TOP_N = 10;

export function xtokensByMarketCap(): XtokenQuote[] {
  return [...XTOKEN_QUOTES].sort((a, b) => a.rank - b.rank);
}

export function findXtoken(symbol: string): XtokenQuote | undefined {
  const code = symbol.trim().toUpperCase();
  return XTOKEN_QUOTES.find((t) => t.symbol === code);
}

export function isXtokenContract(contract: string): boolean {
  return contract === XTOKENS;
}
