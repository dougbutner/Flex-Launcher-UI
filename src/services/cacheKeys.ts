export const CACHE_TTL_MS = 15_000;

export const CACHE_KEYS = {
  board: "board:tokens",
  rooms: "rooms:launches",
  rain: "rain:drylands",
  usd: "alcor:usd",
  mcaps: "mcaps:majors",
  proton: "proton:tokens",
  calendar: "calendar:events",
} as const;

export const SHARED_CACHE_KEYS = [
  CACHE_KEYS.board,
  CACHE_KEYS.rooms,
  CACHE_KEYS.rain,
  CACHE_KEYS.usd,
  CACHE_KEYS.mcaps,
  CACHE_KEYS.proton,
  CACHE_KEYS.calendar,
] as const;

export type SharedCacheKey = (typeof SHARED_CACHE_KEYS)[number];

export function isCacheFresh(refreshedAt: number, now = Date.now(), ttl = CACHE_TTL_MS): boolean {
  return refreshedAt > 0 && now - refreshedAt < ttl;
}

export function marketCacheKey(contract: string, symbol: string, poolId: number): string {
  return `market:${contract.trim().toLowerCase()}:${symbol.trim().toUpperCase()}:${poolId}`;
}

export function tokenCacheKey(contract: string, symbol: string): string {
  return `token:${contract.trim().toLowerCase()}:${symbol.trim().toUpperCase()}`;
}

export function bookCacheKey(contract: string, symbol: string): string {
  return `book:${contract.trim().toLowerCase()}:${symbol.trim().toUpperCase()}`;
}

export function marksCacheKey(contract: string, symbol: string): string {
  return `marks:${contract.trim().toLowerCase()}:${symbol.trim().toUpperCase()}`;
}

export function metricsCacheKey(contract: string, symbol: string, poolId: number): string {
  return `metrics:${contract.trim().toLowerCase()}:${symbol.trim().toUpperCase()}:${Math.max(0, poolId)}`;
}

export function canonCacheKey(raw: string): string | null {
  const key = raw.trim();
  if ((SHARED_CACHE_KEYS as readonly string[]).includes(key)) return key;
  const market = /^market:([a-z1-5.]{1,12}):([a-z]{1,7}):(\d{1,12})$/i.exec(key);
  if (market) return `market:${market[1].toLowerCase()}:${market[2].toUpperCase()}:${market[3]}`;
  const token = /^token:([a-z1-5.]{1,12}):([a-z]{1,7})$/i.exec(key);
  if (token) return `token:${token[1].toLowerCase()}:${token[2].toUpperCase()}`;
  const book = /^book:([a-z1-5.]{1,12}):([a-z]{1,7})$/i.exec(key);
  if (book) return `book:${book[1].toLowerCase()}:${book[2].toUpperCase()}`;
  const marks = /^marks:([a-z1-5.]{1,12}):([a-z]{1,7})$/i.exec(key);
  if (marks) return `marks:${marks[1].toLowerCase()}:${marks[2].toUpperCase()}`;
  const metrics = /^metrics:([a-z1-5.]{1,12}):([a-z]{1,7}):(\d{1,12})$/i.exec(key);
  if (metrics) return `metrics:${metrics[1].toLowerCase()}:${metrics[2].toUpperCase()}:${metrics[3]}`;
  return null;
}
