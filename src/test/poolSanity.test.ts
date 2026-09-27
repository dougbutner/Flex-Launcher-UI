import { describe, expect, it } from "vitest";
import { amountsAtSqrt } from "@/services/launchMath";
import { buildSanity, backingShares, midQuotePerToken } from "@/services/poolSanity";
import { getSqrtPriceX64AtTick } from "@/services/tickMath";

const GEASY = {
  maxSupply: 420_000_000,
  tokenPrecision: 6,
  quotePrecision: 6,
  tokenIsA: true,
  sqrtNow: 974684074155817426n,
  sqrtStart: 579877079621873182n,
  tickLower: -69000,
  tickUpper: 443600,
  liquidity: 13336742291379n,
  swapAlcorTokens: 281_800_230.478201,
  quoteUsd: 0.02,
  allPoolsQuoteUsd: 12_000,
  poolTvlUsd: 18_277.71,
  volumeUsd24: 360,
};

describe("pool sanity", () => {
  it("prices the GEASY day-one range from the live pool snapshot", () => {
    const view = buildSanity(GEASY);
    expect(Math.abs(view.midQuote - 0.00279183) / 0.00279183).toBeLessThan(0.002);
    expect(view.lockedTokens).toBeGreaterThan(240_000_000);
    expect(view.lockedTokens).toBeLessThan(270_000_000);
    expect(view.lockedQuote).toBeGreaterThan(200_000);
    expect(view.lockedQuote).toBeLessThan(290_000);
    expect(view.tokensOut).toBeGreaterThan(0);
    expect(view.quoteIn).toBeCloseTo(view.lockedQuote, 4);
    expect(view.avgPaidQuote).toBeGreaterThan(0);
    expect(view.avgPaidQuote!).toBeLessThan(view.midQuote);
    expect(view.tradableSupply).toBeCloseTo(GEASY.maxSupply - view.lockedTokens, 4);
    expect(view.walletFloat + view.satelliteTokens).toBeCloseTo(view.tradableSupply, 4);
    expect(view.walletFloat).toBeCloseTo(GEASY.maxSupply - GEASY.swapAlcorTokens, 4);
    expect(view.satelliteTokens).toBeCloseTo(GEASY.swapAlcorTokens - view.lockedTokens, 4);
    expect(view.redeemQuote).toBeCloseTo(view.lockedQuote / view.tradableSupply, 12);
    expect(view.redeemUsd).toBeCloseTo(view.redeemQuote! * GEASY.quoteUsd, 12);
    expect(view.avgOverRedeem).toBeCloseTo(view.avgPaidQuote! / view.redeemQuote!, 8);
    expect(view.backingOverWallet).toBeCloseTo(view.lockedQuote / (view.midQuote * view.walletFloat), 8);
    expect(view.bookCover).toBeCloseTo(view.lockedQuote / (view.midQuote * view.tradableSupply), 8);
    expect(view.backingOverFull).toBeLessThan(view.backingOverWallet!);
    expect(view.hardBackingUsd).toBeCloseTo(view.lockedQuote * GEASY.quoteUsd, 6);
    expect(view.liquidBackingUsd).toBe(GEASY.allPoolsQuoteUsd);
    expect(view.unlockUnix).toBe(0);
    expect(view.tradablePrintUsd).toBeCloseTo(view.midUsd! * view.tradableSupply, 4);
    expect(view.walletPrintUsd).toBeCloseTo(view.midUsd! * view.walletFloat, 4);
    expect(view.fullPrintUsd).toBeCloseTo(view.midUsd! * GEASY.maxSupply, 4);
    expect(view.volOverBacking).toBeCloseTo(GEASY.volumeUsd24 / view.hardBackingUsd!, 8);
    expect(view.volOverTradable).toBeCloseTo(GEASY.volumeUsd24 / view.tradablePrintUsd!, 8);
    expect(view.poolRedeemCover).toBeCloseTo(GEASY.allPoolsQuoteUsd / view.walletPrintUsd!, 8);
    expect(view.lpLoyalty).toBeCloseTo(view.satelliteTokens / (view.satelliteTokens + view.walletFloat), 8);
    expect(view.poolTvlUsd).toBe(GEASY.poolTvlUsd);
    expect(view.backing).toEqual([]);
    expect(view.poolBook).toEqual([]);
  });

  it("has no average paid while the range is still untouched", () => {
    const tickLower = -600;
    const tickUpper = 6000;
    const sqrtLower = getSqrtPriceX64AtTick(tickLower);
    const sqrtNow = getSqrtPriceX64AtTick(tickLower - 60);
    const view = buildSanity({
      maxSupply: 1_000_000,
      tokenPrecision: 4,
      quotePrecision: 4,
      tokenIsA: true,
      sqrtNow,
      sqrtStart: sqrtNow,
      tickLower,
      tickUpper,
      liquidity: 1_000_000n,
      swapAlcorTokens: 1_000_000,
      quoteUsd: 1,
      allPoolsQuoteUsd: 0,
      poolTvlUsd: 0,
      volumeUsd24: 0,
    });
    expect(view.lockedQuote).toBe(0);
    expect(view.tokensOut).toBe(0);
    expect(view.avgPaidQuote).toBeNull();
    expect(view.avgOverRedeem).toBeNull();
    expect(view.redeemQuote).toBe(0);
    expect(view.tradableSupply).toBeCloseTo(1_000_000 - view.lockedTokens, 6);
    expect(sqrtNow < sqrtLower || sqrtNow === sqrtLower).toBe(true);
  });

  it("counts quote in when the launched token is token B", () => {
    const tickLower = -4000;
    const tickUpper = 4000;
    const sqrtUpper = getSqrtPriceX64AtTick(tickUpper);
    const sqrtNow = getSqrtPriceX64AtTick(0);
    const liquidity = 80_000_000_000_000n;
    const now = amountsAtSqrt({
      liquidity,
      sqrtLower: getSqrtPriceX64AtTick(tickLower),
      sqrtUpper,
      sqrtPrice: sqrtNow,
    });
    const start = amountsAtSqrt({
      liquidity,
      sqrtLower: getSqrtPriceX64AtTick(tickLower),
      sqrtUpper,
      sqrtPrice: sqrtUpper,
    });
    expect(start.amountA).toBe(0n);
    expect(start.amountB).toBeGreaterThan(now.amountB);
    expect(now.amountA).toBeGreaterThan(0n);
    const view = buildSanity({
      maxSupply: 2_000_000,
      tokenPrecision: 4,
      quotePrecision: 6,
      tokenIsA: false,
      sqrtNow,
      sqrtStart: sqrtUpper,
      tickLower,
      tickUpper,
      liquidity,
      swapAlcorTokens: 500_000,
      quoteUsd: 0.5,
      allPoolsQuoteUsd: 100,
      poolTvlUsd: 50,
      volumeUsd24: 10,
    });
    expect(view.tokensOut).toBeGreaterThan(0);
    expect(view.quoteIn).toBeGreaterThan(0);
    expect(view.avgPaidQuote).toBeGreaterThan(0);
    expect(view.midQuote).toBeCloseTo(
      midQuotePerToken(sqrtNow, false, 4, 6),
      12
    );
    expect(view.hardBackingUsd).toBeCloseTo(view.lockedQuote * 0.5, 8);
  });

  it("groups quote-side dollars into backing shares", () => {
    const rows = backingShares([
      { symbol: "EASY", contract: "mon3y", usd: 75 },
      { symbol: "easy", contract: "mon3y", usd: 25 },
      { symbol: "XPR", contract: "eosio.token", usd: 0 },
      { symbol: "WON", contract: "w3won", usd: 100 },
    ]);
    expect(rows.map((row) => row.symbol)).toEqual(["EASY", "WON"]);
    expect(rows[0].share).toBeCloseTo(0.5, 8);
    expect(rows[1].share).toBeCloseTo(0.5, 8);
  });
});
