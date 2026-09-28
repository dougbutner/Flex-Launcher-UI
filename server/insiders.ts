import {
  appendSymbolTag,
  BODY_USER_MAX,
  canTopLevelPost,
  parseFeedRange,
  rangeSince,
  utcDayStart,
  validGiphyUrl,
  validTxId,
} from "../src/services/insidersRules";
import { validAccount, validSymbol } from "./accounts";
import type { Env, Sql } from "./db";

const COOLDOWN_MS = 12_000;
const CAPTCHA_TTL_MS = 10 * 60_000;
const RPC = "https://proton.greymass.com";
const QUOTE_CONTRACTS = ["mon3y", "w3won", "gold.mon3y", "m3m3"];

const POST_SELECT = `SELECT p.id, p.contract, p.symbol, p.author, p.body, p.parent_id AS parentId, p.created_at AS createdAt,
  p.author_score AS authorScore, p.giphy_url AS giphyUrl,
  (SELECT COUNT(*) FROM posts r WHERE r.parent_id = p.id) AS replyCount,
  (SELECT COUNT(*) FROM ups u WHERE u.post_id = p.id) AS upCount,
  (SELECT COALESCE(SUM(u.amount_raw), 0) FROM ups u WHERE u.post_id = p.id) AS upEasy
 FROM posts p`;

export function allowedRooms(env: Env): Set<string> {
  return new Set(
    [
      env.VITE_EASYFLEX?.trim() || "3asy",
      env.VITE_COMPLEXFLEX?.trim() || "fl3x",
      env.VITE_FLEXFOREX_CONTRACT?.trim() || "for3x",
      ...QUOTE_CONTRACTS,
    ].map((s) => s.toLowerCase())
  );
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function assetAmount(value: string): number {
  const m = value.trim().match(/^(-?\d+)(?:\.(\d+))?\s+[A-Z]{1,7}$/);
  if (!m) return 0;
  return Number(m[2] != null ? `${m[1]}.${m[2]}` : m[1]);
}

async function rpcJson(pathName: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${RPC}${pathName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error("Chain read failed.");
  return res.json();
}

async function isHolder(contract: string, symbol: string, actor: string): Promise<boolean> {
  try {
    const data = (await rpcJson("/v1/chain/get_table_rows", {
      json: true,
      code: contract,
      scope: symbol,
      table: "flexers",
      lower_bound: actor,
      upper_bound: actor,
      limit: 1,
    })) as { rows?: Array<{ owner?: string; balance?: string }> };
    const row = data.rows?.[0];
    if (row && String(row.owner ?? "").toLowerCase() === actor && assetAmount(String(row.balance ?? "")) > 0) return true;
  } catch {
    /* quote tokens have no flexers */
  }
  const bals = (await rpcJson("/v1/chain/get_currency_balance", {
    code: contract,
    account: actor,
    symbol,
  })) as string[] | { error?: unknown };
  if (!Array.isArray(bals)) return false;
  return bals.some((row) => assetAmount(String(row)) > 0 && String(row).toUpperCase().includes(symbol));
}

async function purgeCaptcha(q: Sql) {
  await q.run("DELETE FROM captcha WHERE expires_at < ?", [Date.now()]);
}

export async function handleCaptcha(q: Sql) {
  await purgeCaptcha(q);
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const id = randomId();
  await q.run("INSERT INTO captcha (id, answer, expires_at) VALUES (?, ?, ?)", [id, String(a + b), Date.now() + CAPTCHA_TTL_MS]);
  return { status: 200, body: { id, prompt: `${a} + ${b}` } };
}

async function consumeCaptcha(q: Sql, id: string, answer: string): Promise<boolean> {
  await purgeCaptcha(q);
  const row = await q.get<{ answer?: string }>("SELECT answer FROM captcha WHERE id = ?", [id]);
  await q.run("DELETE FROM captcha WHERE id = ?", [id]);
  return Boolean(row && String(row.answer) === String(answer).trim());
}

async function activityMap(q: Sql, contract?: string, symbol?: string): Promise<Record<string, number>> {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const rows =
    contract && symbol
      ? await q.all<{ author: string; n: number }>(
          "SELECT author, COUNT(*) AS n FROM posts WHERE contract = ? AND symbol = ? AND created_at >= ? GROUP BY author",
          [contract, symbol, since]
        )
      : await q.all<{ author: string; n: number }>("SELECT author, COUNT(*) AS n FROM posts WHERE created_at >= ? GROUP BY author", [
          since,
        ]);
  const out: Record<string, number> = {};
  for (const row of rows) out[row.author] = Number(row.n) || 0;
  return out;
}

async function upsEasyMap(q: Sql): Promise<Record<string, number>> {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const rows = await q.all<{ a: string; n: number }>(
    "SELECT to_account AS a, SUM(amount_raw) AS n FROM ups WHERE created_at >= ? GROUP BY to_account",
    [since]
  );
  const out: Record<string, number> = {};
  for (const row of rows) out[row.a] = Number(row.n) || 0;
  return out;
}

export async function handleFeed(q: Sql, url: URL) {
  const contract = (url.searchParams.get("contract") || "").trim().toLowerCase();
  const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
  const parent = url.searchParams.get("parent");
  const range = parseFeedRange(url.searchParams.get("range"));
  const global = url.searchParams.get("global") === "1";
  if (!global && (!validAccount(contract) || !validSymbol(symbol))) {
    return { status: 400, body: { error: "Need contract and symbol." } };
  }
  const parentId = parent != null && parent !== "" ? Number(parent) : null;
  const since = rangeSince(range);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const order = `ORDER BY (p.author_score + COALESCE((SELECT SUM(amount_raw) FROM ups u WHERE u.to_account = p.author AND u.created_at >= ?), 0)) DESC, p.created_at DESC LIMIT 80`;
  let rows: Record<string, unknown>[];
  if (parentId != null && Number.isFinite(parentId)) {
    rows = await q.all(`${POST_SELECT} WHERE p.contract = ? AND p.symbol = ? AND p.parent_id = ? ORDER BY p.created_at ASC LIMIT 200`, [
      contract,
      symbol,
      parentId,
    ]);
  } else if (global) {
    rows = await q.all(`${POST_SELECT} WHERE p.parent_id IS NULL AND p.created_at >= ? ${order}`, [since, dayAgo]);
  } else {
    rows = await q.all(`${POST_SELECT} WHERE p.contract = ? AND p.symbol = ? AND p.parent_id IS NULL AND p.created_at >= ? ${order}`, [
      contract,
      symbol,
      since,
      dayAgo,
    ]);
  }
  return {
    status: 200,
    body: {
      posts: rows,
      activity: global ? await activityMap(q) : await activityMap(q, contract, symbol),
      upsEasy: await upsEasyMap(q),
      range,
    },
  };
}

export async function handlePost(q: Sql, env: Env, body: Record<string, unknown>) {
  const contract = String(body.contract ?? "").trim().toLowerCase();
  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  const author = String(body.actor ?? "").trim().toLowerCase();
  const rawText = String(body.body ?? "");
  const captchaId = String(body.captchaId ?? "").trim();
  const captchaAnswer = String(body.captchaAnswer ?? "").trim();
  const giphy = String(body.giphyUrl ?? "").trim();
  const scoreIn = Number(body.authorScore);
  const authorScore = Number.isFinite(scoreIn) ? Math.max(0, Math.min(100, Math.round(scoreIn))) : 0;
  const parentRaw = body.parentId;
  const parentId = parentRaw == null || parentRaw === "" ? null : Number(parentRaw);
  if (!allowedRooms(env).has(contract) || !validAccount(contract) || !validSymbol(symbol) || !validAccount(author)) {
    return { status: 400, body: { error: "Unknown room or account." } };
  }
  const userLen = rawText.trim().replace(/\s+\$[A-Z]{1,7}$/, "").length;
  if (!rawText.trim() || userLen > BODY_USER_MAX) {
    return { status: 400, body: { error: `Write 1-${BODY_USER_MAX} characters.` } };
  }
  if (giphy && !validGiphyUrl(giphy)) return { status: 400, body: { error: "GIF must be a Giphy https URL." } };
  if (!(await consumeCaptcha(q, captchaId, captchaAnswer))) {
    return { status: 400, body: { error: "Captcha failed. Try a new sum." } };
  }
  try {
    const held = await isHolder(contract, symbol, author);
    if (!held) return { status: 403, body: { error: "Holders only. Buy the token, then post." } };
  } catch (err) {
    return { status: 503, body: { error: err instanceof Error ? err.message : "Could not confirm holdings." } };
  }
  const now = Date.now();
  const last = await q.get<{ created_at?: number }>("SELECT created_at FROM posts WHERE author = ? ORDER BY created_at DESC LIMIT 1", [
    author,
  ]);
  if (last?.created_at && now - Number(last.created_at) < COOLDOWN_MS) {
    return { status: 429, body: { error: "Slow down a few seconds.", nextAt: Number(last.created_at) + COOLDOWN_MS } };
  }
  if (parentId != null) {
    if (!Number.isFinite(parentId)) return { status: 400, body: { error: "Bad parent post." } };
    const parent = await q.get("SELECT id FROM posts WHERE id = ? AND contract = ? AND symbol = ?", [parentId, contract, symbol]);
    if (!parent) return { status: 404, body: { error: "Parent post is gone." } };
  } else {
    const day = utcDayStart(now);
    const used = await q.get<{ n?: number }>(
      "SELECT COUNT(*) AS n FROM posts WHERE author = ? AND parent_id IS NULL AND created_at >= ?",
      [author, day]
    );
    if (!canTopLevelPost(Number(used?.n))) return { status: 429, body: { error: "One post per UTC day. Replies stay open." } };
  }
  const text = appendSymbolTag(rawText, symbol);
  const info = await q.run(
    "INSERT INTO posts (contract, symbol, author, parent_id, body, created_at, author_score, giphy_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [contract, symbol, author, parentId, text, now, authorScore, giphy]
  );
  return { status: 200, body: { id: info.insertId, createdAt: now, authorScore } };
}

export async function handleUp(q: Sql, body: Record<string, unknown>) {
  const postId = Number(body.postId);
  const from = String(body.from ?? body.actor ?? "").trim().toLowerCase();
  const txid = String(body.txid ?? "").trim().toLowerCase();
  const amountRaw = Math.floor(Number(body.amountRaw ?? body.amount));
  const quantity = String(body.quantity ?? "").trim();
  if (!Number.isFinite(postId) || !validAccount(from) || !validTxId(txid) || !(amountRaw > 0) || amountRaw > 10_000) {
    return { status: 400, body: { error: "Need post, account, whole EASY, and tx hash." } };
  }
  const post = await q.get<{ id: number; author: string }>("SELECT id, author FROM posts WHERE id = ?", [postId]);
  if (!post) return { status: 404, body: { error: "Post is gone." } };
  if (post.author === from) return { status: 400, body: { error: "Cannot UP your own post." } };
  const qty = quantity || `${amountRaw}.000000 EASY`;
  try {
    await q.run(
      "INSERT INTO ups (post_id, from_account, to_account, amount_raw, quantity, txid, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [postId, from, post.author, amountRaw, qty.slice(0, 40), txid, Date.now()]
    );
  } catch {
    return { status: 409, body: { error: "That tx was already recorded." } };
  }
  return { status: 200, body: { ok: true, txid } };
}
