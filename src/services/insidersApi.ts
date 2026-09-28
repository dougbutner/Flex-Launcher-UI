import type { FeedRange } from "@/services/insidersRules";
import { loadSiteSandbox, siteSandboxFlag } from "@/services/siteSandbox";

export type InsiderPost = {
  id: number;
  contract: string;
  symbol: string;
  author: string;
  body: string;
  parentId: number | null;
  createdAt: number;
  authorScore: number;
  giphyUrl: string;
  replyCount: number;
  upCount: number;
  upEasy: number;
};

export type FeedResponse = {
  posts: InsiderPost[];
  activity: Record<string, number>;
  upsEasy: Record<string, number>;
  range: FeedRange;
};

function clubError(message: string | undefined, fallback: string) {
  const text = (message || "").trim();
  if (!text || /mysql|MYSQL_|not configured/i.test(text)) return fallback;
  return text;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || res.statusText };
  }
}

function asPost(raw: unknown): InsiderPost | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = Number(o.id);
  const author = String(o.author ?? "").toLowerCase();
  const body = String(o.body ?? "");
  const createdAt = Number(o.createdAt ?? o.created_at ?? 0);
  if (!Number.isFinite(id) || !author || !body) return null;
  const parentRaw = o.parentId ?? o.parent_id;
  return {
    id,
    author,
    body,
    parentId: parentRaw == null ? null : Number(parentRaw),
    contract: String(o.contract ?? "").toLowerCase(),
    symbol: String(o.symbol ?? "").toUpperCase(),
    createdAt,
    authorScore: Number(o.authorScore ?? o.author_score ?? 0) || 0,
    giphyUrl: String(o.giphyUrl ?? o.giphy_url ?? ""),
    replyCount: Number(o.replyCount ?? o.reply_count ?? 0) || 0,
    upCount: Number(o.upCount ?? o.up_count ?? 0) || 0,
    upEasy: Number(o.upEasy ?? o.up_easy ?? 0) || 0,
  };
}

export async function fetchCaptcha(): Promise<{ id: string; prompt: string }> {
  const res = await fetch("/api/insiders/captcha");
  const body = (await readJson(res)) as { id?: string; prompt?: string; error?: string };
  if (!res.ok || !body.id || !body.prompt) throw new Error(clubError(body.error, "Captcha failed to load."));
  return { id: body.id, prompt: body.prompt };
}

export async function fetchFeed(
  contract: string,
  symbol: string,
  opts?: { parentId?: number; range?: FeedRange; global?: boolean }
): Promise<FeedResponse> {
  const q = new URLSearchParams({ range: opts?.range ?? "day" });
  if (opts?.global) q.set("global", "1");
  else {
    q.set("contract", contract);
    q.set("symbol", symbol);
  }
  if (opts?.parentId != null) q.set("parent", String(opts.parentId));
  const empty: FeedResponse = {
    posts: [],
    activity: {},
    upsEasy: {},
    range: opts?.range ?? "day",
  };
  try {
    const res = await fetch(`/api/insiders/feed?${q}`);
    const body = (await readJson(res)) as {
      posts?: unknown[];
      activity?: Record<string, number>;
      upsEasy?: Record<string, number>;
      range?: FeedRange;
      error?: string;
    };
    if (!res.ok) throw new Error(clubError(body.error, "Feed is unavailable."));
    const posts = (Array.isArray(body.posts) ? body.posts : []).map(asPost).filter((p): p is InsiderPost => Boolean(p));
    empty.posts = posts;
    empty.activity = body.activity && typeof body.activity === "object" ? body.activity : {};
    empty.upsEasy = body.upsEasy && typeof body.upsEasy === "object" ? body.upsEasy : {};
    empty.range =
      body.range === "week" || body.range === "month" || body.range === "year" || body.range === "all" ? body.range : "day";
  } catch (err) {
    if (!siteSandboxFlag()) throw err;
  }
  if (!siteSandboxFlag()) return empty;
  const overlay = await loadSiteSandbox();
  return overlay ? overlay.mergeFeed(empty, contract, symbol, opts) : empty;
}

export async function createPost(input: {
  contract: string;
  symbol: string;
  actor: string;
  body: string;
  captchaId: string;
  captchaAnswer: string;
  parentId?: number | null;
  giphyUrl?: string;
  authorScore?: number;
}): Promise<{ id: number }> {
  const res = await fetch("/api/insiders/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await readJson(res)) as { id?: number; error?: string };
  if (!res.ok) throw new Error(clubError(body.error, "Could not post."));
  return { id: Number(body.id) };
}

export async function recordUp(input: {
  postId: number;
  from: string;
  amountRaw: number;
  quantity: string;
  txid: string;
}): Promise<void> {
  const res = await fetch("/api/insiders/up", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await readJson(res)) as { error?: string };
  if (!res.ok) throw new Error(clubError(body.error, "Could not record the UP."));
}
