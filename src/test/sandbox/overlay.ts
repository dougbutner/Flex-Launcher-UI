import type { AlcorMarketView } from "@/services/alcorMarket";
import type { InsiderPost, FeedResponse } from "@/services/insidersApi";
import type { BoardToken } from "@/services/leaderboardStore";
import { rangeSince, type FeedRange } from "@/services/insidersRules";
import { MOCK_BY_KEY, MOCK_KEYS, MOCK_TOKENS, mockKey, unixMs } from "@/test/sandbox/data";

function keyOf(contract: string, symbol: string) {
  return mockKey(contract, symbol);
}

function tokenOf(contract: string, symbol: string) {
  return MOCK_BY_KEY.get(keyOf(contract, symbol)) ?? null;
}

export function mockKeys(): Set<string> {
  return MOCK_KEYS;
}

export function isMockToken(contract: string, symbol: string) {
  return MOCK_KEYS.has(keyOf(contract, symbol));
}

export function mergeLaunch(contract: string, symbol: string, live: Record<string, unknown> | null) {
  if (live) return live;
  return tokenOf(contract, symbol)?.launch ?? null;
}

export function mergeLaunches(code: string, live: Record<string, unknown>[]) {
  const want = code.trim().toLowerCase();
  const have = new Set(
    live.map((row) => String(row.token_symbol ?? row.symbol ?? "").toUpperCase().replace(/[^A-Z]/g, ""))
  );
  const extra = MOCK_TOKENS.filter((t) => t.spec.contract === want && !have.has(t.spec.symbol)).map((t) => t.launch);
  return extra.length ? [...live, ...extra] : live;
}

export function mergeStat(contract: string, symbol: string, live: Record<string, unknown> | null) {
  if (live) return live;
  return tokenOf(contract, symbol)?.stat ?? null;
}

export function mergeSettings(contract: string, symbol: string, live: Record<string, unknown> | null) {
  if (live) return live;
  return tokenOf(contract, symbol)?.settings ?? null;
}

export function mergePresale(contract: string, symbol: string, live: Record<string, unknown> | null) {
  if (live) return live;
  return tokenOf(contract, symbol)?.presale ?? null;
}

export function mergeInsiders(contract: string, symbol: string, live: Record<string, unknown>[]) {
  const mock = tokenOf(contract, symbol);
  if (!mock) return live;
  const have = new Set(live.map((row) => String(row.account ?? "").toLowerCase()));
  const extra = mock.insiders.filter((row) => !have.has(String(row.account).toLowerCase()));
  return extra.length ? [...live, ...extra] : live;
}

export function mergeFlexers(contract: string, symbol: string, live: Record<string, unknown>[]) {
  const mock = tokenOf(contract, symbol);
  if (!mock) return live;
  const have = new Set(live.map((row) => String(row.owner ?? "").toLowerCase()));
  const extra = mock.flexers.filter((row) => !have.has(String(row.owner).toLowerCase()));
  return extra.length ? [...live, ...extra] : live;
}

export function mergeFlexpools(contract: string, symbol: string, live: Record<string, unknown>[]) {
  const mock = tokenOf(contract, symbol);
  if (!mock) return live;
  const have = new Set(live.map((row) => Number(row.id)));
  const extra = mock.pools.filter((row) => !have.has(Number(row.id)));
  return extra.length ? [...live, ...extra] : live;
}

export function mergeAccounts(
  contract: string,
  owner: string,
  symbol: string | undefined,
  live: { rows: Record<string, unknown>[] }
) {
  if (live.rows.length) return live;
  if (!symbol) return live;
  const mock = tokenOf(contract, symbol);
  const rows = mock?.accounts[owner.trim().toLowerCase()];
  return rows?.length ? { rows } : live;
}

export function mergePositions(poolId: number, live: Record<string, unknown>[]) {
  if (live.length) return live;
  const mock = MOCK_TOKENS.find((t) => t.spec.poolId === poolId);
  return mock?.positions ?? live;
}

export function mergeBoard(live: BoardToken[]): BoardToken[] {
  const have = new Set(live.map((t) => t.id));
  const extra: BoardToken[] = MOCK_TOKENS.filter((t) => t.spec.launched && !have.has(t.key)).map((t) => ({
    id: t.key,
    program: t.spec.program,
    contract: t.spec.contract,
    symbol: t.spec.symbol,
    quoteSymbol: t.spec.quote.symbol,
    quoteContract: t.spec.quote.contract,
    poolId: t.spec.poolId,
    firstSeenAt: unixMs(t.spec.launchAt),
    mcapUsd: t.spec.mcapUsd,
    liqUsd: t.spec.liqUsd,
    backingUsd: t.spec.mcapUsd > 0 && t.spec.liqUsd > 0 ? Math.min(t.spec.liqUsd * 0.5, t.spec.mcapUsd) : 0,
    volumeUsd: t.spec.volumeUsd,
    holders: t.spec.holders.length,
  }));
  return extra.length ? [...live, ...extra] : live;
}

function asPost(
  contract: string,
  symbol: string,
  row: { id: number; author: string; body: string; at: string; giphyUrl?: string; authorScore?: number; upCount?: number; upEasy?: number },
  parentId: number | null,
  replyCount: number
): InsiderPost {
  return {
    id: row.id,
    contract,
    symbol,
    author: row.author,
    body: `${row.body} $${symbol}`,
    parentId,
    createdAt: unixMs(row.at),
    authorScore: row.authorScore ?? 0,
    giphyUrl: row.giphyUrl ?? "",
    replyCount,
    upCount: row.upCount ?? 0,
    upEasy: row.upEasy ?? 0,
  };
}

function allMockPosts(): InsiderPost[] {
  const out: InsiderPost[] = [];
  for (const t of MOCK_TOKENS) {
    for (const post of t.spec.posts) {
      out.push(asPost(t.spec.contract, t.spec.symbol, post, null, post.replies?.length ?? 0));
      for (const reply of post.replies ?? []) {
        out.push(asPost(t.spec.contract, t.spec.symbol, reply, post.id, 0));
      }
    }
  }
  return out;
}

export function mergeFeed(
  live: FeedResponse,
  contract: string,
  symbol: string,
  opts?: { parentId?: number; range?: FeedRange; global?: boolean }
): FeedResponse {
  const range: FeedRange = opts?.range ?? live.range ?? "day";
  const since = rangeSince(range);
  const parentId = opts?.parentId;
  const wantC = contract.trim().toLowerCase();
  const wantS = symbol.trim().toUpperCase();
  let extra = allMockPosts();
  if (!opts?.global) extra = extra.filter((p) => p.contract === wantC && p.symbol === wantS);
  if (parentId != null) extra = extra.filter((p) => p.parentId === parentId);
  else extra = extra.filter((p) => p.parentId == null && p.createdAt >= since);
  const have = new Set(live.posts.map((p) => p.id));
  const posts = extra.filter((p) => !have.has(p.id));
  if (!posts.length) return live;
  const activity = { ...live.activity };
  const upsEasy = { ...live.upsEasy };
  for (const p of posts) {
    activity[p.author] = (activity[p.author] ?? 0) + 1;
    if (p.upEasy) upsEasy[p.author] = (upsEasy[p.author] ?? 0) + p.upEasy;
  }
  const merged = parentId != null ? [...live.posts, ...posts].sort((a, b) => a.createdAt - b.createdAt) : [...posts, ...live.posts];
  return { posts: merged, activity, upsEasy, range };
}

export function mergeUsdPrice(contract: string, symbol: string, live: number): number {
  if (live > 0) return live;
  return tokenOf(contract, symbol)?.spec.priceUsd ?? 0;
}

export function mergeMarket(
  args: {
    poolId: number;
    tokenContract: string;
    tokenSymbol: string;
    quoteContract: string;
    quoteSymbol: string;
    supply: number;
  },
  live: AlcorMarketView | null
): AlcorMarketView | null {
  if (live) return live;
  const mock = MOCK_TOKENS.find((t) => t.spec.poolId === args.poolId) ?? tokenOf(args.tokenContract, args.tokenSymbol);
  if (!mock || mock.spec.poolId <= 0) return null;
  const spec = mock.spec;
  return {
    poolId: spec.poolId,
    priceQuote: spec.priceQuote,
    priceUsd: spec.priceUsd,
    change24: spec.change24,
    changeWeek: spec.changeWeek,
    volumeUsd24: spec.volumeUsd,
    volumeUsdWeek: spec.volumeUsd * 4,
    tvlUsd: spec.liqUsd,
    mcapUsd: spec.mcapUsd,
    fee: spec.fee,
    tokenQty: Number(spec.supply),
    quoteQty: spec.liqUsd > 0 && spec.priceUsd > 0 ? spec.liqUsd / Math.max(spec.priceUsd, 0.000001) : 0,
    firstSeenAt: unixMs(spec.launchAt),
    tokenIsA: true,
    points: spec.points.map((p) => ({ t: unixMs(p.at), price: p.price })),
    trades: spec.trades.map((tr) => ({
      t: unixMs(tr.at),
      price: tr.price,
      usd: tr.usd,
      side: tr.side,
      sender: tr.sender,
    })),
  };
}
