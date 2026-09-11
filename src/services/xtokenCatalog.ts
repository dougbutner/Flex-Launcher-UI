import { XTOKENS } from "@/config/launch";

export type XtokenRow = {
  symbol: string;
  precision: number;
  usdPrice: number;
  score: number;
  /** Popularity proxy: Alcor 24h+week volume across markets. */
  volume: number;
};

const ALCOR_TOKENS = "https://proton.alcor.exchange/api/v2/tokens";
const ALCOR_MARKETS = "https://proton.alcor.exchange/api/markets";

/** Offline fallback ordered roughly by mainnet popularity. */
export const XTOKEN_FALLBACK: XtokenRow[] = [
  { symbol: "XUSDC", precision: 6, usdPrice: 1, score: 98, volume: 1e9 },
  { symbol: "XXRP", precision: 6, usdPrice: 0, score: 90, volume: 9e8 },
  { symbol: "XBTC", precision: 8, usdPrice: 0, score: 88, volume: 8e8 },
  { symbol: "XETH", precision: 8, usdPrice: 0, score: 86, volume: 7e8 },
  { symbol: "XUSDT", precision: 6, usdPrice: 1, score: 85, volume: 6e8 },
  { symbol: "METAL", precision: 8, usdPrice: 0, score: 84, volume: 5e8 },
  { symbol: "XSOL", precision: 6, usdPrice: 0, score: 80, volume: 4e8 },
  { symbol: "XDOGE", precision: 6, usdPrice: 0, score: 78, volume: 3e8 },
  { symbol: "XXLM", precision: 6, usdPrice: 0, score: 76, volume: 2e8 },
  { symbol: "XHBAR", precision: 6, usdPrice: 0, score: 74, volume: 1e8 },
  { symbol: "XMT", precision: 8, usdPrice: 0, score: 72, volume: 9e7 },
  { symbol: "XBNB", precision: 8, usdPrice: 0, score: 70, volume: 8e7 },
  { symbol: "XADA", precision: 6, usdPrice: 0, score: 68, volume: 7e7 },
  { symbol: "XLTC", precision: 8, usdPrice: 0, score: 66, volume: 6e7 },
  { symbol: "XBCH", precision: 8, usdPrice: 0, score: 64, volume: 5e7 },
  { symbol: "XPAXG", precision: 8, usdPrice: 0, score: 62, volume: 4e7 },
  { symbol: "XDC", precision: 4, usdPrice: 0, score: 60, volume: 3e7 },
];

export const XTOKEN_TOP_N = 10;

const ALCOR_SWAP_POOLS = "https://proton.alcor.exchange/api/v2/swap/pools";

type SwapPool = {
  id: number;
  active?: boolean;
  fee?: number;
  tvlUSD?: number;
  tokenA?: { symbol?: string; contract?: string; id?: string };
  tokenB?: { symbol?: string; contract?: string; id?: string };
};

function tokenId(symbol: string, contract: string): string {
  return `${symbol.toLowerCase()}-${contract}`;
}

/**
 * Best active Alcor AMM pool pairing this quote with XUSDC or XPR (proof pool for startlaunch).
 * Prefers higher TVL. Returns null if none found.
 */
export async function findProofPoolId(symbol: string, contract: string): Promise<{
  poolId: number;
  against: "XUSDC" | "XPR";
  fee: number;
  tvlUSD: number;
} | null> {
  const quoteId = tokenId(symbol, contract);
  const anchors: Array<{ id: string; against: "XUSDC" | "XPR" }> = [
    { id: tokenId("XUSDC", XTOKENS), against: "XUSDC" },
    { id: tokenId("XPR", "eosio.token"), against: "XPR" },
  ];
  // Quoting XUSDC itself: only XPR is a valid proof peer.
  if (symbol.toUpperCase() === "XUSDC" && contract === XTOKENS) {
    anchors.splice(0, 1);
  }

  let best: { poolId: number; against: "XUSDC" | "XPR"; fee: number; tvlUSD: number } | null = null;

  for (const anchor of anchors) {
    if (quoteId === anchor.id) continue;
    const url = `${ALCOR_SWAP_POOLS}?tokenA=${encodeURIComponent(quoteId)}&tokenB=${encodeURIComponent(anchor.id)}`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const pools = (await res.json()) as SwapPool[];
    if (!Array.isArray(pools)) continue;
    for (const p of pools) {
      if (!p.active || !(p.id > 0)) continue;
      const tvl = Number(p.tvlUSD || 0);
      if (!best || tvl > best.tvlUSD) {
        best = { poolId: p.id, against: anchor.against, fee: Number(p.fee || 0), tvlUSD: tvl };
      }
    }
  }
  return best;
}

type AlcorToken = {
  contract?: string;
  symbol?: string;
  decimals?: number;
  usd_price?: number;
  score?: number;
  is_scam?: boolean;
};

type AlcorMarket = {
  frozen?: boolean;
  volume24?: number;
  volumeWeek?: number;
  base_token?: { contract?: string; symbol?: { name?: string } };
  quote_token?: { contract?: string; symbol?: { name?: string } };
};

function rankRows(rows: XtokenRow[]): XtokenRow[] {
  return [...rows].sort((a, b) => {
    if (b.volume !== a.volume) return b.volume - a.volume;
    if (b.score !== a.score) return b.score - a.score;
    return b.usdPrice - a.usdPrice;
  });
}

/** Live xtokens ranked by Alcor market activity (volume), then score. */
export async function fetchXtokensByPopularity(): Promise<XtokenRow[]> {
  const [tokRes, mktRes] = await Promise.all([
    fetch(ALCOR_TOKENS),
    fetch(ALCOR_MARKETS),
  ]);
  if (!tokRes.ok) throw new Error(`tokens HTTP ${tokRes.status}`);
  if (!mktRes.ok) throw new Error(`markets HTTP ${mktRes.status}`);

  const tokens = (await tokRes.json()) as AlcorToken[];
  const markets = (await mktRes.json()) as AlcorMarket[];

  const vol = new Map<string, number>();
  for (const m of markets) {
    if (m.frozen) continue;
    const v = Number(m.volume24 || 0) + Number(m.volumeWeek || 0) * 0.05;
    for (const side of [m.base_token, m.quote_token]) {
      if (!side || side.contract !== XTOKENS) continue;
      const sym = side.symbol?.name?.toUpperCase();
      if (!sym) continue;
      vol.set(sym, (vol.get(sym) || 0) + v);
    }
  }

  const rows: XtokenRow[] = [];
  for (const t of tokens) {
    if (t.contract !== XTOKENS || t.is_scam || !t.symbol) continue;
    const symbol = t.symbol.toUpperCase();
    if (!/^[A-Z]{1,7}$/.test(symbol)) continue;
    rows.push({
      symbol,
      precision: Math.max(0, Math.min(8, Number(t.decimals ?? 6))),
      usdPrice: Number(t.usd_price || 0),
      score: Number(t.score || 0),
      volume: vol.get(symbol) || 0,
    });
  }

  if (!rows.length) return rankRows(XTOKEN_FALLBACK);
  return rankRows(rows);
}

type UsdCache = { at: number; rows: Map<string, number> };
let usdCache: UsdCache | null = null;
let usdInflight: Promise<Map<string, number>> | null = null;
const USD_TTL_MS = 60_000;

function tokenUsdKey(contract: string, symbol: string) {
  return `${contract.toLowerCase()}:${symbol.toUpperCase()}`;
}

async function alcorUsdRows(): Promise<Map<string, number>> {
  const now = Date.now();
  if (usdCache && now - usdCache.at <= USD_TTL_MS) return usdCache.rows;
  if (!usdInflight) {
    usdInflight = (async () => {
      const res = await fetch(ALCOR_TOKENS);
      if (!res.ok) throw new Error(`tokens HTTP ${res.status}`);
      const tokens = (await res.json()) as AlcorToken[];
      const rows = new Map<string, number>();
      for (const t of tokens) {
        if (!t.contract || !t.symbol) continue;
        const usd = Number(t.usd_price || 0);
        if (!(usd > 0)) continue;
        rows.set(tokenUsdKey(t.contract, t.symbol), usd);
      }
      usdCache = { at: Date.now(), rows };
      return rows;
    })().finally(() => {
      usdInflight = null;
    });
  }
  return usdInflight;
}

/** Spot USD from Alcor `api/v2/tokens`. Held constant for range estimates. */
export async function fetchAlcorUsdPrice(contract: string, symbol: string): Promise<number> {
  const rows = await alcorUsdRows();
  const hit = rows.get(tokenUsdKey(contract, symbol));
  if (hit && hit > 0) return hit;
  if (symbol.toUpperCase() === "XUSDC" && contract === XTOKENS) return 1;
  return 0;
}
