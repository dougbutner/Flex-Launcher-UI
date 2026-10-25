import { EASY_SYMBOL, FLEX_PROGRAMS, MON3Y, flexAccount } from "@/config/launch";
import { loadBoardTokens } from "@/services/leaderboardStore";
import { getActions } from "@/services/rpc";

const POOLS = "https://proton.alcor.exchange/api/v2/swap/pools";
const GLOBAL = "https://proton.alcor.exchange/api/v2/analytics/global";

export type HomeCounts = {
  tx30: number | null;
  volumeUsd: number | null;
  launched: number | null;
  presale: number | null;
  holders: number | null;
  tx24: number | null;
};

/** Board totals plus 30-day flex transfers and Alcor's published 24h swap count. */
export async function loadHomeCounts(): Promise<HomeCounts> {
  const after = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [tokens, txParts, global] = await Promise.all([
    loadBoardTokens().catch(() => null),
    Promise.all(
      FLEX_PROGRAMS.map((p) => {
        const code = flexAccount(p.id);
        return getActions({ account: code, filter: `${code}:transfer`, after, limit: 1 })
          .then((res) => res.total)
          .catch(() => 0);
      }),
    ),
    fetch(GLOBAL, { signal: AbortSignal.timeout(12000) })
      .then((res) => (res.ok ? (res.json() as Promise<{ swapTransactions?: number; spotTransactions?: number }>) : null))
      .catch(() => null),
  ]);
  const tx24 =
    global && Number.isFinite(Number(global.swapTransactions))
      ? Number(global.swapTransactions) + (Number(global.spotTransactions) || 0)
      : null;
  if (!tokens) {
    return { tx30: txParts.reduce((sum, n) => sum + n, 0), volumeUsd: null, launched: null, presale: null, holders: null, tx24 };
  }
  return {
    tx30: txParts.reduce((sum, n) => sum + n, 0),
    volumeUsd: tokens.reduce((sum, t) => sum + (t.volumeUsd || 0), 0),
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
