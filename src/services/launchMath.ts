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

export const PRICE_WALK_MULTIPLES = [2, 5, 10, 20, 50, 100] as const;

export type WalkCost = {
  multiple: number;
  capped: boolean;
  quoteGross: number;
  usd: number | null;
  tokens: number;
  supplyPct: number;
  quotePerToken: number;
};

export type BuyScenario = {
  firstUsd: number;
  extraUsd: number;
  firstTokens: number;
  firstSupplyPct: number;
  extraTokens: number;
  extraSupplyPct: number;
  bagUsdAfter: number | null;
  bagMultiple: number | null;
  endQuotePerToken: number;
  endMarketCapUsd: number | null;
  capped: boolean;
};

type PoolCurve = {
  plan: LaunchPlan;
  liquidity: bigint;
  sqrtLower: bigint;
  sqrtUpper: bigint;
  supplyRaw: bigint;
  supplyHuman: number;
  startQuote: number;
  maxQuote: number;
};

function poolCurve(plan: LaunchPlan, maxSupply: string): PoolCurve | null {
  const supplyRaw = decimalToRaw(maxSupply, plan.launched.precision);
  if (supplyRaw <= 0n) return null;
  const sqrtLower = getSqrtPriceX64AtTick(plan.tickLower);
  const sqrtUpper = getSqrtPriceX64AtTick(plan.tickUpper);
  if (sqrtLower <= 0n || sqrtUpper <= sqrtLower) return null;
  const liquidity = plan.launchedIsA
    ? getLiquidityForAmount0(sqrtLower, sqrtUpper, supplyRaw)
    : getLiquidityForAmount1(sqrtLower, sqrtUpper, supplyRaw);
  if (liquidity <= 0n) return null;
  return {
    plan,
    liquidity,
    sqrtLower,
    sqrtUpper,
    supplyRaw,
    supplyHuman: rawToNumber(supplyRaw, plan.launched.precision),
    startQuote: Math.min(plan.quotePerTokenLower, plan.quotePerTokenUpper),
    maxQuote: Math.max(plan.quotePerTokenLower, plan.quotePerTokenUpper),
  };
}

function startSqrt(c: PoolCurve): bigint {
  return c.plan.launchedIsA ? c.sqrtLower : c.sqrtUpper;
}

function scaleSqrt(sqrt: bigint, multiple: number, up: boolean): bigint {
  if (!(multiple > 0) || !Number.isFinite(multiple) || multiple === 1) return sqrt;
  const factor = BigInt(Math.max(1, Math.round(Math.sqrt(multiple) * 1e12)));
  const den = 1_000_000_000_000n;
  return up ? (sqrt * factor) / den : (sqrt * den) / factor;
}

function sqrtForMultiple(c: PoolCurve, multiple: number): { sqrt: bigint; capped: boolean; used: number } {
  const maxMultiple = c.startQuote > 0 ? c.maxQuote / c.startQuote : 1;
  const used = Math.max(1, Math.min(multiple, maxMultiple));
  const capped = multiple > maxMultiple;
  const start = startSqrt(c);
  if (used <= 1) return { sqrt: start, capped: false, used: 1 };
  if (c.plan.launchedIsA) {
    const raw = used === 2 ? mulSqrt2(start) : scaleSqrt(start, used, true);
    const target = minBig(maxBig(raw, c.sqrtLower + 1n), c.sqrtUpper);
    return { sqrt: target, capped: capped || target >= c.sqrtUpper, used };
  }
  const raw = used === 2 ? divSqrt2(start) : scaleSqrt(start, used, false);
  const target = maxBig(minBig(raw, c.sqrtUpper - 1n), c.sqrtLower);
  return { sqrt: target, capped: capped || target <= c.sqrtLower, used };
}

function sqrtForSupplyPct(c: PoolCurve, pct: number): { sqrt: bigint; capped: boolean } {
  const t = Math.min(100, Math.max(0, pct));
  const start = startSqrt(c);
  if (t <= 0) return { sqrt: start, capped: false };
  const want = (c.supplyRaw * BigInt(Math.round(t * 1e6))) / 100_000_000n;
  if (want <= 0n) return { sqrt: start, capped: false };
  if (want >= c.supplyRaw) {
    return { sqrt: c.plan.launchedIsA ? c.sqrtUpper : c.sqrtLower, capped: true };
  }
  if (c.plan.launchedIsA) {
    const den = c.liquidity * Q64 - want * c.sqrtLower;
    if (den <= 0n) return { sqrt: c.sqrtUpper, capped: true };
    const next = (c.liquidity * Q64 * c.sqrtLower) / den;
    return { sqrt: minBig(next, c.sqrtUpper), capped: next >= c.sqrtUpper };
  }
  const next = c.sqrtUpper - (want * Q64) / c.liquidity;
  if (next <= c.sqrtLower) return { sqrt: c.sqrtLower, capped: true };
  return { sqrt: next, capped: false };
}

function tokensAndQuoteBetween(c: PoolCurve, fromSqrt: bigint, toSqrt: bigint): { tokens: bigint; quoteNet: bigint } {
  const lo = minBig(fromSqrt, toSqrt);
  const hi = maxBig(fromSqrt, toSqrt);
  if (c.plan.launchedIsA) {
    return { tokens: getAmount0Delta(lo, hi, c.liquidity), quoteNet: getAmount1Delta(lo, hi, c.liquidity) };
  }
  return { tokens: getAmount1Delta(lo, hi, c.liquidity), quoteNet: getAmount0Delta(lo, hi, c.liquidity) };
}

function quotePerTokenAt(c: PoolCurve, sqrt: bigint): number {
  const start = startSqrt(c);
  if (start <= 0n) return c.startQuote;
  const scaled = Number((sqrt * 1_000_000_000n) / start) / 1e9;
  if (!(scaled > 0) || !Number.isFinite(scaled)) return c.startQuote;
  const ratio = c.plan.launchedIsA ? scaled * scaled : 1 / (scaled * scaled);
  return c.startQuote * ratio;
}

function walkCostFromStart(c: PoolCurve, quoteUsd: number, toSqrt: bigint, capped: boolean, multiple: number): WalkCost {
  const { tokens, quoteNet } = tokensAndQuoteBetween(c, startSqrt(c), toSqrt);
  const quoteGross = rawToNumber(grossUpFee(quoteNet, c.plan.fee), c.plan.quote.precision);
  const tok = rawToNumber(tokens, c.plan.launched.precision);
  return {
    multiple,
    capped,
    quoteGross,
    usd: toUsd(quoteGross, quoteUsd),
    tokens: tok,
    supplyPct: c.supplyHuman > 0 ? (tok / c.supplyHuman) * 100 : 0,
    quotePerToken: quotePerTokenAt(c, toSqrt),
  };
}

function nextSqrtAfterQuoteNet(c: PoolCurve, fromSqrt: bigint, quoteNet: bigint): bigint {
  if (quoteNet <= 0n) return fromSqrt;
  if (c.plan.launchedIsA) {
    return minBig(fromSqrt + (quoteNet * Q64) / c.liquidity, c.sqrtUpper);
  }
  const num = c.liquidity * Q64;
  const product = quoteNet * fromSqrt;
  return maxBig((num * fromSqrt) / (num + product), c.sqrtLower);
}

function walkUsdFrom(
  c: PoolCurve,
  quoteUsd: number,
  usd: number,
  fromSqrt: bigint
): { tokens: bigint; nextSqrt: bigint; capped: boolean } {
  const net = netAfterFee(usdToQuoteRaw(usd, quoteUsd, c.plan.quote.precision), c.plan.fee);
  const next = nextSqrtAfterQuoteNet(c, fromSqrt, net);
  const { tokens } = tokensAndQuoteBetween(c, fromSqrt, next);
  const capped = c.plan.launchedIsA ? next >= c.sqrtUpper : next <= c.sqrtLower;
  return { tokens, nextSqrt: next, capped };
}

export function walkCostToMultiple(
  plan: LaunchPlan,
  maxSupply: string,
  quoteUsd: number,
  multiple: number
): WalkCost | null {
  const c = poolCurve(plan, maxSupply);
  if (!c || !(multiple > 0) || !Number.isFinite(multiple)) return null;
  const t = sqrtForMultiple(c, multiple);
  return walkCostFromStart(c, quoteUsd, t.sqrt, t.capped, t.used);
}

export function walkCostToSupplyPct(
  plan: LaunchPlan,
  maxSupply: string,
  quoteUsd: number,
  pct: number
): WalkCost | null {
  const c = poolCurve(plan, maxSupply);
  if (!c) return null;
  const t = sqrtForSupplyPct(c, pct);
  const multiple = c.startQuote > 0 ? quotePerTokenAt(c, t.sqrt) / c.startQuote : 1;
  return walkCostFromStart(c, quoteUsd, t.sqrt, t.capped, multiple);
}

export function rangeMaxMarketCapUsd(plan: LaunchPlan, maxSupply: string, quoteUsd: number): number | null {
  const c = poolCurve(plan, maxSupply);
  if (!c || !(quoteUsd > 0)) return null;
  return c.supplyHuman * c.maxQuote * quoteUsd;
}

export function buyScenario(
  plan: LaunchPlan,
  maxSupply: string,
  quoteUsd: number,
  firstUsd: number,
  extraUsd: number
): BuyScenario | null {
  const c = poolCurve(plan, maxSupply);
  if (!c || !(quoteUsd > 0) || !(firstUsd > 0) || !Number.isFinite(firstUsd)) return null;
  const extra = Number.isFinite(extraUsd) && extraUsd > 0 ? extraUsd : 0;
  const w1 = walkUsdFrom(c, quoteUsd, firstUsd, startSqrt(c));
  const w2 = extra > 0 ? walkUsdFrom(c, quoteUsd, extra, w1.nextSqrt) : { tokens: 0n, nextSqrt: w1.nextSqrt, capped: w1.capped };
  const firstTokens = rawToNumber(w1.tokens, c.plan.launched.precision);
  const extraTokens = rawToNumber(w2.tokens, c.plan.launched.precision);
  const endQuotePerToken = quotePerTokenAt(c, w2.nextSqrt);
  const bagUsdAfter = firstTokens * endQuotePerToken * quoteUsd;
  return {
    firstUsd,
    extraUsd: extra,
    firstTokens,
    firstSupplyPct: c.supplyHuman > 0 ? (firstTokens / c.supplyHuman) * 100 : 0,
    extraTokens,
    extraSupplyPct: c.supplyHuman > 0 ? (extraTokens / c.supplyHuman) * 100 : 0,
    bagUsdAfter,
    bagMultiple: firstUsd > 0 ? bagUsdAfter / firstUsd : null,
    endQuotePerToken,
    endMarketCapUsd: c.supplyHuman * endQuotePerToken * quoteUsd,
    capped: w2.capped,
  };
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
