import { formatNiceNumber } from "@/services/money";
import { fetchAlcorUsdPrice } from "@/services/xtokenCatalog";
import { loadSiteSandbox, siteSandboxFlag } from "@/services/siteSandbox";

const ALCOR_POOL = "https://proton.alcor.exchange/api/v2/swap/pools";

export type ChartRange = "1d" | "7d" | "all";

export type ChartPoint = { t: number; price: number };

export type MarketTrade = {
  t: number;
  price: number;
  usd: number;
  side: "buy" | "sell";
  sender: string;
};

export type AlcorPoolRow = {
  id?: number;
  fee?: number;
  change24?: number;
  changeWeek?: number;
  priceA?: number;
  priceB?: number;
  tvlUSD?: number;
  volumeUSD24?: number;
  volumeUSDWeek?: number;
  firstSeenAt?: string | number;
  tokenA?: { symbol?: string; contract?: string; quantity?: number; id?: string };
  tokenB?: { symbol?: string; contract?: string; quantity?: number; id?: string };
};

export type AlcorSwapRow = {
  time?: string;
  tokenA?: number;
  tokenB?: number;
  totalUSDVolume?: number;
  sender?: string;
};

export type AlcorMarketView = {
  poolId: number;
  priceQuote: number;
  priceUsd: number;
  change24: number;
  changeWeek: number;
  volumeUsd24: number;
  volumeUsdWeek: number;
  tvlUsd: number;
  mcapUsd: number;
  fee: number;
  tokenQty: number;
  quoteQty: number;
  firstSeenAt: number;
  tokenIsA: boolean;
  points: ChartPoint[];
  trades: MarketTrade[];
};

function sameToken(
  side: { symbol?: string; contract?: string } | undefined,
  symbol: string,
  contract: string
): boolean {
  if (!side?.symbol || !side.contract) return false;
  return side.symbol.toUpperCase() === symbol.toUpperCase() && side.contract.toLowerCase() === contract.toLowerCase();
}

export function poolTokenIsA(pool: AlcorPoolRow, symbol: string, contract: string): boolean {
  return sameToken(pool.tokenA, symbol, contract);
}

/** Quote per 1 token from a pool swap delta. */
export function quotePerToken(swap: AlcorSwapRow, tokenIsA: boolean): number | null {
  const a = Math.abs(Number(swap.tokenA) || 0);
  const b = Math.abs(Number(swap.tokenB) || 0);
  if (!(a > 0 && b > 0)) return null;
  const price = tokenIsA ? b / a : a / b;
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** Pool lost the token (negative delta) means the trader bought it. */
export function tradeSide(tokenDelta: number): "buy" | "sell" {
  return tokenDelta < 0 ? "buy" : "sell";
}

export function swapTimeMs(raw: string | undefined): number {
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

export function downsamplePoints(points: ChartPoint[], max = 160): ChartPoint[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: ChartPoint[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

export function filterPoints(points: ChartPoint[], range: ChartRange, now = Date.now()): ChartPoint[] {
  if (range === "all" || points.length < 2) return points;
  const ms = range === "1d" ? 86_400_000 : 7 * 86_400_000;
  const cut = now - ms;
  const sliced = points.filter((p) => p.t >= cut);
  return sliced.length >= 2 ? sliced : points.slice(-Math.min(points.length, 8));
}

export function fmtQuotePrice(n: number): string {
  if (!(n > 0) || !Number.isFinite(n)) return "-";
  return formatNiceNumber(n);
}

export function fmtPctChange(n: number): string {
  if (!Number.isFinite(n)) return "-";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function fmtPoolFee(fee: number): string {
  if (!(fee > 0)) return "-";
  return `${(fee / 10_000).toFixed(2)}%`;
}

export function seenMs(raw: string | number | undefined): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (typeof raw === "string" && raw) {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

function qtyOf(
  pool: AlcorPoolRow,
  symbol: string,
  contract: string
): number {
  for (const t of [pool.tokenA, pool.tokenB]) {
    if (sameToken(t, symbol, contract)) return Number(t?.quantity) || 0;
  }
  return 0;
}

function buildPoints(swaps: AlcorSwapRow[], tokenIsA: boolean): ChartPoint[] {
  const pts: ChartPoint[] = [];
  for (let i = swaps.length - 1; i >= 0; i--) {
    const s = swaps[i];
    const price = quotePerToken(s, tokenIsA);
    const t = swapTimeMs(s.time);
    if (price && t > 0) pts.push({ t, price });
  }
  return downsamplePoints(pts);
}

function buildTrades(swaps: AlcorSwapRow[], tokenIsA: boolean, limit = 12): MarketTrade[] {
  const out: MarketTrade[] = [];
  for (const s of swaps) {
    const price = quotePerToken(s, tokenIsA);
    const t = swapTimeMs(s.time);
    const tokenDelta = tokenIsA ? Number(s.tokenA) || 0 : Number(s.tokenB) || 0;
    if (!price || !(t > 0)) continue;
    out.push({
      t,
      price,
      usd: Number(s.totalUSDVolume) || 0,
      side: tradeSide(tokenDelta),
      sender: String(s.sender || ""),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function loadAlcorMarket(args: {
  poolId: number;
  tokenContract: string;
  tokenSymbol: string;
  quoteContract: string;
  quoteSymbol: string;
  supply: number;
}): Promise<AlcorMarketView | null> {
  if (!(args.poolId > 0)) return null;
  if (siteSandboxFlag()) {
    const overlay = await loadSiteSandbox();
    const mock = overlay?.mergeMarket(args, null);
    if (mock) return mock;
  }
  const [poolRes, swapsRes, usdPrice, quoteUsd] = await Promise.all([
    fetch(`${ALCOR_POOL}/${args.poolId}`, { signal: AbortSignal.timeout(10_000) }),
    fetch(`${ALCOR_POOL}/${args.poolId}/swaps?limit=500`, { signal: AbortSignal.timeout(12_000) }),
    fetchAlcorUsdPrice(args.tokenContract, args.tokenSymbol).catch(() => 0),
    args.quoteContract
      ? fetchAlcorUsdPrice(args.quoteContract, args.quoteSymbol).catch(() => 0)
      : Promise.resolve(0),
  ]);
  if (!poolRes.ok) return null;
  const pool = (await poolRes.json()) as AlcorPoolRow;
  const swaps = swapsRes.ok ? ((await swapsRes.json()) as AlcorSwapRow[]) : [];
  const tokenIsA = poolTokenIsA(pool, args.tokenSymbol, args.tokenContract);
  const priceQuote = Number(tokenIsA ? pool.priceA : pool.priceB) || 0;
  const tokenQty = qtyOf(pool, args.tokenSymbol, args.tokenContract);
  const quoteQty = qtyOf(pool, args.quoteSymbol, args.quoteContract);
  const tvlUsd =
    Number(pool.tvlUSD) || (quoteUsd > 0 ? quoteQty * quoteUsd : usdPrice > 0 ? tokenQty * usdPrice : 0);
  return {
    poolId: Number(pool.id) || args.poolId,
    priceQuote,
    priceUsd: usdPrice,
    change24: Number(pool.change24) || 0,
    changeWeek: Number(pool.changeWeek) || 0,
    volumeUsd24: Number(pool.volumeUSD24) || 0,
    volumeUsdWeek: Number(pool.volumeUSDWeek) || 0,
    tvlUsd,
    mcapUsd: args.supply > 0 && usdPrice > 0 ? args.supply * usdPrice : 0,
    fee: Number(pool.fee) || 0,
    tokenQty,
    quoteQty,
    firstSeenAt: seenMs(pool.firstSeenAt),
    tokenIsA,
    points: buildPoints(Array.isArray(swaps) ? swaps : [], tokenIsA),
    trades: buildTrades(Array.isArray(swaps) ? swaps : [], tokenIsA),
  };
}
