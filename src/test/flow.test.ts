import { describe, expect, it } from "vitest";
import {
  COMPLEXFLEX_CONTRACT,
  EASYFLEX_CONTRACT,
  FLEXFOREX_CONTRACT,
  SWAP_ALCOR,
  flexAccount,
  flexMeta,
  type FlexProgram,
} from "@/config/launch";
import { emptyDraft } from "@/hooks/useLaunchDraft";
import { applyRangeWidth, planFromDraft } from "@/components/launch/draftPlan";
import { unlockTimeUnix } from "@/services/launchMath";
import {
  FORBIDDEN_UI_ACTIONS,
  simulateLaunchFlow,
  simulateManageActions,
} from "@/services/launchFlow";
import { XPR_CHAIN_ID_HEX } from "@/services/walletConstants";

/** Live XPR mainnet ABI field names (3asy / fl3x / for3x / swap.alcor). */
const ABI_FIELDS: Record<string, string[]> = {
  create: ["issuer", "maximum_supply"],
  issue: ["to", "quantity", "memo"],
  mint: ["to", "quantity", "memo"],
  startlaunch: [
    "token_symbol",
    "quote",
    "fee",
    "tick_lower",
    "tick_upper",
    "sqrt_price_x64",
    "xtoken_proof_pool_id",
    "swap_underlying_default",
  ],
  createpool: ["account", "tokenA", "tokenB", "sqrtPriceX64", "fee"],
  transfer: ["from", "to", "quantity", "memo"],
  addliquid: [
    "poolId",
    "owner",
    "tokenADesired",
    "tokenBDesired",
    "tickLower",
    "tickUpper",
    "tokenAMin",
    "tokenBMin",
    "deadline",
  ],
  lockpos: ["poolId", "owner", "tickLower", "tickUpper", "unlockTime"],
  liftoff: ["token_symbol", "pool_id", "tick_lower", "tick_upper"],
  setfees: ["sym", "reflection_rate", "burn_rate"],
  makeitrain: ["token_symbol"],
  checklock: ["token_symbol"],
  addpool: ["pool_id", "token_symbol", "output_symbol", "output_contract"],
  choosereward: ["owner", "token_symbol", "output_symbol", "output_contract"],
  feeoptout: ["account", "ban_status", "token_symbol"],
  setmin: ["token_symbol", "reflect_min"],
  inheritance: ["flexer", "beneficiary", "rate", "token_symbol"],
  inheritmemo: ["flexer", "custom_memo", "token_symbol"],
  ratios: ["token_symbol", "angel_numbers_bps", "jackpot_bps"],
  setdist: [
    "token_symbol",
    "angel_numbers_bps",
    "jackpot_bps",
    "jackpot_winners",
    "jackpot_min_hold",
    "angel_numbers_cooldown",
    "keeper_min",
    "reflect_min",
  ],
  setangelnum: ["owner", "token_symbol", "angel_number"],
  pullangel: ["token_symbol"],
  pulljackpot: ["token_symbol"],
  setpresale: [
    "token_symbol",
    "launch_time",
    "insider_time",
    "mode",
    "insider_bps",
    "locked_insider_bps",
    "collection",
    "schema",
    "nft_min",
    "min_token",
    "lp_min",
    "locked_lp_min",
    "lock_secs",
    "need_kyc",
    "gates_all",
  ],
  setlaunchtime: ["token_symbol", "launch_time", "insider_time"],
  addinsiders: ["token_symbol", "accounts"],
  reginsider: ["owner", "token_symbol"],
  rminsider: ["account", "token_symbol"],
  provelock: ["owner", "token_symbol", "pool_id", "position_id"],
  golive: ["token_symbol"],
};

const PROGRAMS: FlexProgram[] = ["easyflex", "complexflex", "flexforex"];

function assertMatchesAbi(name: string, data: Record<string, unknown>, extra?: string[]) {
  const fields = ABI_FIELDS[name];
  expect(fields, `unknown ABI action ${name}`).toBeTruthy();
  const required = extra ? [...fields, ...extra] : fields;
  for (const key of required) {
    expect(data, `${name} missing ${key}`).toHaveProperty(key);
  }
  for (const key of Object.keys(data)) {
    expect(required, `${name} extra field ${key}`).toContain(key);
  }
}

function draftFor(program: FlexProgram) {
  const d = applyRangeWidth(
    {
      ...emptyDraft(),
      program,
      name: "Foo",
      symbol: "FOO",
      precision: 4,
      maxSupply: "1000000",
      quoteId: "easy",
      proofPoolId: "0",
    },
    "slow"
  );
  return { ...emptyDraft(), ...d, program, name: "Foo", symbol: "FOO", precision: 4, maxSupply: "1000000" };
}

describe("mainnet launch flow simulation", () => {
  it("points wallets at XPR mainnet", () => {
    expect(XPR_CHAIN_ID_HEX.toLowerCase()).toBe(
      "384da888112027f0321850a169f737c33e53b388aad48b5adace4bab97f437e0"
    );
  });

  it.each(PROGRAMS)("builds the wizard sequence for %s against the live ABI", (program) => {
    const draft = draftFor(program);
    const plan = planFromDraft(draft);
    expect(plan).not.toBeNull();
    const steps = simulateLaunchFlow({
      program,
      actor: "alice",
      plan: plan!,
      proofPoolId: 0,
      swapUnderlyingDefault: true,
      poolId: 2142,
      unlockTime: unlockTimeUnix(90),
    });
    const code = flexAccount(program);
    const supply = flexMeta(program).supply;
    expect(steps.map((s) => s.id)).toEqual([
      "create",
      "setfees",
      "supply",
      "startlaunch",
      "createpool",
      "deposit",
      "addliquid",
      "lockpos",
      "liftoff",
      "addpool",
    ]);
    expect(steps.find((s) => s.id === "create")?.account).toBe(code);
    expect(steps.find((s) => s.id === "liftoff")?.name).toBe("liftoff");
    expect(steps.every((s) => s.account !== "token.proton")).toBe(true);
    expect(steps.find((s) => s.id === "supply")?.name).toBe(supply);
    expect(steps.find((s) => s.id === "createpool")?.account).toBe(SWAP_ALCOR);
    expect(steps.find((s) => s.id === "addliquid")?.account).toBe(SWAP_ALCOR);
    expect(steps.find((s) => s.id === "lockpos")?.account).toBe(SWAP_ALCOR);
    const deposit = steps.find((s) => s.id === "deposit")!.actions[0];
    expect(deposit.data.to).toBe(SWAP_ALCOR);
    expect(deposit.data.memo).toBe("deposit");
    const start = steps.find((s) => s.id === "startlaunch")!.actions[0];
    expect(start.data.xtoken_proof_pool_id).toBe(0);
    expect(start.data.swap_underlying_default).toBe(true);
    const addp = steps.find((s) => s.id === "addpool")!.actions[0];
    expect(addp.data).toEqual({
      pool_id: 2142,
      token_symbol: "FOO",
      output_symbol: `6,${plan!.quote.symbol}`,
      output_contract: plan!.quote.contract,
    });
    const create = steps.find((s) => s.id === "create")!.actions[0];
    expect(create.data).toEqual({ issuer: "alice", maximum_supply: plan!.fullSupply });
    expect(create.data).not.toHaveProperty("reflection_rate");
    for (const step of steps) {
      for (const action of step.actions) {
        expect(FORBIDDEN_UI_ACTIONS).not.toContain(action.name);
        if (action.name === "create") {
          assertMatchesAbi(action.name, action.data);
          continue;
        }
        if (action.name === "setfees") {
          assertMatchesAbi(action.name, action.data, program === "easyflex" ? [] : ["project_rate", "project_account"]);
          continue;
        }
        if (action.name === "ratios") {
          assertMatchesAbi(action.name, action.data);
          continue;
        }
        assertMatchesAbi(action.name, action.data);
      }
    }
  });

  it("puts setfees after two-field create, with optional forex ratios", () => {
    const draft = draftFor("flexforex");
    const plan = planFromDraft(draft);
    expect(plan).not.toBeNull();
    const steps = simulateLaunchFlow({
      program: "flexforex",
      actor: "alice",
      plan: plan!,
      proofPoolId: 0,
      swapUnderlyingDefault: true,
      poolId: 2142,
      unlockTime: unlockTimeUnix(90),
      tax: {
        reflectionRate: 100,
        burnRate: 0,
        projectRate: 100,
        projectAccount: "",
        angelNumbersBps: 1000,
        jackpotBps: 500,
      },
    });
    const create = steps.find((s) => s.id === "create")!;
    expect(create.actions.map((a) => a.name)).toEqual(["create"]);
    expect(create.actions[0].data).toEqual({ issuer: "alice", maximum_supply: plan!.fullSupply });
    const fees = steps.find((s) => s.id === "setfees")!;
    expect(fees.actions.map((a) => a.name)).toEqual(["setfees", "ratios"]);
    expect(fees.actions[0].data).toEqual({
      sym: "4,FOO",
      reflection_rate: 100,
      burn_rate: 0,
      project_rate: 100,
      project_account: "alice",
    });
    expect(fees.actions[1].data).toEqual({
      token_symbol: "FOO",
      angel_numbers_bps: 1000,
      jackpot_bps: 500,
    });
  });

  it.each(PROGRAMS)("builds gated manage actions for %s", (program) => {
    const actions = simulateManageActions({ program, actor: "alice", symbol: "FOO", precision: 4 });
    const names = actions.map((a) => a.name);
    expect(names).toContain("makeitrain");
    expect(names).toContain("checklock");
    expect(names).toContain("addpool");
    expect(names).toContain("choosereward");
    expect(names).toContain("feeoptout");
    expect(names).toContain("setfees");
    expect(names).toContain("setpresale");
    expect(names).toContain("golive");
    expect(names).toContain("reginsider");
    expect(names).toContain("provelock");
    expect(names).not.toContain("setconfig");
    expect(names).not.toContain("receiverand");
    const setps = actions.find((a) => a.name === "setpresale")!;
    expect(setps.data.mode).toBe(1);
    expect(Number(setps.data.insider_time)).toBeLessThan(Number(setps.data.launch_time));
    assertMatchesAbi("setpresale", setps.data);
    assertMatchesAbi("golive", actions.find((a) => a.name === "golive")!.data);
    if (program === "easyflex") {
      expect(names).toContain("setmin");
      expect(names).not.toContain("mint");
      expect(names).not.toContain("inheritance");
      expect(names).not.toContain("setdist");
      expect(actions.find((a) => a.name === "makeitrain")?.data).toHaveProperty("sender");
      expect(actions.find((a) => a.name === "makeitrain")?.account).toBe(EASYFLEX_CONTRACT);
    }
    if (program === "complexflex") {
      expect(names).toContain("setmin");
      expect(names).toContain("inheritance");
      expect(names).toContain("inheritmemo");
      expect(names).not.toContain("setdist");
      expect(actions.find((a) => a.name === "makeitrain")?.account).toBe(COMPLEXFLEX_CONTRACT);
    }
    if (program === "flexforex") {
      expect(names).not.toContain("setmin");
      expect(names).toContain("setdist");
      expect(names).toContain("ratios");
      expect(names).toContain("setangelnum");
      expect(names).toContain("pullangel");
      expect(names).toContain("pulljackpot");
      expect(actions.find((a) => a.name === "makeitrain")?.data).toHaveProperty("keeper");
      expect(actions.find((a) => a.name === "makeitrain")?.account).toBe(FLEXFOREX_CONTRACT);
    }
    for (const action of actions) {
      const extra =
        action.name === "makeitrain"
          ? program === "flexforex"
            ? ["keeper"]
            : ["sender"]
          : action.name === "setfees" && program !== "easyflex"
            ? ["project_rate", "project_account"]
            : [];
      assertMatchesAbi(action.name, action.data, extra);
    }
  });
});
