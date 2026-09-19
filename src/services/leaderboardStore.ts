import { FLEX_PROGRAMS, flexAccount, type FlexProgram } from "@/config/launch";
import { parseAsset } from "@/services/assets";
import { readFlexers, readLaunches, readStat } from "@/services/flexTables";
import { symbolCodeOf } from "@/services/preflight";
import { fetchAlcorUsdPrice } from "@/services/xtokenCatalog";
import { loadSiteSandbox } from "@/services/siteSandbox";

const TTL_MS = 30_000;
const ALCOR_POOL = "https://proton.alcor.exchange/api/v2/swap/pools";
export const BOARD_SECTION_LIMIT = 12;

export type BoardToken = {
  id: string;
  program: FlexProgram;
  contract: string;
  symbol: string;
  quoteSymbol: string;
  quoteContract: string;
  poolId: number;
  firstSeenAt: number;
  mcapUsd: number;
  liqUsd: number;
  volumeUsd: number;
  holders: number;
};

type AlcorPool = {
  id?: number;
  tvlUSD?: number;
  volumeUSD24?: number;
  firstSeenAt?: string | number;
  tokenA?: { symbol?: string; contract?: string; quantity?: number };
  tokenB?: { symbol?: string; contract?: string; quantity?: number };
};

type Cache = { at: number; tokens: BoardToken[] };

let cache: Cache | null = null;
let inflight: Promise<BoardToken[]> | null = null;

function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

function quoteOf(row: Record<string, unknown>): { symbol: string; contract: string } {
  const q = pick(row, "quote") as { quantity?: string; contract?: string } | undefined;
  return { symbol: parseAsset(q?.quantity ?? "")?.symbol ?? "", contract: String(q?.contract ?? "") };
}

function seenMs(raw: string | number | undefined): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (typeof raw === "string" && raw) {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

function sideQty(
  pool: AlcorPool | null,
  symbol: string,
  contract: string
): number {
  if (!pool || !symbol || !contract) return 0;
  const want = `${contract.toLowerCase()}:${symbol.toUpperCase()}`;
  for (const t of [pool.tokenA, pool.tokenB]) {
    if (!t?.symbol || !t.contract) continue;
    if (`${t.contract.toLowerCase()}:${t.symbol.toUpperCase()}` === want) return Number(t.quantity) || 0;
  }
  return 0;
}

async function fetchPool(id: number): Promise<AlcorPool | null> {
  if (!(id > 0)) return null;
  try {
    const res = await fetch(`${ALCOR_POOL}/${id}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()) as AlcorPool;
  } catch {
    return null;
  }
}

async function holdersOf(program: FlexProgram, contract: string, symbol: string, stat: Record<string, unknown> | null): Promise<number> {
  if (program === "flexforex") return Math.max(0, Number(pick(stat, "flexer_count")) || 0);
  const rows = await readFlexers(contract, symbol, 500).catch(() => []);
  return rows.length;
}

async function loadFresh(): Promise<BoardToken[]> {
  const groups = await Promise.all(
    FLEX_PROGRAMS.map(async (p) => {
      const code = flexAccount(p.id);
      const rows = await readLaunches(code, 200).catch(() => [] as Record<string, unknown>[]);
      return rows
        .filter((r) => Boolean(pick(r, "launched")))
        .map((row) => {
          const symbol = symbolCodeOf(pick(row, "token_symbol", "symbol"));
          const quote = quoteOf(row);
          const poolId = Number(pick(row, "pure_liquid_alcor_pool_id", "pool_id", "poolId") ?? 0);
          return { program: p.id, contract: code, symbol, quote, poolId, row };
        })
        .filter((item) => item.symbol);
    })
  );
  const launched = groups.flat();
  const overlay = await loadSiteSandbox();
  const skip = overlay?.mockKeys() ?? new Set();
  const chain = launched.filter((item) => !skip.has(`${item.contract}:${item.symbol}`));
  const tokens = await Promise.all(
    chain.map(async (item) => {
      const [stat, pool, usdPrice, quoteUsd] = await Promise.all([
        readStat(item.contract, item.symbol).catch(() => null),
        fetchPool(item.poolId),
        fetchAlcorUsdPrice(item.contract, item.symbol).catch(() => 0),
        item.quote.contract
          ? fetchAlcorUsdPrice(item.quote.contract, item.quote.symbol).catch(() => 0)
          : Promise.resolve(0),
      ]);
      const supply = parseAsset(String(pick(stat, "supply") ?? ""));
      const mcapUsd = supply && usdPrice > 0 ? Number(supply.amount) * usdPrice : 0;
      const tvl = Number(pool?.tvlUSD || 0);
      const quoteQty = sideQty(pool, item.quote.symbol, item.quote.contract);
      const liqUsd = tvl > 0 ? tvl : quoteUsd > 0 ? quoteQty * quoteUsd : 0;
      const holders = await holdersOf(item.program, item.contract, item.symbol, stat);
      return {
        id: `${item.contract}:${item.symbol}`,
        program: item.program,
        contract: item.contract,
        symbol: item.symbol,
        quoteSymbol: item.quote.symbol,
        quoteContract: item.quote.contract,
        poolId: item.poolId,
        firstSeenAt: seenMs(pool?.firstSeenAt) || item.poolId,
        mcapUsd,
        liqUsd,
        volumeUsd: Number(pool?.volumeUSD24 || 0),
        holders,
      } satisfies BoardToken;
    })
  );
  return overlay ? overlay.mergeBoard(tokens) : tokens;
}

export async function loadBoardTokens(): Promise<BoardToken[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.tokens;
  if (!inflight) {
    inflight = loadFresh()
      .then((tokens) => {
        cache = { at: Date.now(), tokens };
        return tokens;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function sortNewcomers(tokens: BoardToken[]): BoardToken[] {
  return [...tokens].sort((a, b) => b.firstSeenAt - a.firstSeenAt || b.poolId - a.poolId || a.symbol.localeCompare(b.symbol));
}

export function sortLoudest(tokens: BoardToken[]): BoardToken[] {
  return [...tokens].sort((a, b) => b.volumeUsd - a.volumeUsd || b.mcapUsd - a.mcapUsd || a.symbol.localeCompare(b.symbol));
}

export function sortLargeCap(tokens: BoardToken[]): BoardToken[] {
  return [...tokens].sort((a, b) => b.mcapUsd - a.mcapUsd || b.liqUsd - a.liqUsd || a.symbol.localeCompare(b.symbol));
}

export function sortPopular(tokens: BoardToken[]): BoardToken[] {
  return [...tokens].sort((a, b) => b.holders - a.holders || b.mcapUsd - a.mcapUsd || a.symbol.localeCompare(b.symbol));
}
