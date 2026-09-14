import { ALCOR_MAX_TICK, ALCOR_MIN_TICK, EOSIO_MAX_TIME_SEC, LOCK_MIN_DAYS, tickSpacing, type FeeTier } from "@/config/launch";
import { formatAsset, zeroAsset } from "@/services/assets";
import { sortPair, type ExtToken } from "@/services/eosioName";
import {
  getSqrtPriceX64AtTick,
  getTickAtSqrtRatio,
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

export type TickBucketCost = {
  index: number;
  tickFrom: number;
  tickTo: number;
  quote: number;
  usd: number | null;
  tokens: number;
};

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
  /** Quote per token after the $100 exact-in walk. */
  endQuotePerTokenForUsd: number | null;
  usdWalkCapped: boolean;
  leftoverTokensForUsd: number | null;
  /** Quote USD to walk start to the far tick (all remaining inventory). */
  usdToClearRange: number | null;
  bucketCount: number;
  usdLastBucket: number | null;
  usdCheapHalf: number | null;
  usdExpensiveHalf: number | null;
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

function mulDiv(a: bigint, b: bigint, den: bigint): bigint {
  if (den <= 0n) return 0n;
  return (a * b) / den;
}

function mulDivRoundingUp(a: bigint, b: bigint, den: bigint): bigint {
  if (den <= 0n) return 0n;
  const product = a * b;
  const result = product / den;
  return product % den > 0n ? result + 1n : result;
}

function divRoundingUp(num: bigint, den: bigint): bigint {
  if (den <= 0n) return 0n;
  return num % den > 0n ? num / den + 1n : num / den;
}

/** Alcor SqrtPriceMath::getAmountADelta. Token0 between two sqrts. */
function getAmountADelta(sqrtA: bigint, sqrtB: bigint, liquidity: bigint, roundUp: boolean): bigint {
  const lo = minBig(sqrtA, sqrtB);
  const hi = maxBig(sqrtA, sqrtB);
  if (lo <= 0n || liquidity <= 0n || hi <= lo) return 0n;
  const numerator1 = liquidity << 64n;
  const numerator2 = hi - lo;
  if (roundUp) {
    return divRoundingUp(divRoundingUp(numerator1 * numerator2, hi), lo);
  }
  return (numerator1 * numerator2) / hi / lo;
}

/** Alcor SqrtPriceMath::getAmountBDelta. Token1 between two sqrts. */
function getAmountBDelta(sqrtA: bigint, sqrtB: bigint, liquidity: bigint, roundUp: boolean): bigint {
  const lo = minBig(sqrtA, sqrtB);
  const hi = maxBig(sqrtA, sqrtB);
  if (liquidity <= 0n || hi <= lo) return 0n;
  const diff = hi - lo;
  return roundUp ? mulDivRoundingUp(liquidity, diff, Q64) : mulDiv(liquidity, diff, Q64);
}

function getNextSqrtPriceFromAmountARoundingUp(sqrtP: bigint, liquidity: bigint, amount: bigint, add: boolean): bigint {
  if (amount === 0n || liquidity === 0n || sqrtP <= 0n) return sqrtP;
  const numerator1 = liquidity << 64n;
  if (add) {
    const product = amount * sqrtP;
    const denominator = numerator1 + product;
    if (denominator > 0n) return mulDivRoundingUp(numerator1, sqrtP, denominator);
    return sqrtP;
  }
  const product = amount * sqrtP;
  if (numerator1 <= product) return sqrtP;
  return mulDivRoundingUp(numerator1, sqrtP, numerator1 - product);
}

function getNextSqrtPriceFromAmountBRoundingDown(sqrtP: bigint, liquidity: bigint, amount: bigint, add: boolean): bigint {
  if (liquidity === 0n) return sqrtP;
  if (add) return sqrtP + mulDiv(amount, Q64, liquidity);
  const quotient = mulDivRoundingUp(amount, Q64, liquidity);
  if (sqrtP <= quotient) return sqrtP;
  return sqrtP - quotient;
}

function getNextSqrtPriceFromInput(sqrtP: bigint, liquidity: bigint, amountIn: bigint, aForB: boolean): bigint {
  if (sqrtP === 0n || liquidity === 0n) return sqrtP;
  return aForB
    ? getNextSqrtPriceFromAmountARoundingUp(sqrtP, liquidity, amountIn, true)
    : getNextSqrtPriceFromAmountBRoundingDown(sqrtP, liquidity, amountIn, true);
}

function getNextSqrtPriceFromOutput(sqrtP: bigint, liquidity: bigint, amountOut: bigint, aForB: boolean): bigint {
  if (sqrtP === 0n || liquidity === 0n) return sqrtP;
  return aForB
    ? getNextSqrtPriceFromAmountBRoundingDown(sqrtP, liquidity, amountOut, false)
    : getNextSqrtPriceFromAmountARoundingUp(sqrtP, liquidity, amountOut, false);
}

/**
 * Alcor SwapMath::computeSwapStep (C++ / rust-swap-router). Do not early-return on
 * L=0: empty ticks must jump to the next initialized sqrt so the one-sided launch
 * can enter the range.
 */
function computeSwapStep(
  sqrtCurrent: bigint,
  sqrtTarget: bigint,
  liquidity: bigint,
  amountRemaining: bigint,
  feePips: number
): { sqrtNext: bigint; amountIn: bigint; amountOut: bigint; feeAmount: bigint } {
  const aForB = sqrtCurrent >= sqrtTarget;
  const exactIn = amountRemaining >= 0n;
  const fee = BigInt(feePips);
  let sqrtNext = sqrtCurrent;
  let amountIn = 0n;
  let amountOut = 0n;
  let feeAmount = 0n;

  if (exactIn) {
    const remaining = amountRemaining;
    const remainingLessFee = fee > 0n ? mulDiv(remaining, FEE_DEN - fee, FEE_DEN) : remaining;
    amountIn = aForB
      ? getAmountADelta(sqrtTarget, sqrtCurrent, liquidity, true)
      : getAmountBDelta(sqrtCurrent, sqrtTarget, liquidity, true);
    if (remainingLessFee >= amountIn) sqrtNext = sqrtTarget;
    else sqrtNext = getNextSqrtPriceFromInput(sqrtCurrent, liquidity, remainingLessFee, aForB);
  } else {
    const remaining = -amountRemaining;
    amountOut = aForB
      ? getAmountBDelta(sqrtTarget, sqrtCurrent, liquidity, false)
      : getAmountADelta(sqrtCurrent, sqrtTarget, liquidity, false);
    if (remaining >= amountOut) sqrtNext = sqrtTarget;
    else sqrtNext = getNextSqrtPriceFromOutput(sqrtCurrent, liquidity, remaining, aForB);
  }

  const max = sqrtTarget === sqrtNext;
  if (aForB) {
    amountIn = max && exactIn ? amountIn : getAmountADelta(sqrtNext, sqrtCurrent, liquidity, true);
    amountOut = max && !exactIn ? amountOut : getAmountBDelta(sqrtNext, sqrtCurrent, liquidity, false);
  } else {
    amountIn = max && exactIn ? amountIn : getAmountBDelta(sqrtCurrent, sqrtNext, liquidity, true);
    amountOut = max && !exactIn ? amountOut : getAmountADelta(sqrtCurrent, sqrtNext, liquidity, false);
  }

  if (!exactIn && amountOut > -amountRemaining) amountOut = -amountRemaining;
  if (exactIn && sqrtNext !== sqrtTarget) {
    feeAmount = amountRemaining > amountIn ? amountRemaining - amountIn : 0n;
  } else {
    feeAmount = mulDivRoundingUp(amountIn, fee, FEE_DEN - fee);
  }

  return { sqrtNext, amountIn, amountOut, feeAmount };
}

function mulSqrt2(sqrt: bigint): bigint {
  return (sqrt * SQRT2_X64) / Q64;
}

function divSqrt2(sqrt: bigint): bigint {
  return (sqrt * Q64) / SQRT2_X64;
}

function scaleSqrt(sqrt: bigint, multiple: number, up: boolean): bigint {
  if (!(multiple > 0) || !Number.isFinite(multiple) || multiple === 1) return sqrt;
  const factor = BigInt(Math.max(1, Math.round(Math.sqrt(multiple) * 1e12)));
  const den = 1_000_000_000_000n;
  return up ? (sqrt * factor) / den : (sqrt * den) / factor;
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

type TickBucket = {
  sqrtFrom: bigint;
  sqrtTo: bigint;
  L: bigint;
  tokens: bigint;
};

type TickBook = {
  plan: LaunchPlan;
  buckets: TickBucket[];
  positionL: bigint;
  supplyRaw: bigint;
  supplyHuman: number;
  startQuote: number;
  maxQuote: number;
  sqrtLower: bigint;
  sqrtUpper: bigint;
};

const HUGE_QUOTE_IN = 1n << 100n;

function quotePerTokenAtSqrt(plan: LaunchPlan, sqrt: bigint): number {
  const start = plan.launchedIsA
    ? getSqrtPriceX64AtTick(plan.tickLower)
    : getSqrtPriceX64AtTick(plan.tickUpper);
  const startQuote = Math.min(plan.quotePerTokenLower, plan.quotePerTokenUpper);
  if (start <= 0n || sqrt <= 0n) return startQuote;
  const scaled = Number((sqrt * 1_000_000_000n) / start) / 1e9;
  if (!(scaled > 0) || !Number.isFinite(scaled)) {
    return quotePerTokenFromTick(
      getTickAtSqrtRatio(sqrt),
      plan.launchedIsA,
      plan.tokenA.precision,
      plan.tokenB.precision
    );
  }
  const ratio = plan.launchedIsA ? scaled * scaled : 1 / (scaled * scaled);
  return startQuote * ratio;
}

function makeBook(plan: LaunchPlan, maxSupply: string): TickBook | null {
  const supplyRaw = decimalToRaw(maxSupply, plan.launched.precision);
  if (supplyRaw <= 0n) return null;
  const sqrtLower = getSqrtPriceX64AtTick(plan.tickLower);
  const sqrtUpper = getSqrtPriceX64AtTick(plan.tickUpper);
  if (sqrtLower <= 0n || sqrtUpper <= sqrtLower) return null;
  const spacing = plan.spacing;
  const n = Math.floor((plan.tickUpper - plan.tickLower) / spacing);
  if (n <= 0) return null;
  const base = supplyRaw / BigInt(n);
  const rem = supplyRaw - base * BigInt(n);
  const buckets: TickBucket[] = [];
  for (let i = 0; i < n; i++) {
    const tokens = i === n - 1 ? base + rem : base;
    if (plan.launchedIsA) {
      const tA = plan.tickLower + i * spacing;
      const tB = tA + spacing;
      const sqrtA = getSqrtPriceX64AtTick(tA);
      const sqrtB = getSqrtPriceX64AtTick(tB);
      buckets.push({
        sqrtFrom: sqrtA,
        sqrtTo: sqrtB,
        L: getLiquidityForAmount0(sqrtA, sqrtB, tokens),
        tokens,
      });
    } else {
      const tB = plan.tickUpper - i * spacing;
      const tA = tB - spacing;
      const sqrtA = getSqrtPriceX64AtTick(tA);
      const sqrtB = getSqrtPriceX64AtTick(tB);
      buckets.push({
        sqrtFrom: sqrtB,
        sqrtTo: sqrtA,
        L: getLiquidityForAmount1(sqrtA, sqrtB, tokens),
        tokens,
      });
    }
  }
  const positionL = plan.launchedIsA
    ? getLiquidityForAmount0(sqrtLower, sqrtUpper, supplyRaw)
    : getLiquidityForAmount1(sqrtLower, sqrtUpper, supplyRaw);
  if (positionL <= 0n || buckets.some((b) => b.L <= 0n)) return null;
  return {
    plan,
    buckets,
    positionL,
    supplyRaw,
    supplyHuman: rawToNumber(supplyRaw, plan.launched.precision),
    startQuote: Math.min(plan.quotePerTokenLower, plan.quotePerTokenUpper),
    maxQuote: Math.max(plan.quotePerTokenLower, plan.quotePerTokenUpper),
    sqrtLower,
    sqrtUpper,
  };
}

type WalkState = { i: number; sqrt: bigint };

function startState(book: TickBook): WalkState {
  return { i: 0, sqrt: book.buckets[0]?.sqrtFrom ?? 0n };
}

function walkQuote(
  book: TickBook,
  state: WalkState,
  quoteRaw: bigint,
  sqrtLimit?: bigint
): { quoteIn: bigint; tokensOut: bigint } {
  let remaining = quoteRaw;
  let quoteIn = 0n;
  let tokensOut = 0n;
  const zf1 = !book.plan.launchedIsA;
  const far = book.buckets[book.buckets.length - 1]?.sqrtTo ?? 0n;
  const limit = sqrtLimit ?? far;
  while (state.i < book.buckets.length && remaining > 0n) {
    const b = book.buckets[state.i];
    if (zf1 ? state.sqrt <= limit : state.sqrt >= limit) break;
    const target = zf1 ? maxBig(b.sqrtTo, limit) : minBig(b.sqrtTo, limit);
    const step = computeSwapStep(state.sqrt, target, b.L, remaining, book.plan.fee);
    const spent = step.amountIn + step.feeAmount;
    quoteIn += spent;
    tokensOut += step.amountOut;
    remaining = spent >= remaining ? 0n : remaining - spent;
    state.sqrt = step.sqrtNext;
    const crossed = zf1 ? state.sqrt <= b.sqrtTo : state.sqrt >= b.sqrtTo;
    if (crossed) {
      state.i += 1;
      if (state.i < book.buckets.length) state.sqrt = book.buckets[state.i].sqrtFrom;
    } else {
      break;
    }
  }
  return { quoteIn, tokensOut };
}

function walkTokens(book: TickBook, state: WalkState, tokenRaw: bigint): { quoteIn: bigint; tokensOut: bigint } {
  let need = tokenRaw;
  let quoteIn = 0n;
  let tokensOut = 0n;
  while (state.i < book.buckets.length && need > 0n) {
    const b = book.buckets[state.i];
    const step = computeSwapStep(state.sqrt, b.sqrtTo, b.L, -need, book.plan.fee);
    quoteIn += step.amountIn + step.feeAmount;
    tokensOut += step.amountOut;
    need = step.amountOut >= need ? 0n : need - step.amountOut;
    state.sqrt = step.sqrtNext;
    if (state.sqrt === b.sqrtTo) {
      state.i += 1;
      if (state.i < book.buckets.length) state.sqrt = book.buckets[state.i].sqrtFrom;
    } else {
      break;
    }
  }
  return { quoteIn, tokensOut };
}

function bucketSpend(book: TickBook, b: TickBucket): bigint {
  const step = computeSwapStep(b.sqrtFrom, b.sqrtTo, b.L, HUGE_QUOTE_IN, book.plan.fee);
  return step.amountIn + step.feeAmount;
}

function sqrtForMultiple(book: TickBook, multiple: number): { sqrt: bigint; capped: boolean } {
  const start = book.plan.launchedIsA ? book.sqrtLower : book.sqrtUpper;
  if (!(multiple > 1) || !Number.isFinite(multiple)) return { sqrt: start, capped: false };
  const raw =
    multiple === 2
      ? book.plan.launchedIsA
        ? mulSqrt2(start)
        : divSqrt2(start)
      : scaleSqrt(start, multiple, book.plan.launchedIsA);
  if (book.plan.launchedIsA) {
    const target = minBig(maxBig(raw, book.sqrtLower + 1n), book.sqrtUpper);
    return { sqrt: target, capped: raw >= book.sqrtUpper };
  }
  const target = maxBig(minBig(raw, book.sqrtUpper - 1n), book.sqrtLower);
  return { sqrt: target, capped: raw <= book.sqrtLower };
}

function walkFrom(
  book: TickBook,
  quoteUsd: number,
  quoteIn: bigint,
  tokensOut: bigint,
  endSqrt: bigint,
  multiple: number,
  capped: boolean
): WalkCost {
  const tok = rawToNumber(tokensOut, book.plan.launched.precision);
  const quoteGross = rawToNumber(quoteIn, book.plan.quote.precision);
  return {
    multiple,
    capped,
    quoteGross,
    usd: toUsd(quoteGross, quoteUsd),
    tokens: tok,
    supplyPct: book.supplyHuman > 0 ? (tok / book.supplyHuman) * 100 : 0,
    quotePerToken: quotePerTokenAtSqrt(book.plan, endSqrt),
  };
}

export function walkCostToMultiple(
  plan: LaunchPlan,
  maxSupply: string,
  quoteUsd: number,
  multiple: number
): WalkCost | null {
  const book = makeBook(plan, maxSupply);
  if (!book || !(multiple > 0) || !Number.isFinite(multiple)) return null;
  const startSqrt = book.plan.launchedIsA ? book.sqrtLower : book.sqrtUpper;
  if (multiple <= 1) return walkFrom(book, quoteUsd, 0n, 0n, startSqrt, 1, false);
  const t = sqrtForMultiple(book, multiple);
  const state = startState(book);
  const r = walkQuote(book, state, HUGE_QUOTE_IN, t.sqrt);
  return walkFrom(book, quoteUsd, r.quoteIn, r.tokensOut, state.sqrt, multiple, t.capped);
}

export function walkCostToSupplyPct(
  plan: LaunchPlan,
  maxSupply: string,
  quoteUsd: number,
  pct: number
): WalkCost | null {
  const book = makeBook(plan, maxSupply);
  if (!book) return null;
  const t = Math.min(100, Math.max(0, pct));
  const startSqrt = book.plan.launchedIsA ? book.sqrtLower : book.sqrtUpper;
  if (t <= 0) return walkFrom(book, quoteUsd, 0n, 0n, startSqrt, 1, false);
  const want = (book.supplyRaw * BigInt(Math.round(t * 1e6))) / 100_000_000n;
  const state = startState(book);
  const r = walkTokens(book, state, want > 0n ? want : 1n);
  const capped = r.tokensOut < want || t >= 100;
  const multiple = book.startQuote > 0 ? quotePerTokenAtSqrt(book.plan, state.sqrt) / book.startQuote : 1;
  return walkFrom(book, quoteUsd, r.quoteIn, r.tokensOut, state.sqrt, multiple, capped);
}

export function rangeMaxMarketCapUsd(plan: LaunchPlan, maxSupply: string, quoteUsd: number): number | null {
  const book = makeBook(plan, maxSupply);
  if (!book || !(quoteUsd > 0)) return null;
  return book.supplyHuman * book.maxQuote * quoteUsd;
}

export function buyScenario(
  plan: LaunchPlan,
  maxSupply: string,
  quoteUsd: number,
  firstUsd: number,
  extraUsd: number
): BuyScenario | null {
  const book = makeBook(plan, maxSupply);
  if (!book || !(quoteUsd > 0) || !(firstUsd > 0) || !Number.isFinite(firstUsd)) return null;
  const extra = Number.isFinite(extraUsd) && extraUsd > 0 ? extraUsd : 0;
  const state = startState(book);
  const r1 = walkQuote(book, state, usdToQuoteRaw(firstUsd, quoteUsd, plan.quote.precision));
  const r2 = extra > 0 ? walkQuote(book, state, usdToQuoteRaw(extra, quoteUsd, plan.quote.precision)) : { quoteIn: 0n, tokensOut: 0n };
  const firstTokens = rawToNumber(r1.tokensOut, plan.launched.precision);
  const extraTokens = rawToNumber(r2.tokensOut, plan.launched.precision);
  const endQuotePerToken = quotePerTokenAtSqrt(plan, state.sqrt);
  const bagUsdAfter = firstTokens * endQuotePerToken * quoteUsd;
  return {
    firstUsd,
    extraUsd: extra,
    firstTokens,
    firstSupplyPct: book.supplyHuman > 0 ? (firstTokens / book.supplyHuman) * 100 : 0,
    extraTokens,
    extraSupplyPct: book.supplyHuman > 0 ? (extraTokens / book.supplyHuman) * 100 : 0,
    bagUsdAfter,
    bagMultiple: firstUsd > 0 ? bagUsdAfter / firstUsd : null,
    endQuotePerToken,
    endMarketCapUsd: book.supplyHuman * endQuotePerToken * quoteUsd,
    capped: state.i >= book.buckets.length,
  };
}

/**
 * Each fee-tier spacing interval is its own bucket with an equal share of supply.
 * Buyers walk cheap ticks first. Upper buckets are priced with that bucket's L.
 */
export function rangeImpact(plan: LaunchPlan, maxSupply: string, quoteUsd = 0, usdProbe = USD_BUY_PROBE): RangeImpact | null {
  const book = makeBook(plan, maxSupply);
  if (!book) return null;
  const n = book.buckets.length;
  const mid = Math.floor(n / 2);
  let cheapRaw = 0n;
  let expRaw = 0n;
  let lastRaw = 0n;
  for (let i = 0; i < n; i++) {
    const spent = bucketSpend(book, book.buckets[i]);
    if (i < mid) cheapRaw += spent;
    else expRaw += spent;
    if (i === n - 1) lastRaw = spent;
  }
  const drainRaw = cheapRaw + expRaw;

  const t2 = sqrtForMultiple(book, 2);
  const doubleState = startState(book);
  const doubled = walkQuote(book, doubleState, HUGE_QUOTE_IN, t2.sqrt);
  const quoteToDouble = rawToNumber(doubled.quoteIn, plan.quote.precision);

  let tokensHuman: number | null = null;
  let leftoverTokensForUsd: number | null = null;
  let endQuotePerTokenForUsd: number | null = null;
  let usdWalkCapped = false;
  let quoteForUsd: number | null = null;
  if (quoteUsd > 0) {
    const buyState = startState(book);
    const quoteRaw = usdToQuoteRaw(usdProbe, quoteUsd, plan.quote.precision);
    const bought = walkQuote(book, buyState, quoteRaw);
    tokensHuman = rawToNumber(bought.tokensOut, plan.launched.precision);
    leftoverTokensForUsd = rawToNumber(
      book.supplyRaw > bought.tokensOut ? book.supplyRaw - bought.tokensOut : 0n,
      plan.launched.precision
    );
    endQuotePerTokenForUsd = quotePerTokenAtSqrt(plan, buyState.sqrt);
    usdWalkCapped = leftoverTokensForUsd <= 0;
    quoteForUsd = usdProbe / quoteUsd;
  }

  const supplyPct =
    tokensHuman != null && book.supplyHuman > 0 ? (tokensHuman / book.supplyHuman) * 100 : null;
  const qprec = plan.quote.precision;

  return {
    liquidity: book.positionL.toString(),
    startQuotePerToken: book.startQuote,
    maxQuotePerToken: book.maxQuote,
    doubledQuotePerToken: t2.capped ? book.maxQuote : book.startQuote * 2,
    doubledCapped: t2.capped,
    quoteToDouble,
    usdToDouble: toUsd(quoteToDouble, quoteUsd),
    initialMarketCapUsd: quoteUsd > 0 ? book.supplyHuman * book.startQuote * quoteUsd : null,
    usdProbe,
    tokensForUsd: tokensHuman,
    supplyPctForUsd: supplyPct,
    quoteForUsd,
    endQuotePerTokenForUsd,
    usdWalkCapped,
    leftoverTokensForUsd,
    usdToClearRange: toUsd(rawToNumber(drainRaw, qprec), quoteUsd),
    bucketCount: n,
    usdLastBucket: toUsd(rawToNumber(lastRaw, qprec), quoteUsd),
    usdCheapHalf: toUsd(rawToNumber(cheapRaw, qprec), quoteUsd),
    usdExpensiveHalf: toUsd(rawToNumber(expRaw, qprec), quoteUsd),
  };
}

export function tickBucketCosts(plan: LaunchPlan, maxSupply: string, quoteUsd = 0): TickBucketCost[] {
  const book = makeBook(plan, maxSupply);
  if (!book) return [];
  const qprec = plan.quote.precision;
  const tprec = plan.launched.precision;
  return book.buckets.map((b, index) => {
    const quote = rawToNumber(bucketSpend(book, b), qprec);
    return {
      index,
      tickFrom: getTickAtSqrtRatio(b.sqrtFrom),
      tickTo: getTickAtSqrtRatio(b.sqrtTo),
      quote,
      usd: toUsd(quote, quoteUsd),
      tokens: rawToNumber(b.tokens, tprec),
    };
  });
}

