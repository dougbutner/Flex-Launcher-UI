import { formatAsset, parseSupplyInput } from "@/services/assets";
import { payoutAction, type ChainAction } from "@/services/launchActions";
import { listManagerTokens } from "@/services/managerApi";
import { rainRaw } from "@/services/rainRaw";

export { rainRaw };

export type RainDefaults = { rainMinHold: number; rainMinPool: number };

function clampPrecision(precision: number): number {
  const p = Math.floor(Number(precision) || 0);
  return Math.max(0, Math.min(8, p));
}

/** Human token amount (e.g. 3 or 3.0000) → on-chain integer. */
export function amountToRaw(amount: string, precision: number): number {
  const cleaned = parseSupplyInput(amount);
  if (!cleaned || cleaned === ".") return 0;
  const p = clampPrecision(precision);
  const [iRaw, fRaw = ""] = cleaned.split(".");
  const i = (iRaw.replace(/^0+(?=\d)/, "") || "0") || "0";
  if (p <= 0) return rainRaw(i);
  try {
    const frac = (fRaw.replace(/\D/g, "") + "0".repeat(p)).slice(0, p);
    const raw = BigInt(i) * 10n ** BigInt(p) + BigInt(frac || "0");
    if (raw > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
    return Number(raw);
  } catch {
    return 0;
  }
}

export function rawToAmount(raw: number, precision: number): string {
  const n = rainRaw(raw);
  const p = clampPrecision(precision);
  if (p <= 0) return String(n);
  const pad = String(n).padStart(p + 1, "0");
  const i = pad.slice(0, -p).replace(/^0+(?=\d)/, "") || "0";
  return `${i}.${pad.slice(-p)}`;
}

export function formatRainAsset(raw: number, precision: number, symbol: string): string {
  const code = /^[A-Z]{1,7}$/.test(symbol) ? symbol : "TOKEN";
  return formatAsset(rawToAmount(raw, precision), precision, code);
}

/** On-chain makeitrain floor: `reflect_min` if set, else 1 whole token. */
export function reflectionPayFloorRaw(reflectMin: unknown, precision: number): number {
  const min = rainRaw(reflectMin);
  const p = clampPrecision(precision);
  const one = 10 ** p;
  return min > 0 ? min : one;
}

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
