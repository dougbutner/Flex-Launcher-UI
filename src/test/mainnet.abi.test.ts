import { describe, expect, it } from "vitest";
import {
  COMPLEXFLEX_CONTRACT,
  EASYFLEX_CONTRACT,
  FLEXFOREX_CONTRACT,
  RPC_ENDPOINTS,
  SWAP_ALCOR,
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

type Abi = {
  actions?: Array<{ name: string; type: string }>;
  structs?: Array<{ name: string; fields: Array<{ name: string; type: string }> }>;
};

async function rpcPost<T>(path: string, body: unknown): Promise<T> {
  let last = "RPC failed";
  for (const base of RPC_ENDPOINTS) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as T & { error?: { what?: string } };
      if (!res.ok) {
        last = data?.error?.what || res.statusText;
        continue;
      }
      return data;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(last);
}

function fieldsOf(abi: Abi, actionName: string): string[] {
  const spec = abi.actions?.find((a) => a.name === actionName);
  if (!spec) return [];
  const struct = abi.structs?.find((s) => s.name === spec.type);
  return (struct?.fields ?? []).map((f) => f.name);
}

describe("live XPR mainnet ABI", () => {
  it(
    "matches every UI action the wizard and manage screens sign",
    { timeout: 30_000 },
    async () => {
      const info = await rpcPost<{ chain_id?: string }>("/v1/chain/get_info", {});
      expect(info.chain_id).toBe(XPR_CHAIN_ID_HEX);

      const [easy, complex, forex, swap] = await Promise.all([
        rpcPost<{ abi?: Abi }>("/v1/chain/get_abi", { account_name: EASYFLEX_CONTRACT }),
        rpcPost<{ abi?: Abi }>("/v1/chain/get_abi", { account_name: COMPLEXFLEX_CONTRACT }),
        rpcPost<{ abi?: Abi }>("/v1/chain/get_abi", { account_name: FLEXFOREX_CONTRACT }),
        rpcPost<{ abi?: Abi }>("/v1/chain/get_abi", { account_name: SWAP_ALCOR }),
      ]);
      const abis: Record<string, Abi> = {
        [EASYFLEX_CONTRACT]: easy.abi ?? {},
        [COMPLEXFLEX_CONTRACT]: complex.abi ?? {},
        [FLEXFOREX_CONTRACT]: forex.abi ?? {},
        [SWAP_ALCOR]: swap.abi ?? {},
      };

      const programs: FlexProgram[] = ["easyflex", "complexflex", "flexforex"];
      for (const program of programs) {
        const draft = applyRangeWidth(
          { ...emptyDraft(), program, name: "Foo", symbol: "FOO", precision: 4, maxSupply: "1000000" },
          "slow"
        );
        const plan = planFromDraft({
          ...emptyDraft(),
          ...draft,
          program,
          name: "Foo",
          symbol: "FOO",
          precision: 4,
          maxSupply: "1000000",
        });
        expect(plan).not.toBeNull();
        const wizard = simulateLaunchFlow({
          program,
          actor: "alice",
          plan: plan!,
          proofPoolId: 0,
          swapUnderlyingDefault: true,
          poolId: 2142,
          unlockTime: unlockTimeUnix(90),
        });
        const manage = simulateManageActions({ program, actor: "alice", symbol: "FOO" });
        for (const action of [...wizard.flatMap((s) => s.actions), ...manage]) {
          expect(FORBIDDEN_UI_ACTIONS, action.name).not.toContain(action.name);
          const abi = abis[action.account];
          expect(abi, `no ABI for ${action.account}`).toBeTruthy();
          const names = (abi.actions ?? []).map((a) => a.name);
          if (action.name === "setfees" && !names.includes("setfees")) continue;
          expect(names, `${action.account} missing ${action.name}`).toContain(action.name);
          const fields = fieldsOf(abi, action.name);
          if (action.name === "create") {
            for (const field of fields) {
              expect(action.data, `${action.account}::create missing live field ${field}`).toHaveProperty(field);
            }
            continue;
          }
          for (const key of Object.keys(action.data)) {
            expect(fields, `${action.account}::${action.name} extra ${key}`).toContain(key);
          }
          for (const field of fields) {
            expect(action.data, `${action.account}::${action.name} missing ${field}`).toHaveProperty(field);
          }
        }
      }
    }
  );
});
