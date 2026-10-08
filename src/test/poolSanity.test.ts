import { describe, expect, it } from "vitest";
import { amountsAtSqrt } from "@/services/launchMath";
import { backingFromPositions, buildSanity, backingShares, midQuotePerToken, splitCommunityLp } from "@/services/poolSanity";
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

  it("splits community LP into the launch quote, ecosystem quotes, and degen", () => {
    const split = splitCommunityLp({
      slices: [
        { symbol: "EASY", contract: "mon3y", usd: 8000 },
        { symbol: "WON", contract: "w3won", usd: 500 },
        { symbol: "GRAMS", contract: "gold.mon3y", usd: 40 },
        { symbol: "MEME", contract: "m3m3", usd: 30 },
        { symbol: "XMD", contract: "xmd.token", usd: 200 },
        { symbol: "LOAN", contract: "loan.token", usd: 50 },
        { symbol: "XBTC", contract: "xtokens", usd: 300 },
        { symbol: "METAL", contract: "xtokens", usd: 100 },
        { symbol: "INDEX", contract: "foo", usd: 400 },
      ],
      quoteSymbol: "EASY",
      quoteContract: "mon3y",
      hardBackingUsd: 6000,
    });
    expect(split.sameUsd).toBe(2000);
    expect(split.ecosystemUsd).toBe(1220);
    expect(split.degenUsd).toBe(400);
  });

  it("treats several backing quotes as the same pure backing", () => {
    const split = splitCommunityLp({
      slices: [
        { symbol: "XUSDC", contract: "xtokens", usd: 20000 },
        { symbol: "XUSDT", contract: "xtokens", usd: 15000 },
        { symbol: "WON", contract: "w3won", usd: 500 },
      ],
      quoteSymbol: "XUSDC",
      quoteContract: "xtokens",
      quotes: [
        { symbol: "XUSDC", contract: "xtokens" },
        { symbol: "XUSDT", contract: "xtokens" },
      ],
      hardBackingUsd: 30000,
    });
    expect(split.sameUsd).toBe(5000);
    expect(split.ecosystemUsd).toBe(500);
    expect(split.degenUsd).toBe(0);
  });

  it("prices backing from the quote side of the named positions", () => {
    const summed = backingFromPositions({
      tokenSymbol: "EASY",
      quotes: [
        { symbol: "XUSDT", contract: "xtokens" },
        { symbol: "XUSDC", contract: "xtokens" },
        { symbol: "XMD", contract: "xmd.token" },
      ],
      positions: [
        { id: 1, pool: 10, amountA: "100.000000 EASY", amountB: "10.000000 XUSDT" },
        { id: 2, pool: 11, amountA: "80.000000 EASY", amountB: "4.000000 XUSDC" },
        { id: 3, pool: 12, amountA: "50.000000 EASY", amountB: "9.000000 INDEX" },
        { id: 4, pool: 13, closed: true, amountA: "1.000000 EASY", amountB: "1.000000 XMD" },
        { id: 5, pool: 14, amountA: "0.000000 EASY", amountB: "3.000000 XMD" },
      ],
      price: (_contract, symbol) => (symbol === "XMD" ? 0.5 : 1),
    });
    expect(summed.tokens).toBe(180);
    expect(summed.usd).toBeCloseTo(15.5, 8);
    expect(summed.marks.map((row) => row.symbol)).toEqual(["XUSDT", "XUSDC", "XMD"]);
    expect(summed.marks[2].quoteQty).toBe(3);
  });

  it("uses settled backing amounts instead of tick math", () => {
    const view = buildSanity({
      ...GEASY,
      settled: { lockedTokens: 100, lockedQuote: 40 },
      midQuote: 2,
      quoteUsd: 1,
    });
    expect(view.lockedTokens).toBe(100);
    expect(view.lockedQuote).toBe(40);
    expect(view.midQuote).toBe(2);
    expect(view.hardBackingUsd).toBe(40);
    expect(view.fullPrintUsd).toBeCloseTo(2 * GEASY.maxSupply, 6);
    expect(view.backingOverFull).toBeCloseTo(40 / (2 * GEASY.maxSupply), 8);
    expect(view.tokensOut).toBe(0);
    expect(view.bare).toBe(false);
    expect(view.marks).toEqual([]);
  });
});
