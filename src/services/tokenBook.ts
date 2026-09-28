import { assetAmountNumber, parseAsset } from "@/services/assets";
import { bookCacheKey } from "@/services/cacheKeys";
import { liveOr } from "@/services/readThrough";
import { loadPoolSanity, type SanityView } from "@/services/poolSanity";
import { loadTokenPublicFresh, type TokenPublic } from "@/services/tokenSnapshot";
import {
  loadHeadcounts,
  loadInsiderBooks,
  loadSpotTokens,
  type InsiderRow,
  type WalletDot,
} from "@/services/tokenCensus";

export type TokenBookArgs = {
  contract: string;
  symbol: string;
  quoteContract: string;
  quoteSymbol: string;
  poolId: number;
  positionId: number;
  tickLower: number;
  tickUpper: number;
  sqrtStart: string;
  maxSupply: number;
  tokenPrecision: number;
};

export type TokenBook = {
  view: SanityView | null;
  error: string;
  holders: number | null;
  insiders: number | null;
  spotTokens: number;
  books: InsiderRow[];
  wallets: WalletDot[];
};

function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

export function bookArgsFromPublic(contract: string, symbol: string, pub: TokenPublic): TokenBookArgs {
  const quote = pick(pub.launch, "quote") as { quantity?: string; contract?: string } | undefined;
  const parsed = parseAsset(quote?.quantity ?? "");
  const supply = String(pick(pub.stat, "supply") ?? "");
  const supplyAmt = assetAmountNumber(supply);
  const maxSupply = assetAmountNumber(String(pick(pub.stat, "max_supply") ?? "")) || supplyAmt;
  return {
    contract: contract.trim().toLowerCase(),
    symbol: symbol.trim().toUpperCase(),
    quoteContract: String(quote?.contract ?? ""),
    quoteSymbol: parsed?.symbol ?? "",
    poolId: Number(pick(pub.launch, "pure_liquid_alcor_pool_id", "pool_id") ?? 0),
    positionId: Number(pick(pub.launch, "position_id") ?? 0),
    tickLower: Number(pick(pub.launch, "tick_lower") ?? 0),
    tickUpper: Number(pick(pub.launch, "tick_upper") ?? 0),
    sqrtStart: String(pick(pub.launch, "sqrt_price_x64") ?? "0"),
    maxSupply,
    tokenPrecision: parseAsset(supply)?.precision ?? 4,
  };
}

export async function loadTokenBookFresh(args: TokenBookArgs): Promise<TokenBook> {
  const counts = loadHeadcounts(args.contract, args.symbol).catch(() => null);
  const spot = loadSpotTokens(args.contract, args.symbol).catch(() => 0);
  let view: SanityView | null = null;
  let error = "";
  let books: InsiderRow[] = [];
  let wallets: WalletDot[] = [];
  if (args.poolId > 0) {
    try {
      view = await loadPoolSanity(args);
      const insider = await loadInsiderBooks(args.contract, args.symbol, view.poolBook);
      books = insider.insiders;
      wallets = insider.wallets;
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not read the locked pool.";
    }
  }
  const head = await counts;
  return {
    view,
    error,
    holders: head ? head.holders : null,
    insiders: head ? head.insiders : null,
    spotTokens: await spot,
    books,
    wallets,
  };
}

export async function loadTokenBookForCache(contract: string, symbol: string): Promise<TokenBook> {
  const pub = await loadTokenPublicFresh(contract, symbol);
  return loadTokenBookFresh(bookArgsFromPublic(contract, symbol, pub));
}

export function loadTokenBook(args: TokenBookArgs, opts?: { force?: boolean }): Promise<TokenBook> {
  return liveOr(bookCacheKey(args.contract, args.symbol), () => loadTokenBookFresh(args), opts);
}
