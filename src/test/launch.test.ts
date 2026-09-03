import { describe, expect, it } from "vitest";
import { formatAsset, validSymbol, zeroAsset } from "@/services/assets";
import { compareExtTokens, nameToU64, sortPair, symbolCodeToU64 } from "@/services/eosioName";
import { planLaunch } from "@/services/launchMath";
import { createTokenAction, payoutAction, startlaunchAction, supplyAction } from "@/services/launchActions";
import { flexAccount } from "@/config/launch";
import { getSqrtPriceX64AtTick, nearestUsableTick } from "@/services/tickMath";
import { protonSymbol, rowMatchesContractSymbol, tokenProtonLogoAction } from "@/services/tokenProton";
import { tokenStepValid } from "@/components/launch/draftPlan";
import { emptyDraft } from "@/hooks/useLaunchDraft";
import { validImageUrl } from "@/services/tokenLogo";

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
    expect(supplyAction("mon3y", "issue", "alice", plan.fullSupply).name).toBe("issue");
    expect(supplyAction("flex.mon3y", "mint", "alice", plan.fullSupply).name).toBe("mint");
    expect(startlaunchAction("mon3y", plan, 0).name).toBe("startlaunch");
    expect(startlaunchAction("mon3y", plan, 0).data.xtoken_proof_pool_id).toBe(0);
    expect(payoutAction("mon3y", "distribute", "BAR").name).toBe("distribute");
    expect(payoutAction("flex.mon3y", "reflect", "BAR", "alice").data).toEqual({
      token_symbol: "BAR",
      keeper: "alice",
    });
    expect(flexAccount("easyflex")).toBe("mon3y");
    expect(flexAccount("complexflex")).toBe("gold.mon3y");
    expect(flexAccount("flexforex")).toBe("flex.mon3y");
  });
});
