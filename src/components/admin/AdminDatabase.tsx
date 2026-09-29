import { useCallback, useEffect, useState } from "react";
import { siteSandboxFlag } from "@/services/siteSandbox";
import {
  bookCacheKey,
  CACHE_KEYS,
  marketCacheKey,
  marksCacheKey,
  metricsCacheKey,
  SHARED_CACHE_KEYS,
  tokenCacheKey,
} from "@/services/cacheKeys";
import { clearServerCaches, forceServerCache, setSiteLive, siteStatus, type SiteStatus } from "@/services/readThrough";
import type { BoardToken } from "@/services/leaderboardStore";

async function pool<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length || 1) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item === undefined) return;
      await run(item);
    }
  });
  await Promise.all(workers);
}

export function AdminDatabase({ account }: { account: string }) {
  const [site, setSite] = useState<SiteStatus | null>(null);
  const [busy, setBusy] = useState<"live" | "rebuild" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const next = await siteStatus(true);
    setSite(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fill = async () => {
    const board = await forceServerCache<BoardToken[]>(CACHE_KEYS.board);
    for (const key of SHARED_CACHE_KEYS) {
      if (key === CACHE_KEYS.board) continue;
      await forceServerCache(key);
    }
    const tokens = Array.isArray(board) ? board : [];
    await pool(tokens, 3, async (token) => {
      await forceServerCache(tokenCacheKey(token.contract, token.symbol)).catch(() => undefined);
      await forceServerCache(bookCacheKey(token.contract, token.symbol)).catch(() => undefined);
      await forceServerCache(marksCacheKey(token.contract, token.symbol)).catch(() => undefined);
      await forceServerCache(metricsCacheKey(token.contract, token.symbol, 0)).catch(() => undefined);
      if (token.poolId > 0) {
        await forceServerCache(metricsCacheKey(token.contract, token.symbol, token.poolId)).catch(() => undefined);
      }
      if (token.poolId > 0) {
        await forceServerCache(marketCacheKey(token.contract, token.symbol, token.poolId)).catch(() => undefined);
      }
    });
  };

  const goLive = async (live: boolean) => {
    if (siteSandboxFlag()) {
      setError("Turn off the sandbox before changing live mode.");
      return;
    }
    setBusy("live");
    setError("");
    setNote("");
    try {
      if (live) {
        setNote("Reading chain into the database…");
        await fill();
      }
      const next = await setSiteLive(account, live);
      setSite(next);
      setNote(live ? "Live. Visitors read snapshots from MySQL." : "Visitors read the chain directly.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const rebuild = async () => {
    if (siteSandboxFlag()) {
      setError("Turn off the sandbox before rebuilding. Test data must not land in MySQL.");
      return;
    }
    setBusy("rebuild");
    setError("");
    setNote("Clearing snapshots…");
    try {
      await clearServerCaches(account);
      setNote("Reading chain into the database…");
      await fill();
      setNote("Caches rebuilt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const db = Boolean(site?.db);
  const live = Boolean(site?.live);

  return (
    <div className="mt-4 rounded-xl border border-border bg-background/40 p-4">
      <p className="text-sm font-semibold">Database</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Visitors keep reading the chain until you go live. After that, Tokens, Events, Make it rain, and token pages
        share MySQL snapshots. A snapshot is reused for 15 seconds, then one refresh updates it for everyone. A rain
        transaction refreshes that rain pool immediately.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {site == null ? "Checking MySQL…" : db ? "MySQL connected." : "MySQL is not configured."}
        {db && live ? " Live mode is on." : db ? " Live mode is off." : ""}
      </p>
      {db ? null : (
        <p className="mt-2 text-xs text-muted-foreground">
          MySQL runs on api.flex.forex. Fill api/config.php on Namecheap and import sql/schema.sql, then sql/data.sql.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={live ? "btn btn-outline btn-sm" : "btn btn-primary btn-sm"}
          disabled={!db || busy != null}
          onClick={() => void goLive(!live)}
        >
          {busy === "live" ? "Working…" : live ? "Read from chain" : "Go live"}
        </button>
        <button type="button" className="btn btn-outline btn-sm" disabled={!db || busy != null} onClick={() => void rebuild()}>
          {busy === "rebuild" ? "Rebuilding…" : "Rebuild caches"}
        </button>
      </div>
      {note ? <p className="mt-2 text-xs text-muted-foreground">{note}</p> : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
