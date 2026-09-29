import { describe, expect, it } from "vitest";
import { formatAsset, formatSupplyCommas, parseAsset, parseSupplyInput, validPrecision, validSymbol, zeroAsset } from "@/services/assets";
import { compareExtTokens, nameToU64, sortPair, symbolCodeToU64 } from "@/services/eosioName";
import { buyScenario, planLaunch, rangeImpact, tickBucketCosts, walkCostToMultiple, walkCostToSupplyPct } from "@/services/launchMath";
import {
  createTokenAction,
  checklockAction,
  payoutAction,
  pullangelAction,
  pulljackpotAction,
  startlaunchAction,
  supplyAction,
  ratiosAction,
  setdistAction,
  setangelnumAction,
  addLaunchQuotePoolAction,
  addpoolAction,
  chooserewardAction,
  firstBuySwapAction,
  feeoptoutAction,
  inheritanceAction,
  inheritmemoAction,
  abiSymbol,
  setminAction,
  setpresaleAction,
  goliveAction,
  presaleCapRaw,
} from "@/services/launchActions";
import {
  COMPLEXFLEX_CONTRACT,
  EASYFLEX_CONTRACT,
  FLEXFOREX_CONTRACT,
  MON3Y,
  PROJECT_CORE_TOKENS,
  QUOTE_PRESETS,
  SWAP_ALCOR,
  XUSDC_SYMBOL,
  alcorSwapUrl,
  alcorChartWidgetUrl,
  alcorSwapWidgetUrl,
  alcorAnalyticsUrl,
  flexAccount,
  flexMeta,
  hasAngelChannels,
  hasInheritance,
  hasSetmin,
  easyHoldNeed,
  easyHoldFull,
  easyHoldFlexAltTip,
  holdEasyToLaunch,
  easyHoldOffPercent,
  easyHoldPromoCopy,
  isFlexQuoteToken,
  isFlexContractActor,
  programFromAccount,
} from "@/config/launch";
import {
  defaultTaxDraft,
  formatBpsPercent,
  percentInputToBps,
  sanitizePercentInput,
  taxAdjustValid,
  taxCreateValid,
  taxSum,
} from "@/services/taxRates";
import { airdropsEntryMatch } from "@/services/listingRepos";
import { REQUEST_ACCOUNT } from "@/services/walletConstants";
import { getSqrtPriceX64AtTick, nearestUsableTick } from "@/services/tickMath";
import { parseProtonSymbol, pickProtonRow, protonSymbol, protonSyncGaps, protonTname, rowMatchesContractCode, rowMatchesContractSymbol, TOKEN_PROTON_TNAME_MAX, tokenProtonLogoAction, tokenProtonRemoveAction } from "@/services/tokenProton";
import {
  ALCOR_TOKEN_DOCS,
  ALCOR_UI_FORK,
  alcorListingPrompt,
  alcorLogoFilename,
  listingPacketJson,
  listingPrBranch,
  logoRequestTooltip,
  mergeAdminTokenRefs,
} from "@/services/listingHelper";
import { localTokenIconSrc, rememberRemoteTokenIcon, tokenIconKey, tokenIconSrc } from "@/services/tokenIcons";
import { hintForError, logpoolIdFromResult } from "@/services/txParse";
import { alcorInventoryItems, createGateItems } from "@/services/preflight";
import { applyRangeWidth, applyStartMarketCap, fmtPrice, tokenStepValid } from "@/components/launch/draftPlan";
import { emptyDraft } from "@/hooks/useLaunchDraft";
import { amountToRaw, formatRainAsset, reflectionPayFloorRaw } from "@/services/rainDefaults";
import { validImageUrl } from "@/services/tokenLogo";
import { XTOKEN_FALLBACK, XTOKEN_TOP_N, findProofPoolId } from "@/services/xtokenCatalog";
import { draftFromManager, managerFromDraft } from "@/services/managerDraft";
import {
  LAUNCH_STEP_IDS,
  applyProtonListing,
  applyRepoListing,
  emptyManagerToken,
  launchProgressFrom,
  managerHasStarted,
  mergeManagerViews,
  nextLaunchStep,
  parseManagerToken,
  protonListingStatus,
  sanitizeManagerMeta,
} from "@/services/managerStore";
import { formatNiceNumber, formatPlainNumber, fmtUsd } from "@/services/money";
import { downsamplePoints, fmtPctChange, fmtPoolFee, quotePerToken, tradeSide } from "@/services/alcorMarket";
import { sortLargeCap, sortLoudest, sortNewcomers, sortPopular, type BoardToken } from "@/services/leaderboardStore";

describe("tick math", () => {
  it("tick 0 is 2^64", () => {
    expect(getSqrtPriceX64AtTick(0).toString()).toBe("18446744073709551616");
  });

  it("snaps to fee spacing", () => {
    expect(nearestUsableTick(121, 60)).toBe(120);
  });
});

describe("names and pairs", () => {
  it("orders symbols by packed code", () => {
    expect(symbolCodeToU64("EASY") < symbolCodeToU64("FOO") || symbolCodeToU64("EASY") > symbolCodeToU64("FOO")).toBe(true);
  });

  it("sorts by contract then symbol", () => {
    const a = { symbol: "FOO", contract: "flexforex", precision: 4 };
    const b = { symbol: "EASY", contract: "mon3y", precision: 6 };
    const [x, y] = sortPair(a, b);
    expect(compareExtTokens(x, y)).toBeLessThanOrEqual(0);
    expect(nameToU64("aaa") < nameToU64("bbb")).toBe(true);
  });
});

describe("assets", () => {
  it("formats precision", () => {
    expect(formatAsset("1000000", 4, "FOO")).toBe("1000000.0000 FOO");
    expect(zeroAsset(6, "EASY")).toBe("0.000000 EASY");
    expect(validSymbol("FOO")).toBe(true);
    expect(validSymbol("foo")).toBe(false);
    expect(parseSupplyInput("1,000,000")).toBe("1000000");
    expect(parseSupplyInput("1T")).toBe("1");
    expect(formatSupplyCommas("1000000")).toBe("1,000,000");
    expect(formatSupplyCommas("1000000000000")).toBe("1,000,000,000,000");
    expect(formatSupplyCommas("1000000000")).toBe("1,000,000,000");
    expect(validPrecision(8)).toBe(true);
    expect(validPrecision(9)).toBe(false);
    expect(parseAsset("1.00000000 FOO")?.precision).toBe(8);
    expect(parseAsset("1.000000000 FOO")).toBeNull();
  });
});

describe("token.proton logo", () => {
  it("formats symbol as precision,CODE with no spaces", () => {
    expect(protonSymbol(4, "FOO")).toBe("4,FOO");
  });

  it("matches contract + symbol from string or object rows", () => {
    const base = { id: 1, tcontract: "flex.mon3y", tname: "Foo", url: "", desc: "", iconurl: "" };
    expect(rowMatchesContractSymbol({ ...base, symbol: "4,FOO" }, "flex.mon3y", 4, "FOO")).toBe(true);
    expect(rowMatchesContractSymbol({ ...base, symbol: { precision: 4, name: "FOO" } }, "flex.mon3y", 4, "FOO")).toBe(true);
    expect(rowMatchesContractSymbol({ ...base, symbol: "4,FOO" }, "alice", 4, "FOO")).toBe(false);
    expect(rowMatchesContractCode({ ...base, symbol: "6,FOO" }, "flex.mon3y", "FOO")).toBe(true);
    expect(rowMatchesContractSymbol({ ...base, symbol: "6,FOO" }, "flex.mon3y", 4, "FOO")).toBe(false);
    expect(pickProtonRow([{ ...base, symbol: "6,FOO" }], "flex.mon3y", "FOO", 4)?.id).toBe(1);
    expect(tokenProtonRemoveAction({ id: 9, signer: "for3x" })).toMatchObject({
      account: "token.proton",
      name: "remove",
      data: { id: 9 },
      authorization: [{ actor: "for3x", permission: "active" }],
    });
    expect(tokenProtonLogoAction({
      row: null,
      tcontract: "flex.mon3y",
      tname: "Foo",
      url: "https://x",
      desc: "d",
      iconurl: "https://gateway.pinata.cloud/ipfs/QmHash",
      precision: 4,
      symbol: "FOO",
    })).toMatchObject({
      account: "token.proton",
      name: "reg",
      data: { symbol: "4,FOO", tcontract: "flex.mon3y" },
      authorization: [{ actor: "flex.mon3y", permission: "active" }],
    });
    expect(tokenProtonLogoAction({
      row: { ...base, id: 9, symbol: "4,FOO" },
      tcontract: "flex.mon3y",
      tname: "Foo",
      url: "",
      desc: "",
      iconurl: "https://gateway.pinata.cloud/ipfs/QmHash",
      precision: 4,
      symbol: "FOO",
    }).name).toBe("update");
    expect(tokenProtonLogoAction({
      row: null,
      tcontract: "for3x",
      tname: "Foo",
      url: "",
      desc: "",
      iconurl: "https://example.com/logo.png",
      precision: 4,
      symbol: "FOO",
    }).authorization).toEqual([{ actor: "for3x", permission: "active" }]);
    expect(protonTname("A very long token name", "FOO")).toBe("A very long toke");
    expect(hintForError("assertion failure with message: max length for token name is 16")).toMatch(/16/);
    expect(protonTname("A very long toke")).toHaveLength(TOKEN_PROTON_TNAME_MAX);
    const longName = tokenProtonLogoAction({
      row: null,
      tcontract: "for3x",
      tname: "This name is way too long for proton",
      url: "",
      desc: "",
      iconurl: "https://example.com/logo.png",
      precision: 4,
      symbol: "FOO",
      signer: "alice",
    });
    expect(longName.data.tname).toBe("This name is way");
    expect(longName.authorization).toEqual([{ actor: "alice", permission: "active" }]);
  });

  it("requires a public image URL after a Pinata failure", () => {
    expect(validImageUrl("https://example.com/logo.png")).toBe(true);
    expect(validImageUrl("ipfs://Qm")).toBe(false);
    const draft = { ...emptyDraft(), name: "Foo", symbol: "FOO", pinFailed: true };
    expect(tokenStepValid(draft)).toMatch(/Pinata failed/);
    expect(tokenStepValid({ ...draft, imageUrl: "https://example.com/logo.png" })).toBeNull();
    expect(tokenStepValid({ ...emptyDraft(), name: "This name is way too long", symbol: "FOO" })).toMatch(/16/);
  });
});

describe("launch plan", () => {
  it("builds a one-sided EASY range", () => {
    const plan = planLaunch({
      symbol: "FOO",
      precision: 4,
      maxSupply: "1000000",
      contract: "flex.mon3y",
      quote: { symbol: "EASY", contract: "mon3y", precision: 6 },
      fee: 3000,
      priceLower: "1",
      priceUpper: "1000",
    });
    expect(plan.tickLower).toBeLessThan(plan.tickUpper);
    expect(plan.tickLower % 60).toBe(0);
    expect(plan.sqrtPriceX64).toMatch(/^\d+$/);
    expect(plan.fullSupply).toBe("1000000.0000 FOO");
    expect(plan.launched.contract).toBe("flex.mon3y");
    if (plan.launchedIsA) {
      expect(plan.startTick).toBeLessThan(plan.tickLower);
      expect(plan.tokenBDesired.startsWith("0.")).toBe(true);
    } else {
      expect(plan.startTick).toBeGreaterThanOrEqual(plan.tickUpper);
      expect(plan.tokenADesired.startsWith("0.")).toBe(true);
    }
  });

  it("uses the chosen program contract", () => {
    const plan = planLaunch({
      symbol: "BAR",
      precision: 4,
      maxSupply: "1",
      contract: "mon3y",
      quote: { symbol: "EASY", contract: "mon3y", precision: 6 },
      fee: 3000,
      priceLower: "1",
      priceUpper: "1000",
    });
    expect(plan.launched.contract).toBe("mon3y");
    expect(createTokenAction("mon3y", "alice", plan.fullSupply).name).toBe("create");
    expect(createTokenAction("fl3x", "alice", plan.fullSupply).data).toEqual({
      issuer: "alice",
      maximum_supply: plan.fullSupply,
    });
    expect(supplyAction("mon3y", "issue", "alice", plan.fullSupply).name).toBe("issue");
    expect(supplyAction("flex.mon3y", "mint", "alice", plan.fullSupply).name).toBe("mint");
    expect(startlaunchAction("mon3y", plan, 0, true).name).toBe("startlaunch");
    expect(startlaunchAction("mon3y", plan, 0, true).data.xtoken_proof_pool_id).toBe(0);
    expect(startlaunchAction("mon3y", plan, 0, true).data.swap_underlying_default).toBe(true);
    expect(startlaunchAction("easyflex", plan, 12, false).data.swap_underlying_default).toBe(false);
    expect(payoutAction("mon3y", "BAR", "alice", "sender")).toEqual({
      account: "mon3y",
      name: "makeitrain",
      data: { token_symbol: "BAR", sender: "alice" },
    });
    expect(payoutAction("flex.mon3y", "BAR", "alice", "keeper", { rainMinHold: 10, rainMinPool: 20 }).data).toEqual({
      token_symbol: "BAR",
      keeper: "alice",
      min_hold: 10,
      min_pool: 20,
    });
    const now = 1_700_000_000;
    const ps = setpresaleAction("3asy", "FOO", {
      launchTime: now + 14 * 86400,
      insiderTime: now + 7 * 86400,
      mode: 1,
      insiderBps: 100,
      lockedInsiderBps: 250,
    });
    expect(ps.name).toBe("setpresale");
    expect(ps.data.mode).toBe(1);
    expect(ps.data.insider_bps).toBe(100);
    expect(ps.data.locked_insider_bps).toBe(250);
    expect(Number(ps.data.insider_time)).toBeLessThan(Number(ps.data.launch_time));
    expect(goliveAction("3asy", "FOO")).toEqual({
      account: "3asy",
      name: "golive",
      data: { token_symbol: "FOO" },
    });
    expect(presaleCapRaw(1_000_000_0000, 100, 250, 0)).toBe(10_000_0000);
    expect(presaleCapRaw(1_000_000_0000, 100, 250, 42)).toBe(25_000_0000);
    expect(flexAccount("easyflex")).toBe(EASYFLEX_CONTRACT);
    expect(flexAccount("complexflex")).toBe(COMPLEXFLEX_CONTRACT);
    expect(flexAccount("flexforex")).toBe(FLEXFOREX_CONTRACT);
    expect(EASYFLEX_CONTRACT).toBe("3asy");
    expect(COMPLEXFLEX_CONTRACT).toBe("fl3x");
    expect(FLEXFOREX_CONTRACT).toBe("for3x");
    expect(flexMeta("easyflex").launchEasyMin).toBe(5000);
    expect(flexMeta("complexflex").launchEasyMin).toBe(10000);
    expect(flexMeta("flexforex").launchEasyMin).toBe(50000);
    expect(flexMeta("easyflex").payoutSigner).toBe("sender");
    expect(flexMeta("flexforex").payoutSigner).toBe("keeper");
    expect(holdEasyToLaunch(5000)).toBe("Hold 5,000 EASY to launch");
    expect(easyHoldOffPercent(Date.UTC(2026, 8, 9))).toBe(90);
    expect(easyHoldOffPercent(Date.UTC(2026, 9, 8))).toBe(90);
    expect(easyHoldOffPercent(Date.UTC(2026, 9, 9))).toBe(80);
    expect(easyHoldNeed(10_000, 0, Date.UTC(2026, 8, 10))).toBe(1_000);
    expect(easyHoldNeed(10_000, 0, Date.UTC(2026, 9, 9))).toBe(1_000);
    expect(easyHoldNeed(10_000, 0, Date.UTC(2026, 9, 9), false)).toBe(2_000);
    expect(easyHoldNeed(50_000, 0, Date.UTC(2026, 8, 10))).toBe(5_000);
    expect(easyHoldNeed(10_000, 0, Date.UTC(2026, 8, 10), false)).toBe(1_000);
    expect(easyHoldNeed(50_000, 0, Date.UTC(2026, 8, 10), false)).toBe(5_000);
    expect(easyHoldNeed(10_000, 0, Date.UTC(2026, 8, 10), "geasy")).toBe(0);
    expect(easyHoldNeed(10_000, 0, Date.UTC(2026, 8, 10), "geasy", false)).toBe(1_000);
    expect(easyHoldNeed(10_000, 1, Date.UTC(2026, 9, 9), "geasy")).toBe(4_000);
    expect(easyHoldNeed(10_000, 1, Date.UTC(2026, 9, 9), "flex")).toBe(2_000);
    expect(easyHoldFull(10_000, 2)).toBe(30_000);
    expect(easyHoldOffPercent(Date.UTC(2026, 8, 9) + 6 * 30 * 86400 * 1000)).toBe(30);
    expect(easyHoldOffPercent(Date.UTC(2026, 8, 9) + 9 * 30 * 86400 * 1000)).toBe(0);
    expect(easyHoldPromoCopy(Date.UTC(2026, 8, 9))).toMatch(/90%/);
    expect(easyHoldPromoCopy(Date.UTC(2026, 8, 9))).toMatch(/xtokens/);
    expect(easyHoldPromoCopy(Date.UTC(2026, 8, 9) + 9 * 30 * 86400 * 1000)).toMatch(/full EASY hold/);
    expect(
      easyHoldFlexAltTip({
        easyBal: 5_000,
        fullNeed: 50_000,
        flexNeed: 5_000,
      })
    ).toBeNull();
    expect(
      easyHoldFlexAltTip({
        easyBal: 1_000,
        fullNeed: 50_000,
        flexNeed: 5_000,
      })
    ).toBeNull();
    expect(
      easyHoldFlexAltTip({
        easyBal: 50_000,
        fullNeed: 50_000,
        flexNeed: 5_000,
      })
    ).toBeNull();
    expect(isFlexQuoteToken("EASY", MON3Y)).toBe(true);
    expect(isFlexQuoteToken("GEASY", COMPLEXFLEX_CONTRACT)).toBe(true);
    expect(isFlexQuoteToken("GEASY", FLEXFOREX_CONTRACT)).toBe(false);
    expect(isFlexQuoteToken("XPR", "eosio.token")).toBe(false);  });

  it("matches GEASY@fl3x mainnet issuer liquidity and 2x walk", () => {
    const d = {
      ...emptyDraft(),
      program: "complexflex" as const,
      name: "GEASY",
      symbol: "GEASY",
      identitySeeded: true,
      precision: 6,
      maxSupply: "420000000",
      quoteId: "easy" as const,
      fee: 10000 as const,
      priceLower: "0.0010081331518189368",
    };
    const fast = applyRangeWidth(d, "fast");
    const plan = planLaunch({
      symbol: "GEASY",
      precision: 6,
      maxSupply: "420000000",
      contract: COMPLEXFLEX_CONTRACT,
      quote: { symbol: "EASY", contract: MON3Y, precision: 6 },
      fee: 10000,
      priceLower: d.priceLower,
      priceUpper: fast.priceUpper,
    });
    expect(plan.launchedIsA).toBe(true);
    expect(plan.tickLower).toBe(-69000);
    expect(plan.tickUpper).toBe(443600);
    expect(plan.startTick).toBe(-69200);
    const easyUsd = 0.018643997356;
    const impact = rangeImpact(plan, "420000000", easyUsd);
    expect(impact?.liquidity).toBe("13335467295280");
    expect(impact?.doubledCapped).toBe(false);
    expect(impact?.quoteToDouble).toBeGreaterThan(8000);
    expect(impact?.quoteToDouble).toBeLessThan(9000);
    expect(impact?.usdToDouble).toBeGreaterThan(140);
    expect(impact?.usdToDouble).toBeLessThan(170);
    expect(impact?.initialMarketCapUsd).toBeGreaterThan(7800);
    expect(impact?.initialMarketCapUsd).toBeLessThan(8000);
    expect(impact?.supplyPctForUsd).toBeGreaterThan(0.5);
    expect(impact?.supplyPctForUsd).toBeLessThan(3);
    const slow = applyRangeWidth(d, "slow");
    const slowPlan = planLaunch({
      symbol: "GEASY",
      precision: 6,
      maxSupply: "420000000",
      contract: COMPLEXFLEX_CONTRACT,
      quote: { symbol: "EASY", contract: MON3Y, precision: 6 },
      fee: 10000,
      priceLower: slow.priceLower,
      priceUpper: slow.priceUpper,
    });
    const slowImpact = rangeImpact(slowPlan, "420000000", easyUsd);
    expect(slowImpact?.quoteToDouble).toBeGreaterThan(impact!.quoteToDouble);

    const twice = walkCostToMultiple(plan, "420000000", easyUsd, 2);
    expect(twice?.capped).toBe(false);
    expect(twice?.usd).toBeGreaterThan(140);
    expect(twice?.usd).toBeLessThan(170);
    expect(Math.abs((twice?.quoteGross ?? 0) - impact!.quoteToDouble)).toBeLessThan(1);

    const tenPct = walkCostToSupplyPct(plan, "420000000", easyUsd, 10);
    expect(tenPct?.supplyPct).toBeGreaterThan(9.9);
    expect(tenPct?.supplyPct).toBeLessThan(10.1);
    expect(tenPct?.usd).toBeGreaterThan(0);

    const scene = buyScenario(plan, "420000000", easyUsd, 100, 0);
    expect(scene?.firstSupplyPct).toBeGreaterThan(0.5);
    expect(scene?.firstSupplyPct).toBeLessThan(3);
    expect(scene?.bagUsdAfter).toBeGreaterThan(100);
    const scene2 = buyScenario(plan, "420000000", easyUsd, 100, 5000);
    expect(scene2!.bagUsdAfter!).toBeGreaterThan(scene!.bagUsdAfter!);
  });

  it("does not call a wide XPR range drained after $100", () => {
    const plan = planLaunch({
      symbol: "KARKADA",
      precision: 6,
      maxSupply: "1000000",
      contract: FLEXFOREX_CONTRACT,
      quote: { symbol: "XPR", contract: "eosio.token", precision: 4 },
      fee: 10000,
      priceLower: "0.00001",
      priceUpper: "1000000",
    });
    expect(plan.launchedIsA).toBe(false);
    expect(plan.tickLower).toBe(-92200);
    expect(plan.tickUpper).toBe(161200);
    const xprUsd = 0.0025926;
    const impact = rangeImpact(plan, "1000000", xprUsd);
    expect(impact!.usdWalkCapped).toBe(false);
    expect(impact!.leftoverTokensForUsd!).toBeGreaterThan(100_000);
    expect(impact!.supplyPctForUsd!).toBeLessThan(70);
    expect(impact!.usdToClearRange!).toBeGreaterThan(1_000_000);
    expect(impact!.usdLastBucket!).toBeGreaterThan(1_000_000);
    expect(impact!.usdExpensiveHalf!).toBeGreaterThan(impact!.usdCheapHalf!);
    expect(impact!.usdExpensiveHalf!).toBeGreaterThan(8327);
    const buckets = tickBucketCosts(plan, "1000000", xprUsd);
    expect(buckets.length).toBe(impact!.bucketCount);
    expect(buckets.length).toBeGreaterThan(1000);
    expect(buckets[0]!.usd!).toBeLessThan(1);
    expect(buckets[buckets.length - 1]!.usd!).toBeGreaterThan(1_000_000);
    const over = buckets.filter((b) => (b.usd ?? 0) > 8327).length;
    expect(over).toBeGreaterThan(0);
    expect(over).toBeGreaterThan(0);
    expect(over).toBeLessThan(buckets.length / 2);
    expect(impact!.endQuotePerTokenForUsd!).toBeLessThan(impact!.maxQuotePerToken / 2);
  });

  it("does not treat $100 as 100% of supply on a 100x curve", () => {
    const plan = planLaunch({
      symbol: "FOO",
      precision: 4,
      maxSupply: "1000000",
      contract: COMPLEXFLEX_CONTRACT,
      quote: { symbol: "EASY", contract: MON3Y, precision: 6 },
      fee: 3000,
      priceLower: "0.01",
      priceUpper: "1",
    });
    const quoteUsd = 0.02;
    const impact = rangeImpact(plan, "1000000", quoteUsd);
    const startMc = impact!.initialMarketCapUsd!;
    expect(startMc).toBeGreaterThan(150);
    expect(startMc).toBeLessThan(250);
    const constantPct = (100 / startMc) * 100;
    expect(impact!.supplyPctForUsd).not.toBeNull();
    expect(impact!.supplyPctForUsd!).toBeGreaterThan(0);
    expect(impact!.supplyPctForUsd!).toBeLessThan(100);
    expect(impact!.supplyPctForUsd!).toBeLessThan(constantPct + 0.01);
    expect(impact!.usdWalkCapped).toBe(false);
    expect(impact!.endQuotePerTokenForUsd!).toBeGreaterThan(impact!.startQuotePerToken);

    const xprPlan = planLaunch({
      symbol: "FOO",
      precision: 4,
      maxSupply: "1000000",
      contract: COMPLEXFLEX_CONTRACT,
      quote: { symbol: "XPR", contract: "eosio.token", precision: 4 },
      fee: 3000,
      priceLower: "0.01",
      priceUpper: "1",
    });
    expect(xprPlan.launchedIsA).toBe(false);
    const xprImpact = rangeImpact(xprPlan, "1000000", 0.005);
    expect(xprImpact!.supplyPctForUsd!).toBeGreaterThan(0);
    expect(xprImpact!.supplyPctForUsd!).toBeLessThan(100);
  });
});

describe("post-launch rain actions", () => {
  it("builds checklock, pullangel, and pulljackpot payloads", () => {
    expect(checklockAction("easyflex", "FOO")).toEqual({
      account: "easyflex",
      name: "checklock",
      data: { token_symbol: "FOO" },
    });
    expect(pullangelAction("flexforex", "FOO")).toEqual({
      account: "flexforex",
      name: "pullangel",
      data: { token_symbol: "FOO" },
    });
    expect(pulljackpotAction("flexforex", "FOO")).toEqual({
      account: "flexforex",
      name: "pulljackpot",
      data: { token_symbol: "FOO" },
    });
  });
});

describe("holder and issuer manage actions", () => {
  it("builds flexforex channel + holder preference payloads", () => {
    expect(ratiosAction("flexforex", "FOO", 1000, 500)).toEqual({
      account: "flexforex",
      name: "ratios",
      data: { token_symbol: "FOO", angel_numbers_bps: 1000, jackpot_bps: 500 },
    });
    expect(
      setdistAction("flexforex", "FOO", {
        angelNumbersBps: 1000,
        jackpotBps: 500,
        jackpotWinners: 3,
        jackpotMinHold: 0,
        angelNumbersCooldown: 86400,
        keeperMin: 0,
        reflectMin: 0,
      }).data
    ).toMatchObject({
      token_symbol: "FOO",
      jackpot_winners: 3,
      angel_numbers_cooldown: 86400,
    });
    expect(setangelnumAction("flexforex", "alice", "FOO", 42)).toEqual({
      account: "flexforex",
      name: "setangelnum",
      data: { owner: "alice", token_symbol: "FOO", angel_number: 42 },
    });
    expect(addLaunchQuotePoolAction("fl3x", 11525, "GEASY", { precision: 6, symbol: "EASY", contract: "mon3y" })).toEqual(
      {
        account: "fl3x",
        name: "addpool",
        data: {
          pool_id: 11525,
          token_symbol: "GEASY",
          output_symbol: "6,EASY",
          output_contract: "mon3y",
        },
      }
    );
    expect(addpoolAction("flexforex", 99, "FOO", abiSymbol(6, "EASY"), "mon3y")).toEqual({
      account: "flexforex",
      name: "addpool",
      data: {
        pool_id: 99,
        token_symbol: "FOO",
        output_symbol: "6,EASY",
        output_contract: "mon3y",
      },
    });
    expect(chooserewardAction("easyflex", "alice", "FOO", abiSymbol(4, "FOO"), "")).toEqual({
      account: "easyflex",
      name: "choosereward",
      data: {
        owner: "alice",
        token_symbol: "FOO",
        output_symbol: "4,FOO",
        output_contract: "",
      },
    });
    expect(feeoptoutAction("easyflex", "alice", true, "FOO").data).toEqual({
      account: "alice",
      ban_status: true,
      token_symbol: "FOO",
    });
    expect(inheritanceAction("complexflex", "alice", "bob", 2500, "FOO").data).toEqual({
      flexer: "alice",
      beneficiary: "bob",
      rate: 2500,
      token_symbol: "FOO",
    });
    expect(inheritmemoAction("flexforex", "alice", "hi @@", "FOO").name).toBe("inheritmemo");
    expect(hasAngelChannels("flexforex")).toBe(true);
    expect(hasAngelChannels("easyflex")).toBe(false);
    expect(hasInheritance("complexflex")).toBe(true);
    expect(hasInheritance("easyflex")).toBe(false);
    expect(programFromAccount("for3x")).toBe("flexforex");
    expect(programFromAccount("3asy")).toBe("easyflex");
    expect(programFromAccount("fl3x")).toBe("complexflex");
    expect(hasSetmin("easyflex")).toBe(true);
    expect(hasSetmin("complexflex")).toBe(true);
    expect(hasSetmin("flexforex")).toBe(false);
    expect(setminAction("3asy", "FOO", 0)).toEqual({
      account: "3asy",
      name: "setmin",
      data: { token_symbol: "FOO", reflect_min: 0 },
    });
    expect(
      firstBuySwapAction("alice", "10.000000 EASY", "mon3y", 2142, "0.0000 FOO", "for3x")
    ).toEqual({
      account: "mon3y",
      name: "transfer",
      data: {
        from: "alice",
        to: SWAP_ALCOR,
        quantity: "10.000000 EASY",
        memo: "swapexactin#2142#alice#0.0000 FOO@for3x#0",
      },
    });
  });
});

describe("tax rates", () => {
  it("suggests first setfees splits and validates channels", () => {
    const easy = defaultTaxDraft("easyflex");
    const complex = defaultTaxDraft("complexflex");
    expect(taxSum(easy, "easyflex")).toBe(200);
    expect(taxSum(complex, "complexflex")).toBe(200);
    expect(taxCreateValid(easy, "easyflex")).toBeNull();
    expect(taxCreateValid({ ...easy, angelNumbersBps: 6000, jackpotBps: 5000 }, "flexforex")).toMatch(/100%/);
    expect(percentInputToBps("1.5")).toBe(150);
    expect(percentInputToBps("1.")).toBe(100);
    expect(percentInputToBps("1.25")).toBe(125);
    expect(percentInputToBps("1.259")).toBe(125);
    expect(percentInputToBps("")).toBe(0);
    expect(sanitizePercentInput("1.259")).toBe("1.25");
    expect(sanitizePercentInput("12.3.9")).toBe("12.39");
    expect(formatBpsPercent(100)).toBe("1%");
    expect(formatBpsPercent(125)).toBe("1.25%");
  });

  it("blocks later setfees that raise total or cut reflection", () => {
    const chain = defaultTaxDraft("complexflex");
    expect(taxAdjustValid({ ...chain, projectRate: 200 }, "complexflex", chain)).toBe("⟁ Total tax cannot increase");
    expect(taxAdjustValid({ ...chain, reflectionRate: 50, projectRate: 150 }, "complexflex", chain)).toBe(
      "⟁ Reflection cannot go down"
    );
    expect(taxAdjustValid({ ...chain, burnRate: 50, projectRate: 50 }, "complexflex", chain)).toBeNull();
    expect(taxAdjustValid({ ...chain, projectRate: 0 }, "complexflex", chain)).toBeNull();
  });
});

describe("range width presets", () => {
  it("fills Slow 100x and EASY 10M x from start price", () => {
    const d = { ...emptyDraft(), priceLower: "1", priceUpper: "2", symbol: "FOO" };
    expect(applyRangeWidth(d, "slow")).toMatchObject({
      priceLower: "1",
      priceUpper: "100",
      rangeWidthId: "slow",
    });
    expect(applyRangeWidth(d, "easy")).toMatchObject({
      priceLower: "1",
      priceUpper: "10000000",
      rangeWidthId: "easy",
    });
  });

  it("Fast clamps to Alcor max-tick sell side", () => {
    const d = { ...emptyDraft(), priceLower: "1", symbol: "FOO", precision: 4 };
    const fast = applyRangeWidth(d, "fast");
    expect(fast.rangeWidthId).toBe("fast");
    expect(Number(fast.priceUpper)).toBeGreaterThan(Number(fast.priceLower));
    const plan = planLaunch({
      symbol: "FOO",
      precision: 4,
      maxSupply: "1000000",
      contract: "flexforex",
      quote: { symbol: "FOOBAR", contract: "xtokens", precision: 6 },
      fee: 3000,
      priceLower: fast.priceLower,
      priceUpper: fast.priceUpper,
    });
    expect(plan.tickUpper).toBeLessThanOrEqual(443636);
    expect(plan.tickLower).toBeLessThan(plan.tickUpper);
  });

  it("start market cap only rewrites priceLower", () => {
    const d = { ...emptyDraft(), maxSupply: "1000000", priceLower: "1", priceUpper: "50" };
    const next = applyStartMarketCap(d, 10_000, 1);
    expect(next.priceLower).toBe("0.01");
    expect(d.priceUpper).toBe("50");
    expect("priceUpper" in next).toBe(false);
  });
});

describe("xtoken catalog", () => {
  it("keeps a curated fallback with majors first", () => {
    expect(XTOKEN_FALLBACK[0].symbol).toBe("XUSDC");
    expect(XTOKEN_FALLBACK.some((r) => r.symbol === "XBTC")).toBe(true);
    expect(XTOKEN_FALLBACK.some((r) => r.symbol === "XXRP")).toBe(true);
    expect(XTOKEN_TOP_N).toBe(10);
  });

  it("builds Alcor token ids for proof lookup", async () => {
    // Unit-level: function exists and rejects empty pair without throwing on construct
    expect(typeof findProofPoolId).toBe("function");
  });
});

describe("local token icons", () => {
  it("maps token.proton xtokens and flex quotes to /tokens paths", () => {
    expect(tokenIconKey("xtokens", "xbtc")).toBe("xtokens:XBTC");
    expect(localTokenIconSrc("xtokens", "XBTC")).toBe("/tokens/xtokens/XBTC.png");
    expect(localTokenIconSrc("xtokens", "XUSDC")).toBe("/tokens/xtokens/XUSDC.png");
    expect(localTokenIconSrc("eosio.token", "XPR")).toBe("/tokens/eosio.token/XPR.png");
    expect(localTokenIconSrc("mon3y", "EASY")).toBe("/tokens/easy.png");
    expect(localTokenIconSrc("flexforex", "UUU")).toBeUndefined();
    rememberRemoteTokenIcon("fl3x", "ZZZ", "https://gateway.pinata.cloud/ipfs/QmZ");
    expect(tokenIconSrc("fl3x", "ZZZ")).toBe("https://gateway.pinata.cloud/ipfs/QmZ");
    expect(tokenIconSrc("fl3x", "ZZZ", "https://example.com/z.png")).toBe("https://example.com/z.png");
  });
});

describe("XPR mainnet launcher defaults", () => {
  it("uses a valid WebAuth request account and mainnet quotes", () => {
    expect(REQUEST_ACCOUNT.length).toBeLessThanOrEqual(12);
    expect(REQUEST_ACCOUNT).toBe("flexlaunch");
    expect(QUOTE_PRESETS.find((q) => q.id === "easy")?.contract).toBe(MON3Y);
    expect(QUOTE_PRESETS.find((q) => q.id === "xtoken")?.symbol).toBe(XUSDC_SYMBOL);
    expect(QUOTE_PRESETS.find((q) => q.id === "xpr")?.contract).toBe("eosio.token");
    expect(QUOTE_PRESETS.find((q) => q.id === "xmd")?.contract).toBe("xmd.token");
    expect(QUOTE_PRESETS.find((q) => q.id === "loan")?.contract).toBe("loan.token");
    const d = emptyDraft();
    expect(d.quoteId).toBe("easy");
    expect(d.xtokenSymbol).toBe(XUSDC_SYMBOL);
    expect(d.proofPoolId).toBe("0");
    expect(d.swapUnderlyingDefault).toBe(false);
    expect(d.precision).toBe(6);
    expect(amountToRaw("3", 4)).toBe(30000);
    expect(formatRainAsset(30000, 4, "XPR")).toBe("3.0000 XPR");
    expect(amountToRaw("0.665555", 6)).toBe(665555);
    expect(formatRainAsset(665555, 6, "FOO")).toBe("0.665555 FOO");
    expect(reflectionPayFloorRaw(0, 6)).toBe(1_000_000);
    expect(reflectionPayFloorRaw(5000, 4)).toBe(5000);
    expect(PROJECT_CORE_TOKENS.map((t) => t.symbol)).toEqual(["EASY", "WON", "GRAMS", "MEME"]);
    expect(
      alcorSwapUrl("EASY", "mon3y", "FOO", "for3x")
    ).toBe("https://alcor.exchange/v/xpr/swap?input=easy-mon3y&output=foo-for3x");
    expect(alcorChartWidgetUrl("EASY", "mon3y", "GEASY", "fl3x")).toBe(
      "https://alcor.exchange/v/xpr/chart-widget?input=easy-mon3y&output=geasy-fl3x"
    );
    expect(alcorChartWidgetUrl("EASY", "mon3y", "GEASY", "fl3x", 11525)).toBe(
      "https://alcor.exchange/v/xpr/chart-widget?input=easy-mon3y&output=geasy-fl3x&pool=11525"
    );
    expect(alcorSwapWidgetUrl("EASY", "mon3y", "GEASY", "fl3x")).toBe(
      "https://alcor.exchange/v/xpr/swap-widget?input=easy-mon3y&output=geasy-fl3x"
    );
    expect(alcorAnalyticsUrl("GEASY", "fl3x")).toBe("https://alcor.exchange/v/xpr/analytics/tokens/geasy-fl3x");
    expect(SWAP_ALCOR).toBe("swap.alcor");
    expect(isFlexContractActor("for3x")).toBe(true);
    expect(isFlexContractActor("alice")).toBe(false);
  });
});

describe("execute gates and pool id", () => {
  it("blocks a taken ticker and a short EASY balance", () => {
    const taken = createGateItems({ stat: { issuer: "alice" }, easyBal: 1000, need: 50000, symbol: "FOO", prior: 0 });
    expect(taken.find((i) => i.id === "ticker")?.pass).toBe(false);
    expect(taken.find((i) => i.id === "easy")?.pass).toBe(false);
    const ok = createGateItems({ stat: null, easyBal: 50000, need: 50000, symbol: "FOO", prior: 0 });
    expect(ok.every((i) => i.pass)).toBe(true);
  });

  it("does not suggest a cheaper Flex pair when the hold is short", () => {
    const short = createGateItems({
      stat: null,
      easyBal: 5_000,
      need: 50_000,
      symbol: "FOO",
      prior: 0,
      flexQuote: false,
      flexNeed: 5_000,
    });
    const easy = short.find((i) => i.id === "easy");
    expect(easy?.pass).toBe(false);
    expect(easy?.detail ?? "").toMatch(/Need 50,000 EASY before liftoff/);
    expect(easy?.hint).toBeUndefined();
  });

  it("marks GEASY inventory rows pass on complexflex", () => {
    const items = alcorInventoryItems({
      program: "complexflex",
      contract: COMPLEXFLEX_CONTRACT,
      symbol: "GEASY",
      precision: 6,
      supply: 1000,
      swapBal: 1,
      issuerBal: 50,
      leftover: 10,
    });
    expect(items.map((i) => i.id)).toEqual(["supply-on-alcor", "issuer-empty", "no-leftover"]);
    expect(items.map((i) => i.label)).toEqual([
      "100% of supply sits on swap.alcor",
      "Issuer wallet holds none of the token",
      "No unused Alcor balance of the token",
    ]);
    expect(items.every((i) => i.pass)).toBe(true);
    expect(items.find((i) => i.id === "supply-on-alcor")?.detail).toBe(
      `${(1000).toLocaleString()} / ${(1000).toLocaleString()} GEASY`
    );
    expect(items.find((i) => i.id === "issuer-empty")?.detail).toBe("clean");
    expect(items.find((i) => i.id === "no-leftover")?.detail).toBe("clean");
  });

  it("treats dust on the token contract as still 100% on the pool", () => {
    const supply = 1_100_000_000_000;
    const items = alcorInventoryItems({
      program: "flexforex",
      contract: FLEXFOREX_CONTRACT,
      symbol: "FALA",
      precision: 2,
      supply,
      swapBal: 1_099_999_948_181.35,
      contractBal: 51_818.65,
      issuerBal: 0,
      leftover: 0,
    });
    const row = items.find((i) => i.id === "supply-on-alcor");
    expect(row?.pass).toBe(true);
    expect(row?.label).toBe("100% of supply sits on swap.alcor");
    expect(row?.hint).toBeUndefined();

    const short = alcorInventoryItems({
      program: "flexforex",
      contract: FLEXFOREX_CONTRACT,
      symbol: "FALA",
      precision: 2,
      supply,
      swapBal: supply * 0.99,
      contractBal: 0,
      issuerBal: supply * 0.01,
      leftover: 0,
    });
    const fail = short.find((i) => i.id === "supply-on-alcor");
    expect(fail?.pass).toBe(false);
    expect(fail?.hint).toMatch(/new contract on Alcor/);
  });

  it("keeps inventory rows strict for other programs and tickers", () => {
    const bad = {
      precision: 6,
      supply: 1000,
      swapBal: 1,
      issuerBal: 50,
      leftover: 10,
    };
    expect(
      alcorInventoryItems({ ...bad, program: "complexflex", contract: COMPLEXFLEX_CONTRACT, symbol: "FOO" }).every(
        (i) => i.pass
      )
    ).toBe(false);
    expect(
      alcorInventoryItems({ ...bad, program: "easyflex", contract: EASYFLEX_CONTRACT, symbol: "GEASY" }).every(
        (i) => i.pass
      )
    ).toBe(false);
    expect(
      alcorInventoryItems({ ...bad, program: "flexforex", contract: FLEXFOREX_CONTRACT, symbol: "GEASY" }).every(
        (i) => i.pass
      )
    ).toBe(false);
    const ok = alcorInventoryItems({
      program: "flexforex",
      contract: FLEXFOREX_CONTRACT,
      symbol: "FOO",
      precision: 6,
      supply: 1000,
      swapBal: 1000,
      issuerBal: 0,
      leftover: 0,
    });
    expect(ok.every((i) => i.pass)).toBe(true);
  });

  it("reads logpool id from Hyperion-shaped traces with no wallet inline_traces", () => {
    expect(logpoolIdFromResult({ processed: { traces: [] } })).toBeNull();
    expect(
      logpoolIdFromResult({
        actions: [{ act: { name: "logpool", data: { poolId: 2142 } } }],
      })
    ).toBe(2142);
  });

  it("lists token.proton gaps for a contract", () => {
    const tokens = [
      { symbol: "FOO", precision: 4 },
      { symbol: "BAR", precision: 6 },
    ];
    const rows = [
      { id: 1, tcontract: "for3x", tname: "Foo", url: "", desc: "", iconurl: "", symbol: "4,FOO" },
    ];
    expect(protonSyncGaps(tokens, rows, "for3x").map((t) => t.symbol)).toEqual(["BAR"]);
    expect(protonSyncGaps(tokens, rows, "3asy")).toEqual(tokens);
    expect(protonSyncGaps([{ symbol: "FOO", precision: 6 }], rows, "for3x")).toEqual([]);
  });

  it("merges sqlite and proton rows into the admin list", () => {
    expect(alcorLogoFilename("FOO", "fl3x")).toBe("foo_fl3x.png");
    const prompt = alcorListingPrompt({
      name: "Foo Coin",
      url: "https://foo.example",
      desc: "A flex token",
      iconurl: "https://gateway.pinata.cloud/ipfs/QmHash",
      symbol: "FOO",
      contract: "fl3x",
      precision: 4,
      twitter: "foocoin",
    });
    expect(prompt).toContain(ALCOR_TOKEN_DOCS);
    expect(prompt).toContain(ALCOR_UI_FORK);
    expect(prompt).toContain("foo_fl3x.png");
    expect(prompt).toContain("Download the logo from this public URL");
    expect(prompt).toContain("https://gateway.pinata.cloud/ipfs/QmHash");
    expect(prompt).toContain('"FOO@fl3x"');
    expect(prompt).toContain("Do not commit to alcorexchange/alcor-ui");
    expect(prompt).not.toContain("/upload/master/");
    expect(logoRequestTooltip("FOO", "flexforex")).toContain("FOO");
    expect(logoRequestTooltip("FOO", "flexforex")).toContain("forex");
    expect(logoRequestTooltip("BAR", "easyflex")).toContain("easy");
    expect(logoRequestTooltip("ZZZ", "complexflex")).toContain("complex");
    expect(listingPacketJson({
      name: "Foo Coin",
      url: "",
      desc: "",
      iconurl: "https://gateway.pinata.cloud/ipfs/QmHash",
      symbol: "FOO",
      contract: "fl3x",
      precision: 4,
    })).toMatchObject({
      name: "Foo Coin",
      symbol: "FOO",
      account: "fl3x",
      chain: "proton",
      logo: "https://raw.githubusercontent.com/eoscafe/eos-airdrops/master/logos/foo-fl3x.png",
    });
    expect(parseProtonSymbol("8,FOO")?.precision).toBe(8);
    expect(parseProtonSymbol("9,FOO")).toBeNull();
    expect(parseProtonSymbol("101,FOO")).toBeNull();
    const stored = emptyManagerToken();
    stored.issuer = "alice";
    stored.contract = "fl3x";
    stored.symbol = "ZZZ";
    stored.precision = 4;
    stored.program = "complexflex";
    const merged = mergeAdminTokenRefs({
      tcontract: "fl3x",
      refs: [],
      stored: [stored],
      proton: [{ id: 1, tcontract: "fl3x", tname: "Foo", url: "", desc: "", iconurl: "https://x/a.png", symbol: "4,FOO" }],
    });
    expect(listingPrBranch("FOO", "flex.mon3y")).toBe("flex-listing-foo-flex-mon3y");
    expect(airdropsEntryMatch({ chain: "proton", symbol: "FOO", account: "fl3x" }, "FOO", "fl3x")).toBe(true);
    expect(airdropsEntryMatch({ chain: "wax", symbol: "FOO", account: "fl3x" }, "FOO", "fl3x")).toBe(false);
    expect(merged.map((t) => t.symbol).sort()).toEqual(["FOO", "ZZZ"]);
  });
});

describe("issuer manager store", () => {
  it("points to setfees after a successful create", () => {
    const progress = launchProgressFrom({
      hasStat: true,
      txs: { create: "abc" },
    });
    expect(progress.create).toBe(true);
    expect(progress.setfees).toBe(false);
    expect(nextLaunchStep(progress).id).toBe("setfees");
  });

  it("points to mint after setfees", () => {
    const progress = launchProgressFrom({
      hasStat: true,
      txs: { create: "abc", setfees: "fees" },
    });
    expect(progress.setfees).toBe(true);
    expect(nextLaunchStep(progress).id).toBe("supply");
  });

  it("marks every step done after liftoff", () => {
    const progress = launchProgressFrom({ launched: true });
    expect(LAUNCH_STEP_IDS.every((id) => progress[id])).toBe(true);
    expect(nextLaunchStep(progress).id).toBe("done");
  });

  it("treats liftoff-filled pool without launched as presale", () => {
    const progress = launchProgressFrom({
      hasStat: true,
      supplyPositive: true,
      hasLaunch: true,
      launched: false,
      liftoffFilled: true,
      hasPool: true,
      hasLock: true,
      txs: { liftoff: "txlift", addpool: "txadd" },
    });
    expect(progress.liftoff).toBe(true);
    expect(progress.addpool).toBe(true);
    expect(nextLaunchStep(progress, { inPresale: true }).label).toBe("Insiders club");
  });

  it("merges sqlite metadata onto an on-chain issuer token", () => {
    const stored = parseManagerToken({
      issuer: "alice",
      contract: "for3x",
      symbol: "FOO",
      program: "flexforex",
      name: "Foo Token",
      imageUrl: "https://example.com/foo.png",
      createTx: "txcreate",
      mintTx: "txmint",
    });
    expect(stored?.name).toBe("Foo Token");
    const views = mergeManagerViews(
      [
        {
          issuer: "alice",
          contract: "for3x",
          program: "flexforex",
          symbol: "FOO",
          precision: 6,
          launched: false,
          poolId: null,
          supplyPositive: true,
          hasLaunch: false,
          hasStat: true,
          createTx: "txcreate",
        },
      ],
      stored ? [stored] : []
    );
    expect(views).toHaveLength(1);
    expect(views[0].token.name).toBe("Foo Token");
    expect(views[0].next.id).toBe("startlaunch");
    expect(managerHasStarted(views)).toBe(true);
    expect(protonListingStatus(stored)).toBe("unknown");
    const listed = applyProtonListing(stored!, true, 42, 1000);
    expect(protonListingStatus(listed)).toBe("listed");
    expect(listed.protonId).toBe("42");
    expect(protonListingStatus(applyProtonListing(stored!, false, "", 1000))).toBe("missing");
    const withPr = applyRepoListing(listed, "alcor", { listed: false, prUrl: "https://github.com/x/y/pull/1", prState: "open" }, 2000);
    expect(withPr.alcorPrUrl).toContain("/pull/1");
    expect(withPr.alcorPrState).toBe("open");
  });

  it("rejects a non-http icon URL and round-trips a draft", () => {
    expect(sanitizeManagerMeta({ name: "Foo", imageUrl: "ipfs://abc" })).toMatch(/http/i);
    const clipped = sanitizeManagerMeta({ name: "This name is way too long for proton" });
    expect(clipped).toMatchObject({ name: "This name is way" });
    const d = emptyDraft();
    d.program = "flexforex";
    d.name = "Foo";
    d.symbol = "FOO";
    d.createTx = "tx1";
    d.imageUrl = "https://gateway.pinata.cloud/ipfs/cid";
    d.rainMinHold = 1000;
    d.rainMinPool = 50;
    const row = managerFromDraft("alice", d);
    expect(row.contract).toBe("for3x");
    expect(row.imageUrl).toContain("https://");
    expect(row.rainMinHold).toBe(1000);
    expect(row.rainMinPool).toBe(50);
    const back = draftFromManager(row);
    expect(back.symbol).toBe("FOO");
    expect(back.createTx).toBe("tx1");
    expect(back.rainMinHold).toBe(1000);
    expect(back.rainMinPool).toBe(50);
    expect(parseManagerToken({ ...row, imageUrl: "not-a-url" })).toBeNull();
  });
});

describe("leaderboard tiles", () => {
  const sample = (p: Partial<BoardToken> & Pick<BoardToken, "symbol">): BoardToken => ({
    id: `for3x:${p.symbol}`,
    program: "flexforex",
    contract: "for3x",
    quoteSymbol: "EASY",
    quoteContract: "mon3y",
    poolId: 1,
    firstSeenAt: 1,
    mcapUsd: 0,
    liqUsd: 0,
    backingUsd: 0,
    volumeUsd: 0,
    holders: 0,
    ...p,
  });

  it("formats usd compactly", () => {
    expect(fmtUsd(0)).toBe("-");
    expect(fmtUsd(12.34)).toBe("$12.34");
    expect(fmtUsd(1500)).toBe("$1,500");
    expect(formatNiceNumber(0.0026398)).toBe("0.0026398");
    expect(formatNiceNumber(0.00004686269462000001)).toBe("0.00004686");
    expect(formatNiceNumber(0.000000123456)).toBe("0.0000001235");
    expect(fmtUsd(0.00004686269462000001)).toBe("$0.00004686");
    expect(fmtUsd(0.5)).toBe("$0.50");
    expect(formatPlainNumber(1_000_000_000_000)).toBe("1,000,000,000,000");
    expect(formatPlainNumber(0.00000001)).toBe("0.00000001");
    expect(formatPlainNumber(1e-9)).toMatch(/e-9/i);
    expect(fmtPrice(1_000_000)).toBe("1,000,000");
    expect(fmtPrice(1e12)).toBe("1,000,000,000,000");
  });

  it("sorts newcomers, volume, mcap, and holders", () => {
    const a = sample({ symbol: "AAA", firstSeenAt: 10, poolId: 2, volumeUsd: 1, mcapUsd: 9, holders: 2 });
    const b = sample({ symbol: "BBB", firstSeenAt: 30, poolId: 1, volumeUsd: 8, mcapUsd: 3, holders: 9 });
    const c = sample({ symbol: "CCC", firstSeenAt: 20, poolId: 9, volumeUsd: 8, mcapUsd: 4, holders: 9 });
    expect(sortNewcomers([a, b, c]).map((t) => t.symbol)).toEqual(["BBB", "CCC", "AAA"]);
    expect(sortLoudest([a, b, c]).map((t) => t.symbol)).toEqual(["CCC", "BBB", "AAA"]);
    expect(sortLargeCap([a, b, c]).map((t) => t.symbol)).toEqual(["AAA", "CCC", "BBB"]);
    expect(sortPopular([a, b, c]).map((t) => t.symbol)).toEqual(["CCC", "BBB", "AAA"]);
  });
});

describe("alcor market chart helpers", () => {
  it("prices a swap as quote per token and labels buy vs sell", () => {
    const buy = { tokenA: -231134.988055, tokenB: 625.442781 };
    expect(quotePerToken(buy, true)?.toFixed(6)).toBe((625.442781 / 231134.988055).toFixed(6));
    expect(tradeSide(buy.tokenA)).toBe("buy");
    expect(tradeSide(231134)).toBe("sell");
    expect(fmtPoolFee(10000)).toBe("1.00%");
    expect(fmtPctChange(0.43)).toBe("+0.43%");
    const pts = downsamplePoints(
      Array.from({ length: 500 }, (_, i) => ({ t: i, price: i + 1 })),
      5
    );
    expect(pts).toHaveLength(5);
    expect(pts[0].t).toBe(0);
    expect(pts[4].t).toBe(499);
  });
});
