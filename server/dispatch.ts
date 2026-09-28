import { flexContracts, validAccount, validSymbol } from "./accounts";
import { clearCached, readCached, type RefreshFn } from "./cacheStore";
import { DbConfigError, withDb, type Env } from "./db";
import { handleCaptcha, handleFeed, handlePost, handleUp } from "./insiders";
import { listManager, putManager } from "./manager";

export type ApiResult = { status: number; body: unknown };
export type { RefreshFn };

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  return body as Record<string, unknown>;
}

function adminAccount(body: unknown, env: Env): string | null {
  const account = String(asRecord(body).account ?? "").trim().toLowerCase();
  if (!flexContracts(env).has(account)) return null;
  return account;
}

async function readSite(env: Env): Promise<ApiResult> {
  return withDb(env, async (q) => {
    const row = await q.get<{ live?: number; updated_at?: number; updated_by?: string }>(
      "SELECT live, updated_at, updated_by FROM site_settings WHERE id = 1"
    );
    if (!row) {
      await q.run("INSERT INTO site_settings (id, live, updated_at, updated_by) VALUES (1, 0, 0, '')");
      return { status: 200, body: { live: false, db: true, updatedAt: 0, updatedBy: "" } };
    }
    return {
      status: 200,
      body: {
        live: Number(row.live) === 1,
        db: true,
        updatedAt: Number(row.updated_at || 0),
        updatedBy: String(row.updated_by || ""),
      },
    };
  });
}

async function setLive(env: Env, raw: unknown): Promise<ApiResult> {
  const account = adminAccount(raw, env);
  if (!account) return { status: 403, body: { error: "Connect as 3asy, fl3x, or for3x." } };
  const live = Boolean(asRecord(raw).live);
  const now = Date.now();
  await withDb(env, (q) =>
    q.run(
      `INSERT INTO site_settings (id, live, updated_at, updated_by) VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE live = VALUES(live), updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
      [live ? 1 : 0, now, account]
    )
  );
  return { status: 200, body: { live, db: true, updatedAt: now, updatedBy: account } };
}

async function writeTx(env: Env, raw: unknown): Promise<ApiResult> {
  const o = asRecord(raw);
  const txId = String(o.txId ?? "").trim().toLowerCase();
  const actor = String(o.actor ?? "").trim().toLowerCase();
  const contract = String(o.contract ?? "").trim().toLowerCase();
  const action = String(o.action ?? "").trim().toLowerCase().slice(0, 13);
  let symbol = String(o.symbol ?? "").trim().toUpperCase();
  if (symbol.includes(",")) symbol = symbol.split(",").pop() || "";
  symbol = symbol.replace(/[^A-Z]/g, "").slice(0, 7);
  if (!/^[0-9a-f]{64}$/.test(txId)) return { status: 400, body: { error: "Need a 64 char tx id." } };
  if (!validAccount(actor)) return { status: 400, body: { error: "Bad actor." } };
  if (contract && !validAccount(contract)) return { status: 400, body: { error: "Bad contract." } };
  if (symbol && !validSymbol(symbol)) symbol = "";
  const actions = Array.isArray(o.actions) ? o.actions : [];
  const json = JSON.stringify(actions).slice(0, 20_000);
  await withDb(env, (q) =>
    q.run(
      `INSERT INTO chain_txs (tx_id, actor, contract, action_name, symbol, actions_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE tx_id = tx_id`,
      [txId, actor, contract, action, symbol, json, Date.now()]
    )
  );
  return { status: 200, body: { stored: true, txId } };
}

async function routeInsiders(env: Env, method: string, path: string, url: URL, body: unknown): Promise<ApiResult> {
  return withDb(env, async (q) => {
    if (method === "GET" && path === "/api/insiders/captcha") return handleCaptcha(q);
    if (method === "GET" && (path === "/api/insiders/feed" || path === "/api/insiders")) return handleFeed(q, url);
    if (method === "POST" && (path === "/api/insiders/post" || path === "/api/insiders")) return handlePost(q, env, asRecord(body));
    if (method === "POST" && path === "/api/insiders/up") return handleUp(q, asRecord(body));
    return { status: 404, body: { error: "Unknown insiders route." } };
  });
}

export async function dispatch(request: Request, env: Env, refresh: RefreshFn): Promise<ApiResult> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "OPTIONS") return { status: 204, body: {} };
  let body: unknown = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const text = await request.text();
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        return { status: 400, body: { error: "Invalid JSON." } };
      }
    }
  }
  try {
    if (path === "/api/site" && request.method === "GET") return await readSite(env);
    if (path === "/api/cache" && request.method === "GET") {
      return readCached(env, url.searchParams.get("key") || "", url.searchParams.get("force") === "1", refresh);
    }
    if (path === "/api/txs" && request.method === "POST") return await writeTx(env, body);
    if (path === "/api/admin/live" && request.method === "POST") return await setLive(env, body);
    if (path === "/api/admin/rebuild" && request.method === "POST") {
      const account = adminAccount(body, env);
      if (!account) return { status: 403, body: { error: "Connect as 3asy, fl3x, or for3x." } };
      await clearCached(env);
      return { status: 200, body: { cleared: true } };
    }
    if (path === "/api/manager" && request.method === "GET") return await withDb(env, (q) => listManager(q, url));
    if (path === "/api/manager" && (request.method === "PUT" || request.method === "POST")) {
      return await withDb(env, (q) => putManager(q, env, body));
    }
    if (path.startsWith("/api/insiders")) return await routeInsiders(env, request.method, path, url, body);
    return { status: 404, body: { error: "Unknown route." } };
  } catch (err) {
    if (err instanceof DbConfigError) {
      if (path === "/api/site" || path === "/api/cache") return { status: 200, body: { live: false, db: false } };
      if (path === "/api/txs") return { status: 200, body: { stored: false, db: false } };
      return { status: 503, body: { error: err.message, db: false } };
    }
    const message = err instanceof Error ? err.message : "Request failed.";
    return { status: 500, body: { error: message } };
  }
}
