import {
  FLEX_PROGRAMS,
  PROJECT_CORE_TOKENS,
  QUOTE_PRESETS,
  flexAccount,
  type FlexProgram,
} from "@/config/launch";
import { parseAsset } from "@/services/assets";
import { CACHE_KEYS } from "@/services/cacheKeys";
import { readLaunches, readSettings, readStat } from "@/services/flexTables";
import { amountToRaw, reflectionPayFloorRaw } from "@/services/rainDefaults";
import { symbolCodeOf } from "@/services/preflight";
import { liveOr } from "@/services/readThrough";
import { fetchAlcorUsdPrice } from "@/services/xtokenCatalog";

export type Dryland = {
  key: string;
  program: FlexProgram | null;
  contract: string;
  symbol: string;
  precision: number;
  pool: number;
  poolRaw: number;
  floorRaw: number;
  usd: number;
  rainAction?: string;
};

function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

async function drylandFromStat(
  contract: string,
  symbol: string,
  extra: Pick<Dryland, "program" | "rainAction">
): Promise<Dryland | null> {
  const [stat, settings] = await Promise.all([
    readStat(contract, symbol).catch(() => null),
    readSettings(contract, symbol).catch(() => null),
  ]);
  const poolAsset = parseAsset(String(pick(stat, "reflection_pool") ?? ""));
  const precision = poolAsset?.precision ?? QUOTE_PRESETS.find((q) => q.symbol === symbol)?.precision ?? 4;
  const pool = poolAsset ? Number(poolAsset.amount) : 0;
  const poolRaw = poolAsset ? amountToRaw(poolAsset.amount, precision) : 0;
  const floorRaw = reflectionPayFloorRaw(pick(settings, "reflect_min"), precision);
  return {
    key: `${contract}:${symbol}`,
    program: extra.program,
    contract,
    symbol,
    precision,
    pool,
    poolRaw,
    floorRaw,
    usd: 0,
    rainAction: extra.rainAction,
  };
}

function isCoreToken(row: Dryland) {
  return PROJECT_CORE_TOKENS.some((t) => t.contract === row.contract && t.symbol === row.symbol);
}

function sortDrylandGroup(rows: Dryland[]) {
  const head = rows.filter(isCoreToken);
  const rest = rows
    .filter((r) => !isCoreToken(r))
    .sort((a, b) => b.usd - a.usd || b.pool - a.pool || a.symbol.localeCompare(b.symbol));
  return [...head, ...rest];
}

export async function loadDrylandsFresh(): Promise<Dryland[]> {
  const core = await Promise.all(
    PROJECT_CORE_TOKENS.map((t) => drylandFromStat(t.contract, t.symbol, { program: null, rainAction: t.rainAction }))
  );
  const groups = await Promise.all(
    FLEX_PROGRAMS.map(async (p) => {
      const code = flexAccount(p.id);
      const launches = await readLaunches(code, 200).catch(() => [] as Record<string, unknown>[]);
      const items = launches
        .filter((row) => Boolean(pick(row, "launched")))
        .map((row) => ({ code, program: p.id, symbol: symbolCodeOf(pick(row, "token_symbol", "symbol")) }))
        .filter((item) => item.symbol);
      return Promise.all(
        items.map(async ({ code, program, symbol }) => {
          const row = await drylandFromStat(code, symbol, { program });
          if (!row || !(row.pool > 0)) return null;
          return row;
        })
      );
    })
  );
  const seen = new Set(core.filter((r): r is Dryland => r != null).map((r) => r.key));
  const launched = groups.flat().filter((row): row is Dryland => row != null && !seen.has(row.key));
  const rows = [...core.filter((r): r is Dryland => r != null), ...launched];
  await Promise.all(
    rows.map(async (row) => {
      const usdPrice = await fetchAlcorUsdPrice(row.contract, row.symbol).catch(() => 0);
      row.usd = usdPrice > 0 ? row.pool * usdPrice : 0;
    })
  );
  const ready = sortDrylandGroup(rows.filter((r) => r.poolRaw >= r.floorRaw));
  const below = sortDrylandGroup(rows.filter((r) => r.poolRaw < r.floorRaw));
  return [...ready, ...below];
}

export function loadDrylands(opts?: { force?: boolean }): Promise<Dryland[]> {
  return liveOr(CACHE_KEYS.rain, () => loadDrylandsFresh(), opts);
}
