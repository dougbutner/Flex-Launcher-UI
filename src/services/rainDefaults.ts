import { payoutAction, type ChainAction } from "@/services/launchActions";
import { listManagerTokens } from "@/services/managerApi";
import { rainRaw } from "@/services/rainRaw";

export { rainRaw };

export type RainDefaults = { rainMinHold: number; rainMinPool: number };

export function rainFromRow(row: Partial<RainDefaults> | null | undefined): RainDefaults {
  return { rainMinHold: rainRaw(row?.rainMinHold), rainMinPool: rainRaw(row?.rainMinPool) };
}

export async function storedPayoutAction(
  tokenContract: string,
  tokenSymbol: string,
  signer: string,
  role: "sender" | "keeper"
): Promise<ChainAction> {
  let rain = rainFromRow(null);
  try {
    const rows = await listManagerTokens({ contract: tokenContract });
    const row = rows.find((r) => r.symbol === tokenSymbol.trim().toUpperCase());
    if (row) rain = rainFromRow(row);
  } catch {
    /* sqlite optional; 0,0 matches empty optional args on chain */
  }
  return payoutAction(tokenContract, tokenSymbol, signer, role, rain);
}
