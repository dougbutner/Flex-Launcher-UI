import { EASY_SYMBOL, FLEX_PROGRAMS, MON3Y, PROJECT_CORE_TOKENS, alcorTokenId, flexAccount } from "@/config/launch";
import { loadBoardTokens } from "@/services/leaderboardStore";
import { readLaunches } from "@/services/flexTables";
import { symbolCodeOf } from "@/services/preflight";

const POOLS = "https://proton.alcor.exchange/api/v2/swap/pools";
const GLOBAL = "https://proton.alcor.exchange/api/v2/analytics/global";

export type HomeCounts = {
  launched: number | null;
  presale: number | null;
  holders: number | null;
  tx24: number | null;
};

/** `usd` stays empty until at least one real read is in. `partial` means some tokens are still missing. */
export type VolumeRead = { usd: number | null; partial: boolean };

export function volumeRead(usd: number, pending: number, failed: number, anyKnown: boolean): VolumeRead {
  if (!anyKnown || (pending > 0 && usd <= 0)) return { usd: null, partial: false };
  return { usd, partial: pending > 0 || failed > 0 };
}

type PoolSide = { id?: number; volumeUSD24?: number };

/** Both sides must answer. A miss is unknown, not zero. */
async function tokenPools(symbol: string, contract: string): Promise<Map<number, number> | null> {
  const id = alcorTokenId(symbol, contract);
  try {
    const sides = await Promise.all(
      (["tokenA", "tokenB"] as const).map(async (side) => {
        const res = await fetch(`${POOLS}?${side}=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as PoolSide[];
        if (!Array.isArray(data)) throw new Error("pools");
        return data;
      }),
    );
    const out = new Map<number, number>();
    for (const row of sides.flat()) {
      const poolId = Number(row.id);
      if (poolId > 0) out.set(poolId, Number(row.volumeUSD24) || 0);
    }
    return out;
  } catch {
    return null;
  }
}

/** EASY on its own, and every other flex token. One missed token does not wipe the rest. */
export async function loadHomeVolumes(paint: (kind: "easy" | "flex", row: VolumeRead) => void): Promise<void> {
  const easy = tokenPools(EASY_SYMBOL, MON3Y).then((pools) => {
    if (!pools) {
      paint("easy", { usd: null, partial: false });
      return;
    }
    let usd = 0;
    for (const v of pools.values()) usd += v;
    paint("easy", { usd, partial: false });
  });

  const flex = (async () => {
    const seen = new Map<number, number>();
    const queued = new Set<string>([`${MON3Y}:${EASY_SYMBOL}`]);
    let usd = 0;
    let pending = 0;
    let failed = 0;
    let anyKnown = false;
    let listOpen = true;
    const paintFlex = () => paint("flex", volumeRead(usd, pending + (listOpen ? 1 : 0), failed, anyKnown));
    const take = async (list: Array<{ symbol: string; contract: string }>) => {
      let next = 0;
      const workers = Array.from({ length: Math.min(4, list.length) }, async () => {
        while (next < list.length) {
          const item = list[next++];
          const pools = await tokenPools(item.symbol, item.contract);
          if (pools) {
            anyKnown = true;
            for (const [poolId, v] of pools) {
              if (!seen.has(poolId)) usd += v;
              seen.set(poolId, v);
            }
          } else failed += 1;
          pending -= 1;
          paintFlex();
        }
      });
      await Promise.all(workers);
    };
    const cores: Array<{ symbol: string; contract: string }> = [];
    for (const t of PROJECT_CORE_TOKENS) {
      const key = `${t.contract}:${t.symbol}`;
      if (queued.has(key)) continue;
      queued.add(key);
      cores.push({ symbol: t.symbol, contract: t.contract });
    }
    pending = cores.length;
    const listed = Promise.all(
      FLEX_PROGRAMS.map(async (p) => {
        const code = flexAccount(p.id);
        try {
          return { code, rows: await readLaunches(code, 200) };
        } catch {
          return { code, rows: null as Record<string, unknown>[] | null };
        }
      }),
    );
    await take(cores);
    const groups = await listed;
    const more: Array<{ symbol: string; contract: string }> = [];
    for (const group of groups) {
      if (!group.rows) {
        failed += 1;
        continue;
      }
      for (const row of group.rows) {
        const symbol = symbolCodeOf(row.token_symbol ?? row.symbol);
        if (!symbol) continue;
        const launched = Boolean(row.launched);
        const poolId = Number(row.pure_liquid_alcor_pool_id ?? 0);
        if (!launched && !(poolId > 0)) continue;
        const key = `${group.code}:${symbol}`;
        if (queued.has(key)) continue;
        queued.add(key);
        more.push({ symbol, contract: group.code });
      }
    }
    listOpen = false;
    pending += more.length;
    paintFlex();
    await take(more);
  })();

  await Promise.all([easy, flex]);
}

/** Board totals plus Alcor's published 24h swap count. */
export async function loadHomeCounts(): Promise<HomeCounts> {
  const [tokens, global] = await Promise.all([
    loadBoardTokens().catch(() => null),
    fetch(GLOBAL, { signal: AbortSignal.timeout(12000) })
      .then((res) => (res.ok ? (res.json() as Promise<{ swapTransactions?: number; spotTransactions?: number }>) : null))
      .catch(() => null),
  ]);
  const tx24 =
    global && Number.isFinite(Number(global.swapTransactions))
      ? Number(global.swapTransactions) + (Number(global.spotTransactions) || 0)
      : null;
  if (!tokens) return { launched: null, presale: null, holders: null, tx24 };
  return {
    launched: tokens.filter((t) => !t.pre).length,
    presale: tokens.filter((t) => t.pre).length,
    holders: tokens.reduce((sum, t) => sum + (t.holders || 0), 0),
    tx24,
  };
}

/** EASY share of all XPR swap volume on Alcor. Null when the pool list does not load. */
export async function loadEasyDominance(): Promise<number | null> {
  try {
    const res = await fetch(POOLS, { signal: AbortSignal.timeout(50000) });
    if (!res.ok) return null;
    const pools = (await res.json()) as Array<{
      volumeUSD24?: number;
      tokenA?: { symbol?: string; contract?: string };
      tokenB?: { symbol?: string; contract?: string };
    }>;
    let easy = 0;
    let all = 0;
    for (const pool of pools) {
      const v = Number(pool.volumeUSD24) || 0;
      all += v;
      const side = [pool.tokenA, pool.tokenB].some(
        (s) => s?.symbol?.toUpperCase() === EASY_SYMBOL && s?.contract?.toLowerCase() === MON3Y,
      );
      if (side) easy += v;
    }
    return all > 0 ? easy / all : null;
  } catch {
    return null;
  }
}
