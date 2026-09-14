import { ALCOR_MAX_TICK, ALCOR_MIN_TICK } from "@/config/launch";

const Q32 = 1n << 32n;
const MAX_UINT256 = (1n << 256n) - 1n;

function mulShift(val: bigint, mulBy: bigint): bigint {
  return (val * mulBy) >> 128n;
}

/** Uniswap v3 TickMath.getSqrtRatioAtTick → Q64.96, then >> 32 for Alcor Q64.64. */
export function getSqrtRatioX96AtTick(tick: number): bigint {
  const absTick = tick < 0 ? -tick : tick;
  let ratio =
    (absTick & 0x1) !== 0 ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;
  if ((absTick & 0x2) !== 0) ratio = mulShift(ratio, 0xfff97272373d413259a46990580e213an);
  if ((absTick & 0x4) !== 0) ratio = mulShift(ratio, 0xfff2e50f5f656932ef12357cf3c7fdccn);
  if ((absTick & 0x8) !== 0) ratio = mulShift(ratio, 0xffe5caca7e10e4e61c3624eaa0941cd0n);
  if ((absTick & 0x10) !== 0) ratio = mulShift(ratio, 0xffcb9843d60f6159c9db58835c926644n);
  if ((absTick & 0x20) !== 0) ratio = mulShift(ratio, 0xff973b41fa98c081472e6896dfb254c0n);
  if ((absTick & 0x40) !== 0) ratio = mulShift(ratio, 0xff2ea16466c96a3843ec78b326b52861n);
  if ((absTick & 0x80) !== 0) ratio = mulShift(ratio, 0xfe5dee046a99a2a811c461f1969c3053n);
  if ((absTick & 0x100) !== 0) ratio = mulShift(ratio, 0xfcbe86c7900a88aedcffc83b479aa3a4n);
  if ((absTick & 0x200) !== 0) ratio = mulShift(ratio, 0xf987a7253ac413176f2b074cf7815e54n);
  if ((absTick & 0x400) !== 0) ratio = mulShift(ratio, 0xf3392b0822b70005940c7a398e4b70f3n);
  if ((absTick & 0x800) !== 0) ratio = mulShift(ratio, 0xe7159475a2c29b7443b29c7fa6e889d9n);
  if ((absTick & 0x1000) !== 0) ratio = mulShift(ratio, 0xd097f3bdfd2022b8845ad8f792aa5825n);
  if ((absTick & 0x2000) !== 0) ratio = mulShift(ratio, 0xa9f746462d870fdf8a65dc1f90e061e5n);
  if ((absTick & 0x4000) !== 0) ratio = mulShift(ratio, 0x70d869a156d2a1b890bb3df62baf32f7n);
  if ((absTick & 0x8000) !== 0) ratio = mulShift(ratio, 0x31be135f97d08fd981231505542fcfa6n);
  if ((absTick & 0x10000) !== 0) ratio = mulShift(ratio, 0x9aa508b5b7a84e1c677de54f3e99bc9n);
  if ((absTick & 0x20000) !== 0) ratio = mulShift(ratio, 0x5d6af8dedb81196699c329225ee604n);
  if ((absTick & 0x40000) !== 0) ratio = mulShift(ratio, 0x2216e584f5fa1ea926041bedfe98n);
  if ((absTick & 0x80000) !== 0) ratio = mulShift(ratio, 0x48a170391f7dc42444e8fa2n);
  if (tick > 0) ratio = MAX_UINT256 / ratio;
  return ratio % Q32 > 0n ? ratio / Q32 + 1n : ratio / Q32;
}

export function getSqrtPriceX64AtTick(tick: number): bigint {
  return getSqrtRatioX96AtTick(tick) >> 32n;
}

/** Greatest tick whose Alcor sqrtPriceX64 is <= `sqrtPriceX64` (Uniswap v3 / Alcor). */
export function getTickAtSqrtRatio(sqrtPriceX64: bigint): number {
  const minSqrt = getSqrtPriceX64AtTick(ALCOR_MIN_TICK);
  const maxSqrt = getSqrtPriceX64AtTick(ALCOR_MAX_TICK);
  if (sqrtPriceX64 <= minSqrt) return ALCOR_MIN_TICK;
  if (sqrtPriceX64 >= maxSqrt) return ALCOR_MAX_TICK;
  let lo = ALCOR_MIN_TICK;
  let hi = ALCOR_MAX_TICK;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi + 1) / 2);
    if (getSqrtPriceX64AtTick(mid) <= sqrtPriceX64) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function nearestUsableTick(tick: number, spacing: number): number {
  const clamped = Math.max(ALCOR_MIN_TICK, Math.min(ALCOR_MAX_TICK, Math.trunc(tick)));
  const rounded = Math.round(clamped / spacing) * spacing;
  if (rounded < ALCOR_MIN_TICK) return rounded + spacing;
  if (rounded > ALCOR_MAX_TICK) return rounded - spacing;
  return rounded;
}

/** tokenB per tokenA in raw units → tick (floor). */
export function tickFromRawPrice(price: number): number {
  if (!(price > 0) || !Number.isFinite(price)) return 0;
  return Math.floor(Math.log(price) / Math.log(1.0001));
}

export function rawPriceFromTick(tick: number): number {
  return Math.pow(1.0001, tick);
}

export const ONE_X64 = 1n << 64n;
