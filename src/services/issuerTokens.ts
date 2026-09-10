import { FLEX_PROGRAMS, flexAccount, type FlexProgram } from "@/config/launch";
import { parseAsset } from "@/services/assets";
import { readLaunch, readLaunches, readStat } from "@/services/flexTables";
import type { ChainIssuerToken } from "@/services/managerStore";
import { symbolCodeOf } from "@/services/preflight";
import { getActions } from "@/services/rpc";

function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

function poolIdOf(launch: Record<string, unknown> | null): number | null {
  const n = Number(pick(launch, "pure_liquid_alcor_pool_id", "pool_id"));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function collectForProgram(issuer: string, program: FlexProgram): Promise<ChainIssuerToken[]> {
  const code = flexAccount(program);
  const [launches, created] = await Promise.all([
    readLaunches(code, 400).catch(() => [] as Record<string, unknown>[]),
    getActions({ account: issuer, filter: `${code}:create`, limit: 200 }).catch(() => ({
      actions: [] as Array<{ trx_id?: string; act?: { name?: string; data?: Record<string, unknown> } }>,
    })),
  ]);
  const symbols = new Map<string, { precision?: number; createTx?: string }>();
  for (const row of launches) {
    const symbol = symbolCodeOf(pick(row, "token_symbol", "symbol"));
    if (symbol) symbols.set(symbol, symbols.get(symbol) ?? {});
  }
  for (const a of created.actions) {
    if (a.act?.name && a.act.name !== "create") continue;
    const parsed = parseAsset(String(a.act?.data?.maximum_supply ?? ""));
    if (!parsed) continue;
    const prev = symbols.get(parsed.symbol) ?? {};
    symbols.set(parsed.symbol, {
      precision: parsed.precision,
      createTx: prev.createTx || a.trx_id,
    });
  }
  const out: ChainIssuerToken[] = [];
  for (const [symbol, hint] of symbols) {
    const [stat, launch] = await Promise.all([
      readStat(code, symbol).catch(() => null),
      readLaunch(code, symbol).catch(() => null),
    ]);
    const owner = String(pick(stat, "issuer") ?? "");
    if (owner && owner !== issuer) continue;
    if (!owner && !hint.createTx) continue;
    const supply = parseAsset(String(pick(stat, "supply") ?? "0"));
    const max = parseAsset(String(pick(stat, "max_supply") ?? ""));
    const precision = max?.precision ?? supply?.precision ?? hint.precision;
    if (precision == null) continue;
    const hasStat = Boolean(stat);
    out.push({
      issuer,
      contract: code,
      program,
      symbol,
      precision,
      launched: Boolean(pick(launch, "launched")),
      poolId: poolIdOf(launch),
      supplyPositive: Boolean(supply && Number(supply.amount) > 0),
      hasLaunch: Boolean(launch),
      hasStat,
      createTx: hint.createTx,
    });
  }
  return out;
}

export async function listIssuerTokens(issuer: string): Promise<ChainIssuerToken[]> {
  const name = issuer.trim().toLowerCase();
  if (!name) return [];
  const groups = await Promise.all(FLEX_PROGRAMS.map((p) => collectForProgram(name, p.id)));
  return groups.flat();
}
