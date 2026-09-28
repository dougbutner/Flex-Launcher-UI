import { CACHE_KEYS } from "@/services/cacheKeys";
import { liveOr } from "@/services/readThrough";

export type MajorMcap = {
  id: "bitcoin" | "ripple" | "solana";
  label: string;
  usd: number;
};

/** Ballpark circ. market caps if CoinGecko is unreachable. */
export const MAJOR_MCAP_FALLBACK: MajorMcap[] = [
  { id: "solana", label: "Solana", usd: 100_000_000_000 },
  { id: "ripple", label: "XRP", usd: 160_000_000_000 },
  { id: "bitcoin", label: "Bitcoin", usd: 2_200_000_000_000 },
];

const COINGECKO =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ripple,solana&vs_currencies=usd&include_market_cap=true";

let cache: { at: number; rows: MajorMcap[] } | null = null;
const TTL_MS = 15 * 60 * 1000;

export async function fetchMajorMcapsFresh(): Promise<MajorMcap[]> {
  const res = await fetch(COINGECKO);
  if (!res.ok) return cache?.rows ?? MAJOR_MCAP_FALLBACK;
  const json = (await res.json()) as Record<string, { usd_market_cap?: number }>;
  return MAJOR_MCAP_FALLBACK.map((row) => {
    const usd = Number(json[row.id]?.usd_market_cap || 0);
    return usd > 0 ? { ...row, usd } : row;
  }).sort((a, b) => a.usd - b.usd);
}

async function fetchMajorMcapsLocal(): Promise<MajorMcap[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  try {
    const rows = await fetchMajorMcapsFresh();
    cache = { at: Date.now(), rows };
    return rows;
  } catch {
    return cache?.rows ?? MAJOR_MCAP_FALLBACK;
  }
}

export async function fetchMajorMcaps(opts?: { force?: boolean }): Promise<MajorMcap[]> {
  return liveOr(CACHE_KEYS.mcaps, () => fetchMajorMcapsLocal(), opts);
}
