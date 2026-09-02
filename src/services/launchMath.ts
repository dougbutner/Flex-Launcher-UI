import {
  ALCOR_MAX_TICK,
  ALCOR_MIN_TICK,
  FLEXFOREX_CONTRACT,
  tickSpacing,
  type FeeTier,
} from "@/config/launch";
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
  quote: ExtToken;
  fee: FeeTier;
  priceLower: string;
  priceUpper: string;
}): LaunchPlan {
  const launched: ExtToken = { symbol: input.symbol, contract: FLEXFOREX_CONTRACT, precision: input.precision };
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

export function unlockTimeUnix(lockDays: number): number {
  const days = Math.max(90, Math.floor(lockDays));
  return Math.floor(Date.now() / 1000) + days * 86400;
}
