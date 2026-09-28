import { tokenCacheKey } from "@/services/cacheKeys";
import { readFlexpools, readLaunch, readPresale, readSettings, readStat } from "@/services/flexTables";
import { liveOr } from "@/services/readThrough";

export type TokenPublic = {
  launch: Record<string, unknown> | null;
  stat: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  pools: Record<string, unknown>[];
  presale: Record<string, unknown> | null;
};

export async function loadTokenPublicFresh(contract: string, symbol: string): Promise<TokenPublic> {
  const code = contract.trim().toLowerCase();
  const sym = symbol.trim().toUpperCase();
  const [launch, stat, settings, pools, presale] = await Promise.all([
    readLaunch(code, sym),
    readStat(code, sym),
    readSettings(code, sym),
    readFlexpools(code, sym).catch(() => [] as Record<string, unknown>[]),
    readPresale(code, sym).catch(() => null),
  ]);
  return { launch, stat, settings, pools, presale };
}

export function loadTokenPublic(contract: string, symbol: string, opts?: { force?: boolean }): Promise<TokenPublic> {
  const code = contract.trim().toLowerCase();
  const sym = symbol.trim().toUpperCase();
  return liveOr(tokenCacheKey(code, sym), () => loadTokenPublicFresh(code, sym), opts);
}
