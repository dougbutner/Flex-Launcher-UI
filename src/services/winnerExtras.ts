import { loadAlcorMarket } from "@/services/alcorMarket";
import type { BoardToken } from "@/services/leaderboardStore";
import { loadSiteSandbox } from "@/services/siteSandbox";
import { pctFromPoints, sparkFromPoints, type WinnerExtra } from "@/services/winnerViews";

const MONTH_MS = 30 * 86_400_000;
const poolCache = new Map<string, WinnerExtra>();

async function extraFor(token: BoardToken): Promise<WinnerExtra> {
  const hit = poolCache.get(token.id);
  if (hit) return hit;
  const overlay = await loadSiteSandbox();
  const mock = overlay?.mergeMarket(
    {
      poolId: token.poolId,
      tokenContract: token.contract,
      tokenSymbol: token.symbol,
      quoteContract: token.quoteContract,
      quoteSymbol: token.quoteSymbol,
      supply: 0,
    },
    null
  );
  if (mock) {
    const row: WinnerExtra = {
      id: token.id,
      change24: mock.change24,
      changeWeek: mock.changeWeek,
      changeMonth: pctFromPoints(mock.points, MONTH_MS) || mock.changeWeek,
      spark: sparkFromPoints(mock.points),
    };
    poolCache.set(token.id, row);
    return row;
  }
  const live = await loadAlcorMarket({
    poolId: token.poolId,
    tokenContract: token.contract,
    tokenSymbol: token.symbol,
    quoteContract: token.quoteContract,
    quoteSymbol: token.quoteSymbol,
    supply: 0,
  }).catch(() => null);
  const row: WinnerExtra = {
    id: token.id,
    change24: live?.change24 ?? 0,
    changeWeek: live?.changeWeek ?? 0,
    changeMonth: live ? pctFromPoints(live.points, MONTH_MS) || live.changeWeek : 0,
    spark: live ? sparkFromPoints(live.points) : [],
  };
  poolCache.set(token.id, row);
  return row;
}

/** Lazy pool change stats. Only call when a view needs % change. */
export async function loadWinnerExtras(tokens: BoardToken[]): Promise<Map<string, WinnerExtra>> {
  const out = new Map<string, WinnerExtra>();
  const queue = tokens.filter((t) => t.poolId > 0);
  const workers = Array.from({ length: Math.min(4, queue.length || 1) }, async () => {
    while (queue.length) {
      const token = queue.shift();
      if (!token) return;
      out.set(token.id, await extraFor(token));
    }
  });
  await Promise.all(workers);
  return out;
}
