import { assetAmountNumber } from "@/services/assets";
import { readAccounts, readFlexers, readInsiders, readPositions, readStat } from "@/services/flexTables";
import type { PoolBookRow } from "@/services/poolSanity";

const SPOT = "alcor";

export type InsiderPool = {
  id: number;
  quote: string;
  tokens: number;
  href: string;
};

export type InsiderRow = {
  account: string;
  holdings: number;
  liquidity: number;
  pools: InsiderPool[];
};

export type WalletDot = {
  account: string;
  tokens: number;
};

function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

function asBig(v: unknown): bigint {
  const s = String(v ?? "").trim();
  if (!/^-?\d+$/.test(s)) return 0n;
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
}

export async function loadHeadcounts(contract: string, symbol: string): Promise<{ holders: number; insiders: number }> {
  const [stat, insiders, flexers] = await Promise.all([
    readStat(contract, symbol).catch(() => null),
    readInsiders(contract, symbol, 500).catch(() => [] as Record<string, unknown>[]),
    readFlexers(contract, symbol, 500).catch(() => [] as Record<string, unknown>[]),
  ]);
  const counted = Number(pick(stat, "flexer_count"));
  const holders = Number.isFinite(counted) && counted > 0 ? counted : flexers.length;
  const insidersN = insiders.filter((row) => pick(row, "approved") !== false && pick(row, "approved") !== 0).length;
  return { holders, insiders: insidersN || insiders.length };
}

export async function loadSpotTokens(contract: string, symbol: string): Promise<number> {
  try {
    const { rows } = await readAccounts(contract, SPOT, symbol);
    return assetAmountNumber(String(pick(rows[0], "balance") ?? "0"));
  } catch {
    return 0;
  }
}

async function balanceOf(contract: string, owner: string, symbol: string): Promise<number> {
  try {
    const { rows } = await readAccounts(contract, owner, symbol);
    return assetAmountNumber(String(pick(rows[0], "balance") ?? "0"));
  } catch {
    return 0;
  }
}

/** Insider wallet balance plus their share of token inventory in each Alcor pool. */
export async function loadInsiderBooks(
  contract: string,
  symbol: string,
  pools: PoolBookRow[]
): Promise<{ insiders: InsiderRow[]; wallets: WalletDot[] }> {
  const [insiderRows, flexers] = await Promise.all([
    readInsiders(contract, symbol, 500).catch(() => [] as Record<string, unknown>[]),
    readFlexers(contract, symbol, 500).catch(() => [] as Record<string, unknown>[]),
  ]);
  const names = insiderRows
    .map((row) => String(pick(row, "account") ?? ""))
    .filter(Boolean);
  const books = pools.filter((pool) => pool.id > 0).slice(0, 12);
  const positions = await Promise.all(
    books.map(async (pool) => {
      const rows = await readPositions(pool.id).catch(() => [] as Record<string, unknown>[]);
      let total = 0n;
      const owned: { owner: string; liq: bigint }[] = [];
      for (const row of rows) {
        const liq = asBig(pick(row, "liquidity"));
        if (liq <= 0n) continue;
        total += liq;
        owned.push({ owner: String(pick(row, "owner") ?? ""), liq });
      }
      return { pool, total, owned };
    })
  );

  const byOwner = new Map<string, InsiderPool[]>();
  for (const group of positions) {
    if (group.total <= 0n || !(group.pool.tokenQty > 0)) continue;
    const perOwner = new Map<string, bigint>();
    for (const row of group.owned) {
      if (!row.owner) continue;
      perOwner.set(row.owner, (perOwner.get(row.owner) ?? 0n) + row.liq);
    }
    for (const [owner, liq] of perOwner) {
      const tokens = (Number(liq) / Number(group.total)) * group.pool.tokenQty;
      if (!(tokens > 0)) continue;
      const list = byOwner.get(owner) ?? [];
      list.push({
        id: group.pool.id,
        quote: group.pool.quoteSymbol || "quote",
        tokens,
        href: `https://alcor.exchange/v/xpr/analytics/pools/${group.pool.id}`,
      });
      byOwner.set(owner, list);
    }
  }

  const holdings = await Promise.all(names.map((account) => balanceOf(contract, account, symbol)));
  const insiders: InsiderRow[] = names.map((account, i) => {
    const poolsFor = (byOwner.get(account) ?? []).sort((a, b) => b.tokens - a.tokens);
    const liquidity = poolsFor.reduce((sum, pool) => sum + pool.tokens, 0);
    return { account, holdings: holdings[i] ?? 0, liquidity, pools: poolsFor.slice(0, 10) };
  });
  insiders.sort((a, b) => b.holdings + b.liquidity - (a.holdings + a.liquidity) || a.account.localeCompare(b.account));

  const skip = new Set([SPOT, "swap.alcor", contract.toLowerCase()]);
  const wallets: WalletDot[] = flexers
    .map((row) => ({
      account: String(pick(row, "owner") ?? ""),
      tokens: assetAmountNumber(String(pick(row, "balance") ?? "0")),
    }))
    .filter((row) => row.account && row.tokens > 0 && !skip.has(row.account.toLowerCase()))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 24);

  return { insiders, wallets };
}
