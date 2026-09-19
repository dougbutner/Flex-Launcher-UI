import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import { DatabaseSync } from "node:sqlite";
import type { Plugin } from "vite";
import {
  appendSymbolTag,
  BODY_USER_MAX,
  canTopLevelPost,
  parseFeedRange,
  rangeSince,
  validGiphyUrl,
  validTxId,
} from "./src/services/insidersRules";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract TEXT NOT NULL,
  symbol TEXT NOT NULL,
  author TEXT NOT NULL,
  parent_id INTEGER,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  author_score INTEGER NOT NULL DEFAULT 0,
  giphy_url TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_posts_room ON posts(contract, symbol, parent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_author_day ON posts(author, created_at);
CREATE TABLE IF NOT EXISTS tips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  from_account TEXT NOT NULL,
  amount TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tips_post ON tips(post_id);
CREATE TABLE IF NOT EXISTS ups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  from_account TEXT NOT NULL,
  to_account TEXT NOT NULL,
  amount_raw INTEGER NOT NULL,
  quantity TEXT NOT NULL,
  txid TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ups_post ON ups(post_id);
CREATE INDEX IF NOT EXISTS idx_ups_to_day ON ups(to_account, created_at);
CREATE TABLE IF NOT EXISTS captcha (
  id TEXT PRIMARY KEY,
  answer TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
`;

const COOLDOWN_MS = 12_000;
const CAPTCHA_TTL_MS = 10 * 60_000;
const RPC = "https://proton.greymass.com";
const QUOTE_CONTRACTS = new Set(["mon3y", "w3won", "gold.mon3y", "m3m3"]);

const POST_SELECT = `SELECT p.id, p.contract, p.symbol, p.author, p.body, p.parent_id AS parentId, p.created_at AS createdAt,
  p.author_score AS authorScore, p.giphy_url AS giphyUrl,
  (SELECT COUNT(*) FROM posts r WHERE r.parent_id = p.id) AS replyCount,
  (SELECT COUNT(*) FROM ups u WHERE u.post_id = p.id) AS upCount,
  (SELECT COALESCE(SUM(u.amount_raw), 0) FROM ups u WHERE u.post_id = p.id) AS upEasy
 FROM posts p`;

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, cap: number): Promise<string> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    n += buf.length;
    if (n > cap) throw new Error("Body too large.");
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function validAccount(name: string) {
  return /^[a-z1-5.]{1,12}$/.test(name) && !name.startsWith(".") && !name.endsWith(".");
}

function validSymbol(sym: string) {
  return /^[A-Z]{1,7}$/.test(sym);
}

function utcDayStart(ms: number) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function parseJson(raw: string): Record<string, unknown> {
  const v = JSON.parse(raw || "{}") as unknown;
  if (!v || typeof v !== "object") return {};
  return v as Record<string, unknown>;
}

function allowedRooms(env: Record<string, string>): Set<string> {
  return new Set(
    [
      env.VITE_EASYFLEX?.trim() || "3asy",
      env.VITE_COMPLEXFLEX?.trim() || "fl3x",
      env.VITE_FLEXFOREX_CONTRACT?.trim() || "for3x",
      ...QUOTE_CONTRACTS,
    ].map((s) => s.toLowerCase())
  );
}

function migrate(db: DatabaseSync) {
  db.exec(SCHEMA);
  const cols = db.prepare("PRAGMA table_info(posts)").all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("author_score")) db.exec("ALTER TABLE posts ADD COLUMN author_score INTEGER NOT NULL DEFAULT 0");
  if (!names.has("giphy_url")) db.exec("ALTER TABLE posts ADD COLUMN giphy_url TEXT NOT NULL DEFAULT ''");
}

function openDb(file: string): DatabaseSync {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  migrate(db);
  return db;
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
    if (row && String(row.owner ?? "").toLowerCase() === actor && assetAmount(String(row.balance ?? "")) > 0) {
      return true;
    }
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

function purgeCaptcha(db: DatabaseSync) {
  db.prepare("DELETE FROM captcha WHERE expires_at < ?").run(Date.now());
}

function handleCaptcha(db: DatabaseSync, res: ServerResponse) {
  purgeCaptcha(db);
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const id = randomBytes(12).toString("hex");
  db.prepare("INSERT INTO captcha (id, answer, expires_at) VALUES (?, ?, ?)").run(
    id,
    String(a + b),
    Date.now() + CAPTCHA_TTL_MS
  );
  send(res, 200, { id, prompt: `${a} + ${b}` });
}

function consumeCaptcha(db: DatabaseSync, id: string, answer: string): boolean {
  purgeCaptcha(db);
  const row = db.prepare("SELECT answer FROM captcha WHERE id = ?").get(id) as { answer?: string } | undefined;
  db.prepare("DELETE FROM captcha WHERE id = ?").run(id);
  return Boolean(row && String(row.answer) === String(answer).trim());
}

function activityMap(db: DatabaseSync, contract?: string, symbol?: string): Record<string, number> {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const rows = (
    contract && symbol
      ? db
          .prepare(
            "SELECT author, COUNT(*) AS n FROM posts WHERE contract = ? AND symbol = ? AND created_at >= ? GROUP BY author"
          )
          .all(contract, symbol, since)
      : db.prepare("SELECT author, COUNT(*) AS n FROM posts WHERE created_at >= ? GROUP BY author").all(since)
  ) as Array<{ author: string; n: number }>;
  const out: Record<string, number> = {};
  for (const row of rows) out[row.author] = Number(row.n) || 0;
  return out;
}

function upsEasyMap(db: DatabaseSync): Record<string, number> {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const rows = db
    .prepare("SELECT to_account AS a, SUM(amount_raw) AS n FROM ups WHERE created_at >= ? GROUP BY to_account")
    .all(since) as Array<{ a: string; n: number }>;
  const out: Record<string, number> = {};
  for (const row of rows) out[row.a] = Number(row.n) || 0;
  return out;
}

function handleFeed(db: DatabaseSync, url: URL, res: ServerResponse) {
  const contract = (url.searchParams.get("contract") || "").trim().toLowerCase();
  const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
  const parent = url.searchParams.get("parent");
  const range = parseFeedRange(url.searchParams.get("range"));
  const global = url.searchParams.get("global") === "1";
  if (!global && (!validAccount(contract) || !validSymbol(symbol))) {
    send(res, 400, { error: "Need contract and symbol." });
    return;
  }
  const parentId = parent != null && parent !== "" ? Number(parent) : null;
  const since = rangeSince(range);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const order = `ORDER BY (p.author_score + COALESCE((SELECT SUM(amount_raw) FROM ups u WHERE u.to_account = p.author AND u.created_at >= ?), 0)) DESC, p.created_at DESC LIMIT 80`;
  let rows: Record<string, unknown>[];
  if (parentId != null && Number.isFinite(parentId)) {
    rows = db
      .prepare(`${POST_SELECT} WHERE p.contract = ? AND p.symbol = ? AND p.parent_id = ? ORDER BY p.created_at ASC LIMIT 200`)
      .all(contract, symbol, parentId) as Record<string, unknown>[];
  } else if (global) {
    rows = db
      .prepare(`${POST_SELECT} WHERE p.parent_id IS NULL AND p.created_at >= ? ${order}`)
      .all(since, dayAgo) as Record<string, unknown>[];
  } else {
    rows = db
      .prepare(`${POST_SELECT} WHERE p.contract = ? AND p.symbol = ? AND p.parent_id IS NULL AND p.created_at >= ? ${order}`)
      .all(contract, symbol, since, dayAgo) as Record<string, unknown>[];
  }
  send(res, 200, {
    posts: rows,
    activity: global ? activityMap(db) : activityMap(db, contract, symbol),
    upsEasy: upsEasyMap(db),
    range,
  });
}

async function handlePost(
  db: DatabaseSync,
  allowed: Set<string>,
  body: Record<string, unknown>,
  res: ServerResponse
) {
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
  if (!allowed.has(contract) || !validAccount(contract) || !validSymbol(symbol) || !validAccount(author)) {
    send(res, 400, { error: "Unknown room or account." });
    return;
  }
  const userLen = rawText.trim().replace(/\s+\$[A-Z]{1,7}$/, "").length;
  if (!rawText.trim() || userLen > BODY_USER_MAX) {
    send(res, 400, { error: `Write 1-${BODY_USER_MAX} characters.` });
    return;
  }
  if (giphy && !validGiphyUrl(giphy)) {
    send(res, 400, { error: "GIF must be a Giphy https URL." });
    return;
  }
  if (!consumeCaptcha(db, captchaId, captchaAnswer)) {
    send(res, 400, { error: "Captcha failed. Try a new sum." });
    return;
  }
  try {
    const held = await isHolder(contract, symbol, author);
    if (!held) {
      send(res, 403, { error: "Holders only. Buy the token, then post." });
      return;
    }
  } catch (err) {
    send(res, 503, { error: err instanceof Error ? err.message : "Could not confirm holdings." });
    return;
  }
  const now = Date.now();
  const last = db.prepare("SELECT created_at FROM posts WHERE author = ? ORDER BY created_at DESC LIMIT 1").get(author) as
    | { created_at?: number }
    | undefined;
  if (last?.created_at && now - Number(last.created_at) < COOLDOWN_MS) {
    send(res, 429, { error: "Slow down a few seconds.", nextAt: Number(last.created_at) + COOLDOWN_MS });
    return;
  }
  if (parentId != null) {
    if (!Number.isFinite(parentId)) {
      send(res, 400, { error: "Bad parent post." });
      return;
    }
    const parent = db.prepare("SELECT id FROM posts WHERE id = ? AND contract = ? AND symbol = ?").get(parentId, contract, symbol);
    if (!parent) {
      send(res, 404, { error: "Parent post is gone." });
      return;
    }
  } else {
    const day = utcDayStart(now);
    const used = db
      .prepare("SELECT COUNT(*) AS n FROM posts WHERE author = ? AND parent_id IS NULL AND created_at >= ?")
      .get(author, day) as { n?: number };
    if (!canTopLevelPost(Number(used?.n))) {
      send(res, 429, { error: "One post per UTC day. Replies stay open." });
      return;
    }
  }
  const text = appendSymbolTag(rawText, symbol);
  const info = db
    .prepare(
      "INSERT INTO posts (contract, symbol, author, parent_id, body, created_at, author_score, giphy_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(contract, symbol, author, parentId, text, now, authorScore, giphy);
  send(res, 200, { id: Number(info.lastInsertRowid), createdAt: now, authorScore });
}

function handleUp(db: DatabaseSync, body: Record<string, unknown>, res: ServerResponse) {
  const postId = Number(body.postId);
  const from = String(body.from ?? body.actor ?? "").trim().toLowerCase();
  const txid = String(body.txid ?? "").trim().toLowerCase();
  const amountRaw = Math.floor(Number(body.amountRaw ?? body.amount));
  const quantity = String(body.quantity ?? "").trim();
  if (!Number.isFinite(postId) || !validAccount(from) || !validTxId(txid) || !(amountRaw > 0) || amountRaw > 10_000) {
    send(res, 400, { error: "Need post, account, whole EASY, and tx hash." });
    return;
  }
  const post = db.prepare("SELECT id, author FROM posts WHERE id = ?").get(postId) as { id: number; author: string } | undefined;
  if (!post) {
    send(res, 404, { error: "Post is gone." });
    return;
  }
  if (post.author === from) {
    send(res, 400, { error: "Cannot UP your own post." });
    return;
  }
  const qty = quantity || `${amountRaw}.000000 EASY`;
  try {
    db.prepare(
      "INSERT INTO ups (post_id, from_account, to_account, amount_raw, quantity, txid, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(postId, from, post.author, amountRaw, qty.slice(0, 40), txid, Date.now());
  } catch {
    send(res, 409, { error: "That tx was already recorded." });
    return;
  }
  send(res, 200, { ok: true, txid });
}

export function insidersDbPlugin(env: Record<string, string>): Plugin {
  const file = path.resolve(process.cwd(), env.INSIDERS_SQLITE?.trim() || "data/insiders.sqlite");
  const allowed = allowedRooms(env);
  let db: DatabaseSync | null = null;

  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (!url.pathname.startsWith("/api/insiders")) {
      next();
      return;
    }
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    db ??= openDb(file);
    if (req.method === "GET" && url.pathname === "/api/insiders/captcha") {
      handleCaptcha(db, res);
      return;
    }
    if (req.method === "GET" && (url.pathname === "/api/insiders/feed" || url.pathname === "/api/insiders")) {
      handleFeed(db, url, res);
      return;
    }
    if (req.method === "POST" && (url.pathname === "/api/insiders/post" || url.pathname === "/api/insiders")) {
      void readBody(req, 8_000)
        .then((text) => handlePost(db as DatabaseSync, allowed, parseJson(text), res))
        .catch((err) => send(res, 400, { error: err instanceof Error ? err.message : String(err) }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/insiders/up") {
      void readBody(req, 4_000)
        .then((text) => handleUp(db as DatabaseSync, parseJson(text), res))
        .catch((err) => send(res, 400, { error: err instanceof Error ? err.message : String(err) }));
      return;
    }
    send(res, 404, { error: "Unknown insiders route." });
  };

  return {
    name: "insiders-db",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
