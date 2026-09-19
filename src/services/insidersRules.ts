export const BODY_USER_MAX = 480;
export const BODY_STORED_MAX = 500;
export const UP_IDLE_MS = 3000;
export const UP_MAX_STEP = 10;
export const GLOBAL_FEED_TOP = 10;

export type FeedRange = "day" | "week" | "month" | "year" | "all";

export function utcDayStart(ms: number) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function rangeSince(range: FeedRange, now = Date.now()) {
  if (range === "all") return 0;
  if (range === "day") return utcDayStart(now);
  if (range === "week") return now - 7 * 86_400_000;
  if (range === "month") return now - 30 * 86_400_000;
  return now - 365 * 86_400_000;
}

export function parseFeedRange(raw: string | null | undefined): FeedRange {
  const v = String(raw ?? "day").trim().toLowerCase();
  if (v === "week" || v === "month" || v === "year" || v === "all") return v;
  return "day";
}

/** Strip a trailing $SYMBOL the client may have typed, cap user text, append ` $SYMBOL`. */
export function appendSymbolTag(text: string, symbol: string): string {
  const code = symbol.trim().toUpperCase().slice(0, 7);
  const tag = ` $${code}`;
  const raw = text.trim().replace(/\s+\$[A-Z]{1,7}$/, "");
  const user = raw.slice(0, BODY_USER_MAX);
  const out = `${user}${tag}`;
  return out.length <= BODY_STORED_MAX ? out : out.slice(0, BODY_STORED_MAX);
}

/** 1-based click in the current idle batch: 1-3 add 1, next 10 clicks add 5, then 10. */
export function upDeltaForClick(clickIndex: number): number {
  if (!Number.isFinite(clickIndex) || clickIndex < 1) return 0;
  if (clickIndex <= 3) return 1;
  if (clickIndex <= 13) return 5;
  return UP_MAX_STEP;
}

export function easyQuantity(whole: number): string {
  const n = Math.max(1, Math.floor(Number.isFinite(whole) ? whole : 0));
  return `${n}.000000 EASY`;
}

export function validGiphyUrl(url: string) {
  if (!url || url.length > 500) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host === "giphy.com" ||
      host === "i.giphy.com" ||
      host === "media.giphy.com" ||
      /^media\d+\.giphy\.com$/.test(host)
    );
  } catch {
    return false;
  }
}

export function validTxId(id: string) {
  return /^[0-9a-fA-F]{64}$/.test(id.trim());
}

/** Snapshot score plus 24h EASY received as UP, capped at 100. */
export function effectiveAuthorScore(stored: number, upsEasy24h: number) {
  const s = Number.isFinite(stored) ? stored : 0;
  const u = Number.isFinite(upsEasy24h) ? Math.max(0, upsEasy24h) : 0;
  return Math.max(0, Math.min(100, Math.round(s + u)));
}

export function splitFeatured<T>(rows: T[], n = GLOBAL_FEED_TOP) {
  const cap = Number.isFinite(n) && n > 0 ? Math.floor(n) : GLOBAL_FEED_TOP;
  return { featured: rows.slice(0, cap), rest: rows.slice(cap) };
}

/** One top-level post per UTC day. Replies do not consume this. */
export function canTopLevelPost(existingToday: number) {
  return !(Number(existingToday) > 0);
}
