import {
  FLEX_PROGRAMS,
  flexAccount,
  PROJECT_CORE_TOKENS,
  type FlexProgram,
} from "@/config/launch";
import { parseAsset } from "@/services/assets";
import { readAccounts, readFlexers, readLaunches, readPositions } from "@/services/flexTables";
import { rankHolders } from "@/services/mechanicsScore";
import { symbolCodeOf } from "@/services/preflight";
import { getActions, getCurrencyBalance } from "@/services/rpc";

function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

const SKIP_OWNERS = new Set(
  FLEX_PROGRAMS.flatMap((p) => [flexAccount(p.id), ...p.vaults]).map((s) => s.toLowerCase())
);

export type TokenMetrics = {
  ranks: Map<string, number>;
  lpByOwner: Map<string, number>;
  holdByOwner: Map<string, number>;
  totalLiq: number;
};

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function loadTokenMetrics(contract: string, symbol: string, poolId: number): Promise<TokenMetrics> {
  const [flexers, positions] = await Promise.all([
    readFlexers(contract, symbol, 500).catch(() => [] as Record<string, unknown>[]),
    poolId > 0 ? readPositions(poolId).catch(() => [] as Record<string, unknown>[]) : Promise.resolve([] as Record<string, unknown>[]),
  ]);
  const balances = flexers
    .map((row) => {
      const owner = String(pick(row, "owner") ?? "").toLowerCase();
      const raw = parseAsset(String(pick(row, "balance") ?? "")) ;
      const amount = raw ? Number(raw.amount) : 0;
      return { owner, raw: amount };
    })
    .filter((row) => row.owner && !SKIP_OWNERS.has(row.owner) && row.owner !== contract);
  const ranks = rankHolders(balances);
  const holdByOwner = new Map(balances.map((row) => [row.owner, row.raw] as const));

  const lpByOwner = new Map<string, number>();
  let totalLiq = 0;
  for (const pos of positions) {
    const owner = String(pick(pos, "owner") ?? "").toLowerCase();
    const liq = num(pick(pos, "liquidity"));
    if (!owner || !(liq > 0)) continue;
    totalLiq += liq;
    lpByOwner.set(owner, (lpByOwner.get(owner) ?? 0) + liq);
  }
  return { ranks, lpByOwner, holdByOwner, totalLiq };
}

const txCache = new Map<string, { at: number; n: number }>();
const TX_TTL = 60_000;

export async function countTokenTxs24h(actor: string, contract: string, symbol: string): Promise<number> {
  const key = `${actor}:${contract}:${symbol}`;
  const hit = txCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < TX_TTL) return hit.n;
  const after = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  let actions: Awaited<ReturnType<typeof getActions>>["actions"] = [];
  try {
    const res = await getActions({
      account: actor,
      filter: `${contract}:*`,
      after,
      limit: 100,
    });
    actions = res.actions;
  } catch {
    try {
      const res = await getActions({
        account: actor,
        filter: `${contract}:transfer`,
        after,
        limit: 100,
      });
      actions = res.actions;
    } catch {
      actions = [];
    }
  }
  const want = symbol.toUpperCase();
  const n = actions.filter((a) => {
    const data = a.act?.data ?? {};
    const qty = String(data.quantity ?? data.token_symbol ?? data.sym ?? "");
    if (qty.toUpperCase().includes(want)) return true;
    const tokenSymbol = String(data.token_symbol ?? "");
    return tokenSymbol.toUpperCase() === want;
  }).length;
  txCache.set(key, { at: now, n });
  return n;
}

export async function actorHoldsToken(contract: string, symbol: string, actor: string): Promise<boolean> {
  if (!actor) return false;
  const rows = await readFlexers(contract, symbol, 500).catch(() => [] as Record<string, unknown>[]);
  const mine = rows.find((row) => String(pick(row, "owner") ?? "").toLowerCase() === actor.toLowerCase());
  if (mine) {
    const parsed = parseAsset(String(pick(mine, "balance") ?? ""));
    if (parsed && Number(parsed.amount) > 0) return true;
  }
  const bals = await getCurrencyBalance(contract, actor, symbol).catch(() => [] as string[]);
  if (bals.some((row) => {
    const parsed = parseAsset(row);
    return Boolean(parsed && parsed.symbol === symbol && Number(parsed.amount) > 0);
  })) {
    return true;
  }
  const acct = await readAccounts(contract, actor, symbol).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return (acct.rows ?? []).some((row) => {
    const parsed = parseAsset(String(pick(row, "balance", "quantity") ?? ""));
    return Boolean(parsed && parsed.symbol === symbol && Number(parsed.amount) > 0);
  });
}

export type LaunchRoom = {
  program: FlexProgram | "core";
  contract: string;
  symbol: string;
  launched: boolean;
  poolId: number;
  quoteSymbol: string;
  quoteContract: string;
  unlockTime: number;
};

const CORE_ROOMS: LaunchRoom[] = PROJECT_CORE_TOKENS.map((t) => ({
  program: "core" as const,
  contract: t.contract,
  symbol: t.symbol,
  launched: true,
  poolId: 0,
  quoteSymbol: t.symbol,
  quoteContract: t.contract,
  unlockTime: 0,
}));

export async function loadLaunchRooms(): Promise<LaunchRoom[]> {
  const groups = await Promise.all(
    FLEX_PROGRAMS.map(async (p) => {
      const code = flexAccount(p.id);
      const rows = await readLaunches(code, 200).catch(() => [] as Record<string, unknown>[]);
      return rows
        .map((row) => {
          const symbol = symbolCodeOf(pick(row, "token_symbol", "symbol"));
          const q = pick(row, "quote") as { quantity?: string; contract?: string } | undefined;
          return {
            program: p.id,
            contract: code,
            symbol,
            launched: Boolean(pick(row, "launched")),
            poolId: Number(pick(row, "pure_liquid_alcor_pool_id", "pool_id") ?? 0),
            quoteSymbol: parseAsset(q?.quantity ?? "")?.symbol ?? "",
            quoteContract: String(q?.contract ?? ""),
            unlockTime: Number(pick(row, "unlock_time") ?? 0),
          } satisfies LaunchRoom;
        })
        .filter((item) => item.symbol);
    })
  );
  const launched = groups.flat();
  const seen = new Set(CORE_ROOMS.map((r) => `${r.contract}:${r.symbol}`));
  return [...CORE_ROOMS, ...launched.filter((r) => !seen.has(`${r.contract}:${r.symbol}`))];
}
