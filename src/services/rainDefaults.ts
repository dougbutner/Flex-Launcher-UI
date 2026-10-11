import { formatAsset, parseAsset, parseSupplyInput } from "@/services/assets";
import { readSettings, readStat } from "@/services/flexTables";
import { finishdrawAction, payoutAction, type ChainAction } from "@/services/launchActions";
import { listManagerTokens } from "@/services/managerApi";
import { rainRaw } from "@/services/rainRaw";
import { getInfo } from "@/services/rpc";
import { txErrorMessage } from "@/services/txParse";

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

/** One makeitrain pays at most one Alcor swap, then refunds the rest of that slice. */
export function rainCutShort(beforeRaw: number, afterRaw: number): boolean {
  if (beforeRaw <= 0) return false;
  return beforeRaw - afterRaw < beforeRaw * 0.382 * 0.5;
}

function reflectionRaw(stat: Record<string, unknown> | null): { raw: number; precision: number } {
  const asset = parseAsset(String(stat?.reflection_pool ?? ""));
  if (!asset) return { raw: 0, precision: 0 };
  return { raw: amountToRaw(asset.amount, asset.precision), precision: asset.precision };
}

/**
 * makeitrain: sign again while a swap cut the slice short and the cursor moved.
 * pullangel / pulljackpot: open the draw, then finishdraw on a later block.
 */
export async function signRain(
  transact: (actions: ChainAction[]) => Promise<unknown>,
  action: ChainAction
): Promise<unknown> {
  if (action.name === "pullangel" || action.name === "pulljackpot") {
    const finish = finishdrawAction(action.account, String(action.data.token_symbol ?? ""));
    let head = 0;
    try {
      head = (await getInfo()).head_block_num ?? 0;
      await transact([action]);
    } catch (err) {
      const msg = txErrorMessage(err);
      if (!/draw already open|pot empty/i.test(msg)) throw err;
      if (/pot empty/i.test(msg)) {
        try {
          return await transact([finish]);
        } catch (err2) {
          if (/no open draw/i.test(txErrorMessage(err2))) throw err;
          throw err2;
        }
      }
    }
    try {
      return await transact([finish]);
    } catch (err) {
      if (!/wait a block/i.test(txErrorMessage(err))) throw err;
    }
    const until = Date.now() + 12_000;
    while (Date.now() < until) {
      try {
        if (((await getInfo()).head_block_num ?? 0) > head + 1) break;
      } catch {
        /* head read can fail; the next signature still uses a fresh reference block */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    return transact([finish]);
  }

  if (action.name !== "makeitrain") return transact([action]);
  const symbol = String(action.data.token_symbol ?? "");
  let before = 0;
  try {
    before = reflectionRaw(await readStat(action.account, symbol)).raw;
  } catch {
    /* still sign the first splash */
  }
  let res = await transact([action]);
  let prev = "";
  for (let n = 0; n < 12; n++) {
    let settings: Record<string, unknown> | null = null;
    let after = { raw: 0, precision: 0 };
    try {
      const [nextSettings, stat] = await Promise.all([
        readSettings(action.account, symbol),
        readStat(action.account, symbol),
      ]);
      settings = nextSettings;
      after = reflectionRaw(stat);
    } catch {
      break;
    }
    const keyRaw = settings?.start_key;
    const key = keyRaw == null || keyRaw === "" || keyRaw === 0 || keyRaw === "0" ? "0" : String(keyRaw);
    if (after.raw < reflectionPayFloorRaw(settings?.reflect_min, after.precision)) break;
    if (!rainCutShort(before, after.raw)) break;
    if (key === "0" || key === prev) break;
    prev = key;
    before = after.raw;
    res = await transact([action]);
  }
  return res;
}
