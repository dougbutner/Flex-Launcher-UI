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
  create: ["issuer", "maximum_supply", "reflection_rate", "burn_rate"],
  issue: ["to", "quantity", "memo"],
  mint: ["to", "quantity", "memo"],
  setfees: ["token_symbol", "reflection_rate", "burn_rate"],
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
      "supply",
      "startlaunch",
      "createpool",
      "deposit",
      "addliquid",
      "lockpos",
      "liftoff",
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
    const create = steps.find((s) => s.id === "create")!.actions[0];
    expect(create.data).toHaveProperty("reflection_rate");
    expect(create.data).toHaveProperty("burn_rate");
    if (program === "easyflex") {
      expect(create.data).not.toHaveProperty("project_rate");
    } else {
      expect(create.data).toHaveProperty("project_rate");
      expect(create.data).toHaveProperty("project_account");
    }
    for (const step of steps) {
      for (const action of step.actions) {
        expect(FORBIDDEN_UI_ACTIONS).not.toContain(action.name);
        if (action.name === "create") {
          const fields =
            program === "easyflex"
              ? ABI_FIELDS.create
              : [...ABI_FIELDS.create, "project_rate", "project_account"];
          for (const key of fields) {
            expect(action.data, `${action.name} missing ${key}`).toHaveProperty(key);
          }
          for (const key of Object.keys(action.data)) {
            expect(fields, `${action.name} extra field ${key}`).toContain(key);
          }
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

  it.each(PROGRAMS)("builds gated manage actions for %s", (program) => {
    const actions = simulateManageActions({ program, actor: "alice", symbol: "FOO", precision: 4 });
    const names = actions.map((a) => a.name);
    expect(names).toContain("makeitrain");
    expect(names).toContain("checklock");
    expect(names).toContain("addpool");
    expect(names).toContain("choosereward");
    expect(names).toContain("feeoptout");
    expect(names).toContain("setfees");
    expect(names).not.toContain("setconfig");
    expect(names).not.toContain("receiverand");
    if (program === "easyflex") {
      expect(names).toContain("setmin");
      expect(names).not.toContain("mint");
      expect(names).not.toContain("inheritance");
      expect(names).not.toContain("setdist");
      expect(actions.find((a) => a.name === "makeitrain")?.data).toHaveProperty("sender");
      expect(actions.find((a) => a.name === "makeitrain")?.account).toBe(EASYFLEX_CONTRACT);
      expect(actions.find((a) => a.name === "setfees")?.data).not.toHaveProperty("project_rate");
    }
    if (program === "complexflex") {
      expect(names).toContain("setmin");
      expect(names).toContain("inheritance");
      expect(names).toContain("inheritmemo");
      expect(names).not.toContain("setdist");
      expect(actions.find((a) => a.name === "makeitrain")?.account).toBe(COMPLEXFLEX_CONTRACT);
      expect(actions.find((a) => a.name === "setfees")?.data).toHaveProperty("project_rate");
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
      expect(actions.find((a) => a.name === "setfees")?.data).toHaveProperty("project_account");
    }
    for (const action of actions) {
      const extra = action.name === "makeitrain" ? (program === "flexforex" ? ["keeper"] : ["sender"]) : [];
      if (action.name === "setfees") {
        const fields =
          program === "easyflex"
            ? ABI_FIELDS.setfees
            : [...ABI_FIELDS.setfees, "project_rate", "project_account"];
        for (const key of fields) {
          expect(action.data, `setfees missing ${key}`).toHaveProperty(key);
        }
        for (const key of Object.keys(action.data)) {
          expect(fields, `setfees extra ${key}`).toContain(key);
        }
        continue;
      }
      assertMatchesAbi(action.name, action.data, extra);
    }
  });
});
