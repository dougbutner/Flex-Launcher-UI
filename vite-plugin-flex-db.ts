import { execFile } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { Plugin, ViteDevServer } from "vite";
import { dispatch, type RefreshFn } from "./server/dispatch";

const execFileAsync = promisify(execFile);
const PREFIXES = ["/api/manager", "/api/insiders", "/api/site", "/api/cache", "/api/txs", "/api/admin"];

function send(res: ServerResponse, status: number, body: unknown) {
  if (status === 204) {
    res.statusCode = 204;
    res.end();
    return;
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body ?? {}));
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

function wants(pathname: string) {
  return PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function mergedEnv(extra: Record<string, string>): Record<string, string | undefined> {
  return { ...process.env, ...extra };
}

async function bundledRefresh(): Promise<RefreshFn> {
  await execFileAsync(process.execPath, ["scripts/bundle-cache-refresh.mjs"], { cwd: process.cwd() });
  const href = pathToFileURL(path.resolve("functions/generated/cacheRefresh.js")).href;
  const mod = (await import(`${href}?t=${Date.now()}`)) as { refreshCacheKey: RefreshFn };
  return mod.refreshCacheKey;
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
  env: Record<string, string>,
  refresh: RefreshFn
) {
  const url = new URL(req.url || "/", "http://localhost");
  if (!wants(url.pathname)) {
    next();
    return;
  }
  const method = req.method || "GET";
  const text = method === "GET" || method === "HEAD" ? "" : await readBody(req, 64_000);
  const request = new Request(`http://localhost${req.url}`, {
    method,
    headers: { "content-type": req.headers["content-type"] || "application/json" },
    body: method === "GET" || method === "HEAD" ? undefined : text,
  });
  const result = await dispatch(request, mergedEnv(env), refresh);
  send(res, result.status, result.body);
}

export function flexDbPlugin(env: Record<string, string>): Plugin {
  let devRefresh: Promise<RefreshFn> | null = null;
  let previewRefresh: Promise<RefreshFn> | null = null;

  return {
    name: "flex-db",
    configureServer(server) {
      const refreshFrom = (vite: ViteDevServer) => {
        devRefresh ??= vite.ssrLoadModule("/src/entry/cacheRefresh.ts").then((mod) => {
          const fn = (mod as { refreshCacheKey?: RefreshFn }).refreshCacheKey;
          if (!fn) throw new Error("Cache refresh module did not load.");
          return fn;
        });
        return devRefresh;
      };
      server.watcher.on("change", (file) => {
        if (file.includes(`${path.sep}src${path.sep}`)) devRefresh = null;
      });
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        if (!wants(url.pathname)) {
          next();
          return;
        }
        const needsRefresh = url.pathname === "/api/cache";
        const refreshReady = needsRefresh
          ? refreshFrom(server)
          : Promise.resolve<RefreshFn>(async () => {
              throw new Error("This route does not refresh snapshots.");
            });
        void refreshReady
          .then((refresh) => handle(req, res, next, env, refresh))
          .catch((err) => send(res, 500, { error: err instanceof Error ? err.message : String(err) }));
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        if (!wants(url.pathname)) {
          next();
          return;
        }
        const needsRefresh = url.pathname === "/api/cache";
        const refreshReady = needsRefresh
          ? (previewRefresh ??= bundledRefresh())
          : Promise.resolve<RefreshFn>(async () => {
              throw new Error("This route does not refresh snapshots.");
            });
        void refreshReady
          .then((refresh) => handle(req, res, next, env, refresh))
          .catch((err) => send(res, 500, { error: err instanceof Error ? err.message : String(err) }));
      });
    },
  };
}
