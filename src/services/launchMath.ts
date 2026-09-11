import { ALCOR_MAX_TICK, ALCOR_MIN_TICK, EOSIO_MAX_TIME_SEC, LOCK_MIN_DAYS, tickSpacing, type FeeTier } from "@/config/launch";
import { formatAsset, zeroAsset } from "@/services/assets";
import { sortPair, type ExtToken } from "@/services/eosioName";
import {
  getSqrtPriceX64AtTick,
  nearestUsableTick,
  rawPriceFromTick,
  tickFromRawPrice,
} from "@/services/tickMath";

export type LaunchPlan = {
  launched: ExtToken;
  quote: ExtToken;
  tokenA: ExtToken;
  tokenB: ExtToken;
  launchedIsA: boolean;
  fee: FeeTier;
  spacing: number;
  tickLower: number;
  tickUpper: number;
  startTick: number;
  sqrtPriceX64: string;
  tokenADesired: string;
  tokenBDesired: string;
  tokenAMin: string;
  tokenBMin: string;
  fullSupply: string;
  quoteZero: string;
  quotePerTokenLower: number;
  quotePerTokenUpper: number;
};

function quotePerTokenFromTick(tick: number, launchedIsA: boolean, decA: number, decB: number): number {
  const rawAB = rawPriceFromTick(tick); // tokenB/tokenA raw
  const humanAB = rawAB * 10 ** (decA - decB); // tokenB per tokenA human
  if (launchedIsA) return humanAB;
  return humanAB > 0 ? 1 / humanAB : 0;
}

export function planLaunch(input: {
  symbol: string;
  precision: number;
  maxSupply: string;
  contract: string;
  quote: ExtToken;
  fee: FeeTier;
  priceLower: string;
  priceUpper: string;
}): LaunchPlan {
  const launched: ExtToken = { symbol: input.symbol, contract: input.contract, precision: input.precision };
  const quote = input.quote;
  const [tokenA, tokenB] = sortPair(launched, quote);
  const launchedIsA = tokenA.contract === launched.contract && tokenA.symbol === launched.symbol;
  const spacing = tickSpacing(input.fee);

  const lo = Number(input.priceLower);
  const hi = Number(input.priceUpper);
  const qMin = Math.min(lo, hi);
  const qMax = Math.max(lo, hi);

  const toRawAB = (quotePerToken: number) => {
    if (!(quotePerToken > 0)) return 0;
    if (launchedIsA) return quotePerToken * 10 ** (tokenB.precision - tokenA.precision);
    return (1 / quotePerToken) * 10 ** (tokenB.precision - tokenA.precision);
  };

  let tickLower = nearestUsableTick(tickFromRawPrice(toRawAB(launchedIsA ? qMin : qMax)), spacing);
  let tickUpper = nearestUsableTick(tickFromRawPrice(toRawAB(launchedIsA ? qMax : qMin)), spacing);
  if (tickLower >= tickUpper) tickUpper = Math.min(ALCOR_MAX_TICK, tickLower + spacing);
  tickLower = Math.max(ALCOR_MIN_TICK, tickLower);
  tickUpper = Math.min(ALCOR_MAX_TICK, tickUpper);

  const startTick = launchedIsA
    ? nearestUsableTick(tickLower - spacing, spacing)
    : tickUpper;
  const sqrtPriceX64 = getSqrtPriceX64AtTick(startTick).toString();
  const fullSupply = formatAsset(input.maxSupply || "0", input.precision, input.symbol);
  const quoteZero = zeroAsset(quote.precision, quote.symbol);
  const launchedZero = zeroAsset(input.precision, input.symbol);

  return {
    launched,
    quote,
    tokenA,
    tokenB,
    launchedIsA,
    fee: input.fee,
    spacing,
    tickLower,
    tickUpper,
    startTick,
    sqrtPriceX64,
    tokenADesired: launchedIsA ? fullSupply : quoteZero,
    tokenBDesired: launchedIsA ? quoteZero : fullSupply,
    tokenAMin: launchedIsA ? launchedZero : quoteZero,
    tokenBMin: launchedIsA ? quoteZero : launchedZero,
    fullSupply,
    quoteZero,
    quotePerTokenLower: quotePerTokenFromTick(tickLower, launchedIsA, tokenA.precision, tokenB.precision),
    quotePerTokenUpper: quotePerTokenFromTick(tickUpper, launchedIsA, tokenA.precision, tokenB.precision),
  };
}

export function maxLockDays(nowSec = Math.floor(Date.now() / 1000)): number {
  return Math.max(LOCK_MIN_DAYS, Math.floor((EOSIO_MAX_TIME_SEC - nowSec) / 86400));
}

export function unlockTimeUnix(lockDays: number, nowSec = Math.floor(Date.now() / 1000)): number {
  const days = Math.min(maxLockDays(nowSec), Math.max(LOCK_MIN_DAYS, Math.floor(lockDays)));
  return Math.min(EOSIO_MAX_TIME_SEC, nowSec + days * 86400);
}

const Q64 = 1n << 64n;
/** 2^64 * sqrt(2), Alcor Q64.64. */
const SQRT2_X64 = 26087635650665564424n;
const FEE_DEN = 1_000_000n;
export const USD_BUY_PROBE = 100;

export type RangeImpact = {
  liquidity: string;
  startQuotePerToken: number;
  maxQuotePerToken: number;
  doubledQuotePerToken: number;
  doubledCapped: boolean;
  /** Quote units the buyer spends (swap fee included). */
  quoteToDouble: number;
  usdToDouble: number | null;
  initialMarketCapUsd: number | null;
  usdProbe: number;
  tokensForUsd: number | null;
  supplyPctForUsd: number | null;
  quoteForUsd: number | null;
};

function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function decimalToRaw(amount: string, precision: number): bigint {
  const cleaned = amount.replace(/,/g, "").trim();
  if (!cleaned) return 0n;
  const neg = cleaned.startsWith("-");
  const unsigned = neg ? cleaned.slice(1) : cleaned;
  const [iRaw, fRaw = ""] = unsigned.split(".");
  const i = (iRaw.replace(/\D/g, "") || "0").replace(/^0+(?=\d)/, "") || "0";
  const frac = (fRaw.replace(/\D/g, "") + "0".repeat(precision)).slice(0, precision);
  const raw = BigInt(i) * 10n ** BigInt(precision) + BigInt(frac || "0");
  return neg ? -raw : raw;
}

function rawToNumber(raw: bigint, precision: number): number {
  const p = 10n ** BigInt(precision);
  const ip = raw / p;
  const fp = raw % p;
  return Number(ip) + Number(fp) / Number(p);
}

function getLiquidityForAmount0(sqrtA: bigint, sqrtB: bigint, amount0: bigint): bigint {
  const lo = minBig(sqrtA, sqrtB);
  const hi = maxBig(sqrtA, sqrtB);
  if (hi <= lo || amount0 <= 0n) return 0n;
  const intermediate = (lo * hi) / Q64;
  return (amount0 * intermediate) / (hi - lo);
}

function getLiquidityForAmount1(sqrtA: bigint, sqrtB: bigint, amount1: bigint): bigint {
  const lo = minBig(sqrtA, sqrtB);
  const hi = maxBig(sqrtA, sqrtB);
  if (hi <= lo || amount1 <= 0n) return 0n;
  return (amount1 * Q64) / (hi - lo);
}

function getAmount0Delta(sqrtA: bigint, sqrtB: bigint, liquidity: bigint): bigint {
  const lo = minBig(sqrtA, sqrtB);
  const hi = maxBig(sqrtA, sqrtB);
  if (hi <= lo || liquidity <= 0n || lo <= 0n) return 0n;
  return (liquidity * (hi - lo) * Q64) / hi / lo;
}

function getAmount1Delta(sqrtA: bigint, sqrtB: bigint, liquidity: bigint): bigint {
  const lo = minBig(sqrtA, sqrtB);
  const hi = maxBig(sqrtA, sqrtB);
  if (hi <= lo || liquidity <= 0n) return 0n;
  return (liquidity * (hi - lo)) / Q64;
}

function mulSqrt2(sqrt: bigint): bigint {
  return (sqrt * SQRT2_X64) / Q64;
}

function divSqrt2(sqrt: bigint): bigint {
  return (sqrt * Q64) / SQRT2_X64;
}

function grossUpFee(net: bigint, fee: number): bigint {
  const den = FEE_DEN - BigInt(fee);
  if (den <= 0n) return net;
  return (net * FEE_DEN + den - 1n) / den;
}

function netAfterFee(gross: bigint, fee: number): bigint {
  return (gross * (FEE_DEN - BigInt(fee))) / FEE_DEN;
}

function usdToQuoteRaw(usd: number, quoteUsd: number, precision: number): bigint {
  if (!(usd > 0) || !(quoteUsd > 0) || precision < 0) return 0n;
  const scaled = Math.round((usd / quoteUsd) * 10 ** precision);
  if (!Number.isFinite(scaled) || scaled <= 0) return 0n;
  return BigInt(scaled);
}

function toUsd(amount: number, quoteUsd: number): number | null {
  if (!(quoteUsd > 0) || !Number.isFinite(amount)) return null;
  return amount * quoteUsd;
}

/**
 * One-sided Alcor (Uniswap v3) walk from the range edge. Quote USD is a constant
 * spot (Alcor), not a path-dependent underlying move.
 */
export function rangeImpact(plan: LaunchPlan, maxSupply: string, quoteUsd = 0, usdProbe = USD_BUY_PROBE): RangeImpact | null {
  const supplyRaw = decimalToRaw(maxSupply, plan.launched.precision);
  if (supplyRaw <= 0n) return null;
  const sqrtLower = getSqrtPriceX64AtTick(plan.tickLower);
  const sqrtUpper = getSqrtPriceX64AtTick(plan.tickUpper);
  if (sqrtLower <= 0n || sqrtUpper <= sqrtLower) return null;

  const startQuote = Math.min(plan.quotePerTokenLower, plan.quotePerTokenUpper);
  const maxQuote = Math.max(plan.quotePerTokenLower, plan.quotePerTokenUpper);
  const fee = plan.fee;

  let liquidity: bigint;
  let quoteNetToDouble: bigint;
  let doubledCapped: boolean;
  let tokensForUsd: bigint | null = null;

  if (plan.launchedIsA) {
    liquidity = getLiquidityForAmount0(sqrtLower, sqrtUpper, supplyRaw);
    if (liquidity <= 0n) return null;
    const target = minBig(maxBig(mulSqrt2(sqrtLower), sqrtLower + 1n), sqrtUpper);
    doubledCapped = target >= sqrtUpper && mulSqrt2(sqrtLower) > sqrtUpper;
    quoteNetToDouble = getAmount1Delta(sqrtLower, target, liquidity);
    if (quoteUsd > 0) {
      const net = netAfterFee(usdToQuoteRaw(usdProbe, quoteUsd, plan.quote.precision), fee);
      if (net > 0n) {
        const next = minBig(sqrtLower + (net * Q64) / liquidity, sqrtUpper);
        tokensForUsd = getAmount0Delta(sqrtLower, next, liquidity);
      }
    }
  } else {
    liquidity = getLiquidityForAmount1(sqrtLower, sqrtUpper, supplyRaw);
    if (liquidity <= 0n) return null;
    const target = maxBig(minBig(divSqrt2(sqrtUpper), sqrtUpper - 1n), sqrtLower);
    doubledCapped = target <= sqrtLower && divSqrt2(sqrtUpper) < sqrtLower;
    quoteNetToDouble = getAmount0Delta(target, sqrtUpper, liquidity);
    if (quoteUsd > 0) {
      const net = netAfterFee(usdToQuoteRaw(usdProbe, quoteUsd, plan.quote.precision), fee);
      if (net > 0n) {
        const num = liquidity * Q64;
        const product = net * sqrtUpper;
        const next = maxBig((num * sqrtUpper) / (num + product), sqrtLower);
        tokensForUsd = getAmount1Delta(next, sqrtUpper, liquidity);
      }
    }
  }

  const quoteToDouble = rawToNumber(grossUpFee(quoteNetToDouble, fee), plan.quote.precision);
  const supplyHuman = rawToNumber(supplyRaw, plan.launched.precision);
  const tokensHuman = tokensForUsd != null ? rawToNumber(tokensForUsd, plan.launched.precision) : null;
  const quoteForUsd = quoteUsd > 0 ? usdProbe / quoteUsd : null;

  return {
    liquidity: liquidity.toString(),
    startQuotePerToken: startQuote,
    maxQuotePerToken: maxQuote,
    doubledQuotePerToken: doubledCapped ? maxQuote : startQuote * 2,
    doubledCapped,
    quoteToDouble,
    usdToDouble: toUsd(quoteToDouble, quoteUsd),
    initialMarketCapUsd: quoteUsd > 0 ? supplyHuman * startQuote * quoteUsd : null,
    usdProbe,
    tokensForUsd: tokensHuman,
    supplyPctForUsd: tokensHuman != null && supplyHuman > 0 ? (tokensHuman / supplyHuman) * 100 : null,
    quoteForUsd,
  };
}
