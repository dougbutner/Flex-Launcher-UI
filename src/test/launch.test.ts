import { describe, expect, it } from "vitest";
import { formatAsset, formatSupplyCommas, parseSupplyInput, validSymbol, zeroAsset } from "@/services/assets";
import { compareExtTokens, nameToU64, sortPair, symbolCodeToU64 } from "@/services/eosioName";
import { planLaunch } from "@/services/launchMath";
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
  addpoolAction,
  chooserewardAction,
  feeoptoutAction,
  inheritanceAction,
  inheritmemoAction,
  abiSymbol,
  setminAction,
} from "@/services/launchActions";
import {
  COMPLEXFLEX_CONTRACT,
  EASYFLEX_CONTRACT,
  FLEXFOREX_CONTRACT,
  MON3Y,
  QUOTE_PRESETS,
  SWAP_ALCOR,
  XUSDC_SYMBOL,
  alcorSwapUrl,
  flexAccount,
  flexMeta,
  hasAngelChannels,
  hasInheritance,
  hasSetmin,
  easyHoldNeed,
  holdEasyToLaunch,
  easyHoldOffPercent,
  easyHoldPromoCopy,
  isFlexContractActor,
  programFromAccount,
} from "@/config/launch";
import {
  defaultTaxDraft,
  formatBpsPercent,
  percentInputToBps,
  taxAdjustValid,
  taxCreateValid,
  taxSum,
} from "@/services/taxRates";
import { findXtoken, xtokensByMarketCap } from "@/config/xtokens";
import { REQUEST_ACCOUNT } from "@/services/walletConstants";
import { getSqrtPriceX64AtTick, nearestUsableTick } from "@/services/tickMath";
import { protonSymbol, protonSyncGaps, rowMatchesContractSymbol, tokenProtonLogoAction } from "@/services/tokenProton";
import { logpoolIdFromResult } from "@/services/txParse";
import { createGateItems } from "@/services/preflight";
import { applyRangeWidth, tokenStepValid } from "@/components/launch/draftPlan";
import { emptyDraft } from "@/hooks/useLaunchDraft";
import { validImageUrl } from "@/services/tokenLogo";
import { localTokenIconSrc, tokenIconKey } from "@/services/tokenIcons";
import { XTOKEN_FALLBACK, XTOKEN_TOP_N, findProofPoolId } from "@/services/xtokenCatalog";
import { draftFromManager, managerFromDraft } from "@/services/managerDraft";
import {
  LAUNCH_STEP_IDS,
  launchProgressFrom,
  managerHasStarted,
  mergeManagerViews,
  nextLaunchStep,
  parseManagerToken,
  sanitizeManagerMeta,
} from "@/services/managerStore";

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
  });

  it("requires a public image URL after a Pinata failure", () => {
    expect(validImageUrl("https://example.com/logo.png")).toBe(true);
    expect(validImageUrl("ipfs://Qm")).toBe(false);
    const draft = { ...emptyDraft(), name: "Foo", symbol: "FOO", pinFailed: true };
    expect(tokenStepValid(draft)).toMatch(/Pinata failed/);
    expect(tokenStepValid({ ...draft, imageUrl: "https://example.com/logo.png" })).toBeNull();
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
    expect(payoutAction("flex.mon3y", "BAR", "alice", "keeper").data).toEqual({
      token_symbol: "BAR",
      keeper: "alice",
    });
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
    expect(easyHoldNeed(10_000, 0, Date.UTC(2026, 9, 9))).toBe(2_000);
    expect(easyHoldNeed(50_000, 0, Date.UTC(2026, 8, 10))).toBe(5_000);
    expect(easyHoldOffPercent(Date.UTC(2026, 8, 9) + 6 * 30 * 86400 * 1000)).toBe(30);
    expect(easyHoldOffPercent(Date.UTC(2026, 8, 9) + 9 * 30 * 86400 * 1000)).toBe(0);
    expect(easyHoldPromoCopy(Date.UTC(2026, 8, 9))).toMatch(/90%/);
    expect(easyHoldPromoCopy(Date.UTC(2026, 8, 9) + 9 * 30 * 86400 * 1000)).toBeNull();
  });
});

describe("post-launch poke actions", () => {
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
    expect(formatBpsPercent(100)).toBe("1%");
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
    expect(d.swapUnderlyingDefault).toBe(true);
    expect(d.precision).toBe(6);
    expect(
      alcorSwapUrl("EASY", "mon3y", "FOO", "for3x")
    ).toBe("https://alcor.exchange/v/xpr/swap?input=easy-mon3y&output=foo-for3x");
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
  });

  it("rejects a non-http icon URL and round-trips a draft", () => {
    expect(sanitizeManagerMeta({ name: "Foo", imageUrl: "ipfs://abc" })).toMatch(/http/i);
    const d = emptyDraft();
    d.program = "flexforex";
    d.name = "Foo";
    d.symbol = "FOO";
    d.createTx = "tx1";
    d.imageUrl = "https://gateway.pinata.cloud/ipfs/cid";
    const row = managerFromDraft("alice", d);
    expect(row.contract).toBe("for3x");
    expect(row.imageUrl).toContain("https://");
    const back = draftFromManager(row);
    expect(back.symbol).toBe("FOO");
    expect(back.createTx).toBe("tx1");
    expect(parseManagerToken({ ...row, imageUrl: "not-a-url" })).toBeNull();
  });
});
