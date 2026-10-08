import { SWAP_ALCOR, coreLiquidOf } from "@/config/launch";
import { assetAmountNumber, parseAsset } from "@/services/assets";
import { fetchAccountPositions, fetchSwapPool, fetchSwapPoolsForToken, type AlcorLpPosition, type AlcorPoolRow } from "@/services/alcorMarket";
import { readAccounts, readLock, readPool, readPosition, readPositions } from "@/services/flexTables";
import { amountsAtSqrt } from "@/services/launchMath";
import { getSqrtPriceX64AtTick } from "@/services/tickMath";
import { fetchAlcorUsdPrice } from "@/services/xtokenCatalog";

/**
 * Day-one locked position, valued at the pool mid.
 * Avg paid = quote that entered the range / tokens that left it.
 * Fully redeeming = locked quote / tradable supply.
 * Tradable supply = max supply - tokens still in that position.
 * Wallet float = max supply - token balance on swap.alcor.
 */

export type SanityView = {
  midQuote: number;
  midUsd: number | null;
  lockedQuote: number;
  lockedTokens: number;
  quoteIn: number;
  tokensOut: number;
  avgPaidQuote: number | null;
  avgPaidUsd: number | null;
  tradableSupply: number;
  tradablePrintUsd: number | null;
  walletFloat: number;
  walletPrintUsd: number | null;
  swapAlcorTokens: number;
  satelliteTokens: number;
  hardBackingUsd: number | null;
  /** Quote in every Alcor pool: locked position plus community LP. */
  liquidBackingUsd: number | null;
  /** Alcor lockpos unlock, unix seconds. 0 when unread. */
  unlockUnix: number;
  fullPrintUsd: number | null;
  backingOverFull: number | null;
  backingOverWallet: number | null;
  poolTvlUsd: number | null;
  volumeUsd24: number | null;
  volOverBacking: number | null;
  volOverTradable: number | null;
  redeemQuote: number | null;
  redeemUsd: number | null;
  avgOverRedeem: number | null;
  poolRedeemCover: number | null;
  bookCover: number | null;
  lpLoyalty: number | null;
  unpricedPools: number;
  /** Quote-side USD of every swap.alcor pool, grouped by backing token. */
  backing: BackingSlice[];
  /** Pools that list this token, with the other side's symbol and USD. */
  poolBook: PoolBookRow[];
  /** Project-token backing positions. Empty for a normal launch. */
  marks: BackingMark[];
  /** Quote assets that count as pure backing. Empty when this is a normal launch. */
  backingQuotes: { symbol: string; contract: string }[];
  /** MEME: no pure liquid backing. */
  bare: boolean;
  /** Share of pure backing by quote. Empty on a normal launch, where `backing` is the ring. */
  pureBacking: BackingSlice[];
};

export type BackingMark = {
  symbol: string;
  contract: string;
  positionId: number;
  poolId: number;
  usd: number;
  quoteQty: number;
};

export type BackingSlice = {
  symbol: string;
  contract: string;
  usd: number;
  share: number;
};

export type PoolBookRow = {
  id: number;
  quoteSymbol: string;
  quoteContract: string;
  tokenQty: number;
  quoteUsd: number;
};

/** Flex quotes plus XMD, LOAN, METAL, and anything on xtokens. */
const ECOSYSTEM_SYMBOLS = new Set(["EASY", "WON", "GRAMS", "MEME", "XMD", "LOAN", "METAL"]);

export function isEcosystemQuote(symbol: string, contract: string): boolean {
  if (contract.toLowerCase() === "xtokens") return true;
  return ECOSYSTEM_SYMBOLS.has(symbol.toUpperCase());
}

export type CommunityLpSplit = {
  /** Community LP in the launch quote, after the locked position. */
  sameUsd: number;
  /** Community LP in other ecosystem quotes. */
  ecosystemUsd: number;
  /** Community LP in any other quote. */
  degenUsd: number;
};

/** Quote already inside the locked position stays out of these three. */
export function splitCommunityLp(args: {
  slices: { symbol: string; contract: string; usd: number }[];
  quoteSymbol: string;
  quoteContract: string;
  /** When set, every listed quote counts as the launch backing, not just one symbol. */
  quotes?: { symbol: string; contract: string }[];
  hardBackingUsd: number | null;
}): CommunityLpSplit {
  const quoteList = args.quotes?.length
    ? args.quotes
    : [{ symbol: args.quoteSymbol, contract: args.quoteContract }];
  let sameGross = 0;
  let ecosystemUsd = 0;
  let degenUsd = 0;
  for (const row of args.slices) {
    if (!(row.usd > 0)) continue;
    const sym = row.symbol.toUpperCase();
    const code = row.contract.toLowerCase();
    const same = quoteList.some(
      (q) => sym === q.symbol.toUpperCase() && (q.contract === "" || code === q.contract.toLowerCase())
    );
    if (same) {
      sameGross += row.usd;
      continue;
    }
    if (isEcosystemQuote(sym, code)) ecosystemUsd += row.usd;
    else degenUsd += row.usd;
  }
  const hard = args.hardBackingUsd != null && args.hardBackingUsd > 0 ? args.hardBackingUsd : 0;
  return { sameUsd: Math.max(0, sameGross - hard), ecosystemUsd, degenUsd };
}

/** Share of priced quote-side USD. Rows with no price are dropped. */
export function backingShares(
  rows: { symbol: string; contract: string; usd: number }[]
): BackingSlice[] {
  const grouped = new Map<string, BackingSlice>();
  for (const row of rows) {
    if (!(row.usd > 0) || !row.symbol) continue;
    const key = `${row.contract.toLowerCase()}:${row.symbol.toUpperCase()}`;
    const prev = grouped.get(key);
    if (prev) prev.usd += row.usd;
    else grouped.set(key, { symbol: row.symbol.toUpperCase(), contract: row.contract, usd: row.usd, share: 0 });
  }
  const list = [...grouped.values()].sort((a, b) => b.usd - a.usd || a.symbol.localeCompare(b.symbol));
  const total = list.reduce((sum, row) => sum + row.usd, 0);
  if (!(total > 0)) return [];
  for (const row of list) row.share = row.usd / total;
  return list;
}

export type SanityMathInput = {
  maxSupply: number;
  tokenPrecision: number;
  quotePrecision: number;
  tokenIsA: boolean;
  sqrtNow: bigint;
  sqrtStart: bigint;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  swapAlcorTokens: number;
  quoteUsd: number;
  allPoolsQuoteUsd: number | null;
  poolTvlUsd: number | null;
  volumeUsd24: number | null;
  unpricedPools?: number;
  /** Skip tick math and use these amounts. Core tokens pass the backing positions. */
  settled?: { lockedTokens: number; lockedQuote: number };
  /** Quote per token. Used when there is no single sqrt price. */
  midQuote?: number;
};

function rawToNumber(raw: bigint, precision: number): number {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const scale = 10n ** BigInt(Math.max(0, precision));
  const whole = abs / scale;
  const frac = abs % scale;
  const n = Number(whole) + Number(frac) / Number(scale);
  return neg ? -n : n;
}

function ratio(num: bigint, den: bigint): number {
  if (den <= 0n) return 0;
  const scale = 10n ** 24n;
  return Number((num * scale) / den) / 1e24;
}

/** Quote units per 1 token at a pool sqrt (human amounts). */
export function midQuotePerToken(
  sqrt: bigint,
  tokenIsA: boolean,
  tokenPrecision: number,
  quotePrecision: number
): number {
  if (sqrt <= 0n) return 0;
  const decA = tokenIsA ? tokenPrecision : quotePrecision;
  const decB = tokenIsA ? quotePrecision : tokenPrecision;
  const raw = ratio(sqrt * sqrt, 1n << 128n);
  const humanAB = raw * 10 ** (decA - decB);
  if (!(humanAB > 0) || !Number.isFinite(humanAB)) return 0;
  return tokenIsA ? humanAB : 1 / humanAB;
}

function dust(n: number, scale: number): number {
  const tol = Math.max(1e-8, Math.abs(scale) * 1e-9);
  return Math.abs(n) <= tol ? 0 : n;
}

function posDiv(num: number, den: number): number | null {
  if (!(den > 0) || !Number.isFinite(num) || !Number.isFinite(den)) return null;
  const q = num / den;
  return Number.isFinite(q) ? q : null;
}

function usdOrNull(quote: number, quoteUsd: number): number | null {
  if (!(quoteUsd > 0) || !Number.isFinite(quote)) return null;
  const n = quote * quoteUsd;
  return Number.isFinite(n) ? n : null;
}

export function buildSanity(input: SanityMathInput): SanityView {
  let lockedTokens: number;
  let lockedQuote: number;
  let tokensOut: number;
  let quoteIn: number;
  if (input.settled) {
    lockedTokens = input.settled.lockedTokens;
    lockedQuote = input.settled.lockedQuote;
    tokensOut = 0;
    quoteIn = 0;
  } else {
    const sqrtLower = getSqrtPriceX64AtTick(input.tickLower);
    const sqrtUpper = getSqrtPriceX64AtTick(input.tickUpper);
    const sqrtStart =
      input.sqrtStart > 0n ? input.sqrtStart : input.tokenIsA ? sqrtLower : sqrtUpper;
    const now = amountsAtSqrt({
      liquidity: input.liquidity,
      sqrtLower,
      sqrtUpper,
      sqrtPrice: input.sqrtNow,
    });
    const start = amountsAtSqrt({
      liquidity: input.liquidity,
      sqrtLower,
      sqrtUpper,
      sqrtPrice: sqrtStart,
    });
    const tokenRaw = (side: { amountA: bigint; amountB: bigint }) =>
      input.tokenIsA ? side.amountA : side.amountB;
    const quoteRaw = (side: { amountA: bigint; amountB: bigint }) =>
      input.tokenIsA ? side.amountB : side.amountA;

    lockedTokens = rawToNumber(tokenRaw(now), input.tokenPrecision);
    lockedQuote = rawToNumber(quoteRaw(now), input.quotePrecision);
    const startTokens = rawToNumber(tokenRaw(start), input.tokenPrecision);
    const startQuote = rawToNumber(quoteRaw(start), input.quotePrecision);
    tokensOut = Math.max(0, dust(startTokens - lockedTokens, input.maxSupply));
    quoteIn = Math.max(0, dust(lockedQuote - startQuote, lockedQuote));
  }
  const avgPaidQuote = posDiv(quoteIn, tokensOut);

  const midQuote =
    input.midQuote != null && input.midQuote > 0
      ? input.midQuote
      : midQuotePerToken(input.sqrtNow, input.tokenIsA, input.tokenPrecision, input.quotePrecision);
  const quoteUsd = input.quoteUsd > 0 ? input.quoteUsd : 0;
  const midUsd = usdOrNull(midQuote, quoteUsd);
  const avgPaidUsd = avgPaidQuote == null ? null : usdOrNull(avgPaidQuote, quoteUsd);
  const hardBackingUsd = usdOrNull(lockedQuote, quoteUsd);
  const liquidBackingUsd =
    input.allPoolsQuoteUsd != null && input.allPoolsQuoteUsd > 0 ? input.allPoolsQuoteUsd : hardBackingUsd;

  const maxSupply = Number.isFinite(input.maxSupply) ? input.maxSupply : 0;
  const swapAlcorTokens = Number.isFinite(input.swapAlcorTokens) ? input.swapAlcorTokens : 0;
  const tradableSupply = dust(maxSupply - lockedTokens, maxSupply);
  const walletFloat = dust(maxSupply - swapAlcorTokens, maxSupply);
  const satelliteTokens = dust(swapAlcorTokens - lockedTokens, maxSupply);

  const tradablePrintUsd = midUsd != null ? midUsd * tradableSupply : null;
  const walletPrintUsd = midUsd != null ? midUsd * walletFloat : null;
  const fullPrintUsd = midUsd != null ? midUsd * maxSupply : null;

  const tradablePrintQuote = midQuote > 0 ? midQuote * tradableSupply : 0;
  const walletPrintQuote = midQuote > 0 ? midQuote * walletFloat : 0;
  const fullPrintQuote = midQuote > 0 ? midQuote * maxSupply : 0;

  const redeemQuote = posDiv(lockedQuote, tradableSupply);
  const redeemUsd = redeemQuote == null ? null : usdOrNull(redeemQuote, quoteUsd);
  const avgOverRedeem =
    avgPaidQuote != null && redeemQuote != null && redeemQuote > 0 ? avgPaidQuote / redeemQuote : null;

  const backingOverFull = posDiv(lockedQuote, fullPrintQuote);
  const backingOverWallet = posDiv(lockedQuote, walletPrintQuote);
  const bookCover = posDiv(lockedQuote, tradablePrintQuote);

  const poolRedeemCover =
    input.allPoolsQuoteUsd != null && walletPrintUsd != null
      ? posDiv(input.allPoolsQuoteUsd, walletPrintUsd)
      : null;

  const volOverBacking =
    input.volumeUsd24 != null && hardBackingUsd != null ? posDiv(input.volumeUsd24, hardBackingUsd) : null;
  const volOverTradable =
    input.volumeUsd24 != null && tradablePrintUsd != null && tradablePrintUsd > 0
      ? posDiv(input.volumeUsd24, tradablePrintUsd)
      : null;

  const looseOk = walletFloat >= 0 && satelliteTokens >= 0;
  const lpLoyalty = looseOk ? posDiv(satelliteTokens, satelliteTokens + walletFloat) : null;

  return {
    midQuote,
    midUsd,
    lockedQuote,
    lockedTokens,
    quoteIn,
    tokensOut,
    avgPaidQuote,
    avgPaidUsd,
    tradableSupply,
    tradablePrintUsd,
    walletFloat,
    walletPrintUsd,
    swapAlcorTokens,
    satelliteTokens,
    hardBackingUsd,
    liquidBackingUsd,
    unlockUnix: 0,
    fullPrintUsd,
    backingOverFull,
    backingOverWallet,
    poolTvlUsd: input.poolTvlUsd,
    volumeUsd24: input.volumeUsd24,
    volOverBacking,
    volOverTradable,
    redeemQuote,
    redeemUsd,
    avgOverRedeem,
    poolRedeemCover,
    bookCover,
    lpLoyalty,
    unpricedPools: input.unpricedPools ?? 0,
    backing: [],
    poolBook: [],
    marks: [],
    backingQuotes: [],
    bare: false,
    pureBacking: [],
  };
}

/** Quote dollars and token amounts inside the named backing positions. Ignores other pairs. */
export function backingFromPositions(args: {
  tokenSymbol: string;
  quotes: { symbol: string; contract: string }[];
  positions: AlcorLpPosition[];
  price: (contract: string, symbol: string) => number;
}): { usd: number; tokens: number; marks: BackingMark[] } {
  const tokenSym = args.tokenSymbol.toUpperCase();
  const seen = new Set<number>();
  let usd = 0;
  let tokens = 0;
  const marks: BackingMark[] = [];
  for (const quote of args.quotes) {
    const hits: BackingMark[] = [];
    for (const pos of args.positions) {
      if (pos.closed) continue;
      const id = Number(pos.id) || 0;
      if (id > 0 && seen.has(id)) continue;
      const a = parseAsset(pos.amountA ?? "");
      const b = parseAsset(pos.amountB ?? "");
      if (!a || !b) continue;
      const tokenSide = a.symbol === tokenSym ? a : b.symbol === tokenSym ? b : null;
      const quoteSide = tokenSide === a ? b : tokenSide === b ? a : null;
      if (!tokenSide || !quoteSide || quoteSide.symbol !== quote.symbol.toUpperCase()) continue;
      if (id > 0) seen.add(id);
      const quoteQty = Number(quoteSide.amount);
      const tokenQty = Number(tokenSide.amount);
      const px = args.price(quote.contract, quote.symbol);
      const sideUsd = px > 0 && quoteQty > 0 ? quoteQty * px : 0;
      usd += sideUsd;
      tokens += Number.isFinite(tokenQty) && tokenQty > 0 ? tokenQty : 0;
      hits.push({
        symbol: quote.symbol.toUpperCase(),
        contract: quote.contract,
        positionId: id,
        poolId: Number(pos.pool) || 0,
        usd: sideUsd,
        quoteQty: Number.isFinite(quoteQty) && quoteQty > 0 ? quoteQty : 0,
      });
    }
    hits.sort((p, q) => q.usd - p.usd || q.quoteQty - p.quoteQty);
    marks.push(...hits);
  }
  return { usd, tokens, marks };
}

function asBigint(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  const s = String(v ?? "").trim();
  if (!/^-?\d+$/.test(s)) return 0n;
  return BigInt(s);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

function sameToken(
  side: { symbol?: string; contract?: string } | undefined,
  symbol: string,
  contract: string
): boolean {
  if (!side?.symbol || !side.contract) return false;
  return side.symbol.toUpperCase() === symbol.toUpperCase() && side.contract.toLowerCase() === contract.toLowerCase();
}

async function quoteBookUsd(
  pools: AlcorPoolRow[],
  tokenSymbol: string,
  tokenContract: string
): Promise<{ usd: number; unpriced: number; backing: BackingSlice[]; poolBook: PoolBookRow[] }> {
  const sides: { id: number; contract: string; symbol: string; qty: number; tokenQty: number }[] = [];
  for (const pool of pools) {
    const tokenIsA = sameToken(pool.tokenA, tokenSymbol, tokenContract);
    const tokenIsB = sameToken(pool.tokenB, tokenSymbol, tokenContract);
    const other = tokenIsA ? pool.tokenB : tokenIsB ? pool.tokenA : undefined;
    const tokenSide = tokenIsA ? pool.tokenA : tokenIsB ? pool.tokenB : undefined;
    const qty = Number(other?.quantity) || 0;
    if (!other?.symbol || !other.contract) continue;
    sides.push({
      id: Number(pool.id) || 0,
      contract: other.contract,
      symbol: other.symbol,
      qty,
      tokenQty: Number(tokenSide?.quantity) || 0,
    });
  }
  const keys = [...new Set(sides.map((s) => `${s.contract.toLowerCase()}:${s.symbol.toUpperCase()}`))];
  const prices = new Map<string, number>();
  await Promise.all(
    keys.map(async (key) => {
      const [contract, symbol] = key.split(":");
      const usd = await fetchAlcorUsdPrice(contract, symbol).catch(() => 0);
      prices.set(key, usd);
    })
  );
  let usd = 0;
  let unpriced = 0;
  const priced: { symbol: string; contract: string; usd: number }[] = [];
  const poolBook: PoolBookRow[] = [];
  for (const side of sides) {
    const px = prices.get(`${side.contract.toLowerCase()}:${side.symbol.toUpperCase()}`) ?? 0;
    const sideUsd = px > 0 && side.qty > 0 ? side.qty * px : 0;
    if (side.qty > 0 && !(px > 0)) unpriced += 1;
    else if (sideUsd > 0) {
      usd += sideUsd;
      priced.push({ symbol: side.symbol, contract: side.contract, usd: sideUsd });
    }
    if (side.id > 0) {
      poolBook.push({
        id: side.id,
        quoteSymbol: side.symbol.toUpperCase(),
        quoteContract: side.contract,
        tokenQty: side.tokenQty,
        quoteUsd: sideUsd,
      });
    }
  }
  return { usd, unpriced, backing: backingShares(priced), poolBook };
}

async function readLockedPosition(args: {
  poolId: number;
  positionId: number;
  tickLower: number;
  tickUpper: number;
}): Promise<Record<string, unknown> | null> {
  if (args.positionId > 0) {
    const row = await readPosition(args.poolId, args.positionId);
    if (row && asBigint(pick(row, "liquidity")) > 0n) return row;
  }
  const rows = await readPositions(args.poolId);
  const matched = rows.filter((row) => {
    const lo = num(pick(row, "tickLower", "tick_lower"));
    const hi = num(pick(row, "tickUpper", "tick_upper"));
    return lo === args.tickLower && hi === args.tickUpper && asBigint(pick(row, "liquidity")) > 0n;
  });
  matched.sort((a, b) => {
    const d = asBigint(pick(b, "liquidity")) - asBigint(pick(a, "liquidity"));
    return d > 0n ? 1 : d < 0n ? -1 : 0;
  });
  return matched[0] ?? null;
}

export async function loadPoolSanity(args: {
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
}): Promise<SanityView> {
  if (!(args.poolId > 0)) throw new Error("Launch pair is not on Alcor yet.");
  const [pool, position, acct] = await Promise.all([
    readPool(args.poolId),
    readLockedPosition(args),
    readAccounts(args.contract, SWAP_ALCOR, args.symbol),
  ]);
  if (!pool) throw new Error("Main pool was not found on swap.alcor.");
  if (!position) throw new Error("Day-one locked position is not on this pool yet.");

  const tokenA = pool.tokenA as { quantity?: string; contract?: string } | undefined;
  const tokenB = pool.tokenB as { quantity?: string; contract?: string } | undefined;
  const parsedA = parseAsset(tokenA?.quantity ?? "");
  const parsedB = parseAsset(tokenB?.quantity ?? "");
  const tokenIsA = Boolean(
    parsedA &&
      parsedA.symbol.toUpperCase() === args.symbol.toUpperCase() &&
      String(tokenA?.contract ?? "").toLowerCase() === args.contract.toLowerCase()
  );
  const quoteSide = tokenIsA ? parsedB : parsedA;
  const quotePrecision = quoteSide?.precision ?? 0;
  const slot = pool.currSlot as { sqrtPriceX64?: string | number } | undefined;
  const sqrtNow = asBigint(slot?.sqrtPriceX64 ?? pool.sqrtPriceX64);
  const liquidity = asBigint(pick(position, "liquidity"));
  const swapAlcorTokens = assetAmountNumber(String(pick(acct.rows[0], "balance") ?? "0"));
  const tickLowerRaw = pick(position, "tickLower", "tick_lower");
  const tickUpperRaw = pick(position, "tickUpper", "tick_upper");
  const tickLower = tickLowerRaw == null ? args.tickLower : num(tickLowerRaw);
  const tickUpper = tickUpperRaw == null ? args.tickUpper : num(tickUpperRaw);

  const [quoteUsd, tokenUsd, listed, mainPool] = await Promise.all([
    args.quoteContract
      ? fetchAlcorUsdPrice(args.quoteContract, args.quoteSymbol).catch(() => 0)
      : Promise.resolve(0),
    fetchAlcorUsdPrice(args.contract, args.symbol).catch(() => 0),
    fetchSwapPoolsForToken(args.symbol, args.contract).catch(() => null as AlcorPoolRow[] | null),
    fetchSwapPool(args.poolId).catch(() => null),
  ]);

  let allPoolsQuoteUsd: number | null = null;
  let unpricedPools = 0;
  let volumeUsd24: number | null = null;
  let backing: BackingSlice[] = [];
  let poolBook: PoolBookRow[] = [];
  if (listed) {
    const book = await quoteBookUsd(listed, args.symbol, args.contract);
    allPoolsQuoteUsd = book.usd;
    unpricedPools = book.unpriced;
    backing = book.backing;
    poolBook = book.poolBook;
    volumeUsd24 = listed.reduce((sum, row) => sum + (Number(row.volumeUSD24) || 0), 0);
  }
  const listedMain = listed?.find((row) => Number(row.id) === args.poolId);
  const reportedTvl = Number(mainPool?.tvlUSD) || Number(listedMain?.tvlUSD) || 0;
  const tokenQty = assetAmountNumber(String((tokenIsA ? tokenA : tokenB)?.quantity ?? ""));
  const quoteQty = assetAmountNumber(String((tokenIsA ? tokenB : tokenA)?.quantity ?? ""));
  const mid = midQuotePerToken(sqrtNow, tokenIsA, args.tokenPrecision, quotePrecision);
  const tokenPx = tokenUsd > 0 ? tokenUsd : quoteUsd > 0 && mid > 0 ? mid * quoteUsd : 0;
  const markedTvl = tokenQty * tokenPx + quoteQty * (quoteUsd > 0 ? quoteUsd : 0);
  const poolTvlUsd = reportedTvl > 0 ? reportedTvl : markedTvl > 0 ? markedTvl : null;

  const view = buildSanity({
    maxSupply: args.maxSupply,
    tokenPrecision: args.tokenPrecision,
    quotePrecision,
    tokenIsA,
    sqrtNow,
    sqrtStart: asBigint(args.sqrtStart),
    tickLower,
    tickUpper,
    liquidity,
    swapAlcorTokens,
    quoteUsd,
    allPoolsQuoteUsd,
    poolTvlUsd,
    volumeUsd24,
    unpricedPools,
  });
  const posId = num(pick(position, "id")) || args.positionId;
  const lock = posId > 0 ? await readLock(posId).catch(() => null) : null;
  const unlockUnix = num(pick(lock, "unlockTime", "unlock_time"));
  return { ...view, unlockUnix, backing, poolBook };
}

/** Same figures as a launch, with pure backing taken from the project token's own pools. */
export async function loadCoreSanity(args: {
  contract: string;
  symbol: string;
  maxSupply: number;
  tokenPrecision: number;
}): Promise<SanityView> {
  const spec = coreLiquidOf(args.contract, args.symbol);
  if (!spec) throw new Error("Backing pools are not set for this token.");
  const [acct, listed, tokenUsd, nests] = await Promise.all([
    readAccounts(args.contract, SWAP_ALCOR, args.symbol),
    fetchSwapPoolsForToken(args.symbol, args.contract).catch(() => null as AlcorPoolRow[] | null),
    fetchAlcorUsdPrice(args.contract, args.symbol).catch(() => 0),
    Promise.all(spec.owners.map((owner) => fetchAccountPositions(owner))),
  ]);
  const prices = new Map<string, number>();
  await Promise.all(
    spec.quotes.map(async (q) => {
      prices.set(`${q.contract}:${q.symbol}`, await fetchAlcorUsdPrice(q.contract, q.symbol).catch(() => 0));
    })
  );
  const summed = spec.bare
    ? { usd: 0, tokens: 0, marks: [] as BackingMark[] }
    : backingFromPositions({
        tokenSymbol: args.symbol,
        quotes: spec.quotes.map((q) => ({ symbol: q.symbol, contract: q.contract })),
        positions: nests.flat(),
        price: (contract, symbol) => prices.get(`${contract}:${symbol}`) ?? 0,
      });
  const one = spec.quotes.length === 1 ? spec.quotes[0] : null;
  const quoteUsd = one ? (prices.get(`${one.contract}:${one.symbol}`) ?? 0) : 1;
  const lockedQuote = one ? summed.marks.reduce((sum, row) => sum + row.quoteQty, 0) : summed.usd;
  const midQuote = quoteUsd > 0 && tokenUsd > 0 ? tokenUsd / quoteUsd : tokenUsd > 0 ? tokenUsd : 0;

  let allPoolsQuoteUsd: number | null = null;
  let unpricedPools = 0;
  let volumeUsd24: number | null = null;
  let backing: BackingSlice[] = [];
  let poolBook: PoolBookRow[] = [];
  if (listed) {
    const book = await quoteBookUsd(listed, args.symbol, args.contract);
    allPoolsQuoteUsd = book.usd;
    unpricedPools = book.unpriced;
    backing = book.backing;
    poolBook = book.poolBook;
    volumeUsd24 = listed.reduce((sum, row) => sum + (Number(row.volumeUSD24) || 0), 0);
  }
  const poolIds = new Set(summed.marks.map((row) => row.poolId));
  const reportedTvl = (listed ?? [])
    .filter((row) => poolIds.has(Number(row.id)))
    .reduce((sum, row) => sum + (Number(row.tvlUSD) || 0), 0);
  const view = buildSanity({
    maxSupply: args.maxSupply,
    tokenPrecision: args.tokenPrecision,
    quotePrecision: 6,
    tokenIsA: true,
    sqrtNow: 0n,
    sqrtStart: 0n,
    tickLower: 0,
    tickUpper: 0,
    liquidity: 0n,
    swapAlcorTokens: assetAmountNumber(String(pick(acct.rows[0], "balance") ?? "0")),
    quoteUsd,
    allPoolsQuoteUsd,
    poolTvlUsd: reportedTvl > 0 ? reportedTvl : summed.usd > 0 ? summed.usd : null,
    volumeUsd24,
    unpricedPools,
    settled: { lockedTokens: summed.tokens, lockedQuote },
    midQuote,
  });
  return {
    ...view,
    hardBackingUsd: spec.bare ? null : view.hardBackingUsd,
    backing,
    poolBook,
    marks: summed.marks,
    backingQuotes: spec.quotes.map((q) => ({ symbol: q.symbol, contract: q.contract })),
    bare: spec.bare,
    pureBacking: backingShares(summed.marks.map((row) => ({ symbol: row.symbol, contract: row.contract, usd: row.usd }))),
  };
}
