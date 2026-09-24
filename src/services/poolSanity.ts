import { SWAP_ALCOR } from "@/config/launch";
import { assetAmountNumber, parseAsset } from "@/services/assets";
import { fetchSwapPool, fetchSwapPoolsForToken, type AlcorPoolRow } from "@/services/alcorMarket";
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
};

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

  const lockedTokens = rawToNumber(tokenRaw(now), input.tokenPrecision);
  const lockedQuote = rawToNumber(quoteRaw(now), input.quotePrecision);
  const startTokens = rawToNumber(tokenRaw(start), input.tokenPrecision);
  const startQuote = rawToNumber(quoteRaw(start), input.quotePrecision);
  const tokensOut = Math.max(0, dust(startTokens - lockedTokens, input.maxSupply));
  const quoteIn = Math.max(0, dust(lockedQuote - startQuote, lockedQuote));
  const avgPaidQuote = posDiv(quoteIn, tokensOut);

  const midQuote = midQuotePerToken(input.sqrtNow, input.tokenIsA, input.tokenPrecision, input.quotePrecision);
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
  };
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
): Promise<{ usd: number; unpriced: number }> {
  const sides: { contract: string; symbol: string; qty: number }[] = [];
  for (const pool of pools) {
    const tokenIsA = sameToken(pool.tokenA, tokenSymbol, tokenContract);
    const tokenIsB = sameToken(pool.tokenB, tokenSymbol, tokenContract);
    const other = tokenIsA ? pool.tokenB : tokenIsB ? pool.tokenA : undefined;
    const qty = Number(other?.quantity) || 0;
    if (!(qty > 0) || !other?.symbol || !other.contract) continue;
    sides.push({ contract: other.contract, symbol: other.symbol, qty });
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
  for (const side of sides) {
    const px = prices.get(`${side.contract.toLowerCase()}:${side.symbol.toUpperCase()}`) ?? 0;
    if (!(px > 0)) {
      unpriced += 1;
      continue;
    }
    usd += side.qty * px;
  }
  return { usd, unpriced };
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
  if (listed) {
    const book = await quoteBookUsd(listed, args.symbol, args.contract);
    allPoolsQuoteUsd = book.usd;
    unpricedPools = book.unpriced;
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
  return { ...view, unlockUnix };
}
