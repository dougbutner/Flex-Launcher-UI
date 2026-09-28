import { canonCacheKey } from "@/services/cacheKeys";
import { siteSandboxFlag } from "@/services/siteSandbox";

export type SiteStatus = {
  live: boolean;
  db: boolean;
  updatedAt?: number;
  updatedBy?: string;
};

type CacheBody<T> = {
  data?: T;
  error?: string;
  db?: boolean;
  fresh?: boolean;
};

let sitePromise: Promise<SiteStatus> | null = null;
let siteAt = 0;
const inflight = new Map<string, Promise<unknown>>();

export function invalidateSiteStatus() {
  sitePromise = null;
  siteAt = 0;
}

export async function siteStatus(force = false): Promise<SiteStatus> {
  const now = Date.now();
  if (!force && sitePromise && now - siteAt < 15_000) return sitePromise;
  siteAt = now;
  sitePromise = fetch("/api/site")
    .then(async (res) => {
      if (!res.ok) return { live: false, db: false };
      const body = (await res.json()) as SiteStatus;
      return { live: Boolean(body.live), db: Boolean(body.db), updatedAt: body.updatedAt, updatedBy: body.updatedBy };
    })
    .catch(() => ({ live: false, db: false }));
  return sitePromise;
}

async function fetchCache<T>(key: string, force?: boolean): Promise<{ ok: true; data: T } | { ok: false }> {
  const q = new URLSearchParams({ key });
  if (force) q.set("force", "1");
  const res = await fetch(`/api/cache?${q}`);
  let body: CacheBody<T> = {};
  try {
    body = (await res.json()) as CacheBody<T>;
  } catch {
    return { ok: false };
  }
  if (!res.ok || body.db === false || !body || !("data" in body)) return { ok: false };
  return { ok: true, data: body.data as T };
}

/** Shared MySQL snapshot when the admin has gone live. Otherwise `load` hits the chain as before. */
export async function liveOr<T>(key: string, load: () => Promise<T>, opts?: { force?: boolean }): Promise<T> {
  if (typeof window === "undefined" || siteSandboxFlag()) return load();
  const site = await siteStatus();
  if (!site.live || !site.db) return load();
  const canon = canonCacheKey(key);
  if (!canon) return load();
  const flightKey = `${opts?.force ? "f:" : ""}${canon}`;
  const existing = inflight.get(flightKey);
  if (existing) return existing as Promise<T>;
  const job = (async () => {
    const hit = await fetchCache<T>(canon, opts?.force);
    if (hit.ok) return hit.data;
    return load();
  })().finally(() => {
    inflight.delete(flightKey);
  });
  inflight.set(flightKey, job);
  return job;
}

export async function forceServerCache<T>(key: string): Promise<T> {
  const canon = canonCacheKey(key);
  if (!canon) throw new Error("Unknown cache key.");
  const q = new URLSearchParams({ key: canon, force: "1" });
  const res = await fetch(`/api/cache?${q}`);
  const body = (await res.json().catch(() => ({}))) as CacheBody<T>;
  if (!res.ok || !body || !("data" in body)) throw new Error(body.error || "Cache refresh failed.");
  return body.data as T;
}

export async function setSiteLive(account: string, live: boolean): Promise<SiteStatus> {
  const res = await fetch("/api/admin/live", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, live }),
  });
  const body = (await res.json().catch(() => ({}))) as SiteStatus & { error?: string };
  if (!res.ok) throw new Error(body.error || "Could not update live mode.");
  invalidateSiteStatus();
  return siteStatus(true);
}

export async function clearServerCaches(account: string): Promise<void> {
  const res = await fetch("/api/admin/rebuild", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error || "Could not clear caches.");
  invalidateSiteStatus();
}
