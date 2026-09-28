import { loadMarketForCache } from "@/services/alcorMarket";
import { canonCacheKey, CACHE_KEYS } from "@/services/cacheKeys";
import { loadCalendarEventsFresh } from "@/services/launchEvents";
import { loadFreshBoard } from "@/services/leaderboardStore";
import { fetchMajorMcapsFresh } from "@/services/majorMcaps";
import { loadClubMarksFresh } from "@/services/insidersClub";
import { loadLaunchRoomsFresh, loadTokenMetricsFresh } from "@/services/mechanicsLive";
import { loadDrylandsFresh } from "@/services/rainBoard";
import { loadTokenBookForCache } from "@/services/tokenBook";
import { loadTokenPublicFresh } from "@/services/tokenSnapshot";
import { fetchProtonTokenRows } from "@/services/tokenProton";
import { fetchUsdEntriesFresh } from "@/services/xtokenCatalog";

export async function refreshCacheKey(raw: string): Promise<unknown> {
  const key = canonCacheKey(raw);
  if (!key) throw new Error("Unknown cache key.");
  if (key === CACHE_KEYS.board) return loadFreshBoard();
  if (key === CACHE_KEYS.rooms) return loadLaunchRoomsFresh();
  if (key === CACHE_KEYS.calendar) return loadCalendarEventsFresh();
  if (key === CACHE_KEYS.rain) return loadDrylandsFresh();
  if (key === CACHE_KEYS.usd) return fetchUsdEntriesFresh();
  if (key === CACHE_KEYS.mcaps) return fetchMajorMcapsFresh();
  if (key === CACHE_KEYS.proton) return fetchProtonTokenRows();
  if (key.startsWith("market:")) return loadMarketForCache(key);
  if (key.startsWith("token:")) {
    const parts = key.split(":");
    return loadTokenPublicFresh(parts[1] || "", parts[2] || "");
  }
  if (key.startsWith("book:")) {
    const parts = key.split(":");
    return loadTokenBookForCache(parts[1] || "", parts[2] || "");
  }
  if (key.startsWith("marks:")) {
    const parts = key.split(":");
    return loadClubMarksFresh(parts[1] || "", parts[2] || "");
  }
  if (key.startsWith("metrics:")) {
    const parts = key.split(":");
    return loadTokenMetricsFresh(parts[1] || "", parts[2] || "", Number(parts[3] || 0));
  }
  throw new Error("Unknown cache key.");
}
