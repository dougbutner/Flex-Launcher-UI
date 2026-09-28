import { canonCacheKey, isCacheFresh } from "../src/services/cacheKeys";
import { DbConfigError, withDb, type Env, type Sql } from "./db";

const LOCK_MS = 60_000;
const MAX_PAYLOAD = 3_000_000;

type MemRow = { data: unknown; refreshedAt: number };
const mem = new Map<string, MemRow>();

export type RefreshFn = (key: string) => Promise<unknown>;

type CacheRow = { payload?: unknown; refreshed_at?: unknown; refresh_lock?: unknown };

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parsePayload(raw: unknown): unknown {
  if (raw == null) return null;
  const text = typeof raw === "string" ? raw : String(raw);
  if (!text || text === "null") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function memGet(key: string, now: number): MemRow | null {
  const hit = mem.get(key);
  if (!hit || !isCacheFresh(hit.refreshedAt, now)) return null;
  return hit;
}

export function clearCacheMemory() {
  mem.clear();
}

async function readRow(q: Sql, key: string): Promise<{ data: unknown; refreshedAt: number; lock: number } | null> {
  const row = await q.get<CacheRow>("SELECT payload, refreshed_at, refresh_lock FROM cache_entries WHERE cache_key = ?", [key]);
  if (!row) return null;
  return { data: parsePayload(row.payload), refreshedAt: num(row.refreshed_at), lock: num(row.refresh_lock) };
}

async function claim(q: Sql, key: string, now: number, force: boolean): Promise<number | null> {
  const lockUntil = now + LOCK_MS;
  const existing = await readRow(q, key);
  if (!existing) {
    const ins = await q.run(
      "INSERT IGNORE INTO cache_entries (cache_key, payload, refreshed_at, refresh_lock) VALUES (?, 'null', 0, ?)",
      [key, lockUntil]
    );
    return ins.affectedRows === 1 ? lockUntil : null;
  }
  const upd = await q.run(
    "UPDATE cache_entries SET refresh_lock = ? WHERE cache_key = ? AND (refresh_lock < ? OR ? = 1)",
    [lockUntil, key, now, force ? 1 : 0]
  );
  return upd.affectedRows === 1 ? lockUntil : null;
}

async function save(q: Sql, key: string, data: unknown, startedAt: number, lockUntil: number) {
  const payload = JSON.stringify(data ?? null);
  if (payload.length > MAX_PAYLOAD) throw new Error("Snapshot is too large.");
  const writtenAt = Date.now();
  const res = await q.run(
    `UPDATE cache_entries
     SET payload = ?, refreshed_at = ?, refresh_lock = 0
     WHERE cache_key = ? AND refresh_lock = ? AND refreshed_at <= ?`,
    [payload, writtenAt, key, lockUntil, startedAt]
  );
  if (res.affectedRows === 1) mem.set(key, { data, refreshedAt: writtenAt });
}

export async function readCached(env: Env, rawKey: string, force: boolean, refresh: RefreshFn) {
  const key = canonCacheKey(rawKey);
  if (!key) return { status: 400, body: { error: "Unknown cache key." } };
  const now = Date.now();
  if (!force) {
    const hit = memGet(key, now);
    if (hit) return { status: 200, body: { fresh: true, data: hit.data, refreshedAt: hit.refreshedAt, db: true } };
  }
  try {
    return await withDb(env, async (q) => {
      const row = await readRow(q, key);
      if (!force && row && isCacheFresh(row.refreshedAt, now)) {
        mem.set(key, { data: row.data, refreshedAt: row.refreshedAt });
        return { status: 200, body: { fresh: true, data: row.data, refreshedAt: row.refreshedAt, db: true } };
      }
      if (!force && row && row.lock > now && row.refreshedAt > 0) {
        return { status: 200, body: { fresh: false, locked: true, data: row.data, refreshedAt: row.refreshedAt, db: true } };
      }
      let lockUntil = await claim(q, key, now, force);
      if (lockUntil == null) {
        const again = await readRow(q, key);
        if (!force && again && again.refreshedAt > 0) {
          return {
            status: 200,
            body: { fresh: isCacheFresh(again.refreshedAt, Date.now()), locked: true, data: again.data, refreshedAt: again.refreshedAt, db: true },
          };
        }
        lockUntil = await claim(q, key, Date.now(), force);
      }
      if (lockUntil == null) {
        const held = await readRow(q, key);
        if (held && held.refreshedAt > 0) {
          return { status: 200, body: { fresh: false, locked: true, data: held.data, refreshedAt: held.refreshedAt, db: true } };
        }
        return { status: 503, body: { error: "Snapshot refresh is already running.", db: true } };
      }
      const startedAt = Date.now();
      try {
        const data = await refresh(key);
        await save(q, key, data, startedAt, lockUntil);
        return { status: 200, body: { fresh: true, data, refreshedAt: startedAt, db: true } };
      } catch (err) {
        await q.run("UPDATE cache_entries SET refresh_lock = 0 WHERE cache_key = ? AND refresh_lock = ?", [key, lockUntil]);
        const message = err instanceof Error ? err.message : "Snapshot refresh failed.";
        if (row && row.refreshedAt > 0) {
          return { status: 200, body: { fresh: false, data: row.data, refreshedAt: row.refreshedAt, error: message, db: true } };
        }
        return { status: 503, body: { error: message, db: true } };
      }
    });
  } catch (err) {
    if (err instanceof DbConfigError) return { status: 200, body: { db: false, live: false } };
    const message = err instanceof Error ? err.message : "MySQL read failed.";
    return { status: 503, body: { error: message, db: true } };
  }
}

export async function clearCached(env: Env) {
  clearCacheMemory();
  await withDb(env, async (q) => {
    await q.run("DELETE FROM cache_entries");
  });
}
