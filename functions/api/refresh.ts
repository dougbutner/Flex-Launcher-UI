import { refreshCacheKey } from "../generated/cacheRefresh.js";

type PagesContext = {
  request: Request;
  env?: Record<string, unknown>;
};

/** Chain snapshot builder. Namecheap PHP stores the JSON. No MySQL here. */
export async function onRequest(context: PagesContext) {
  const url = new URL(context.request.url);
  if (context.request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (context.request.method !== "GET") {
    return Response.json({ error: "GET a cache key." }, { status: 405 });
  }
  const want = String(context.env?.REFRESH_SECRET ?? "").trim();
  const got = String(url.searchParams.get("secret") ?? "").trim();
  if (want && got !== want) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const data = await refreshCacheKey(url.searchParams.get("key") || "");
    return Response.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Snapshot refresh failed.";
    return Response.json({ error: message }, { status: 503 });
  }
}
