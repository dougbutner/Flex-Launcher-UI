import { pagesEnv, type PagesContext } from "../../server/pagesFn";

/** Namecheap HTTPS presents *.web-hosting.com. Pages fetches HTTP so the UI can stay on flex.forex. */
export async function onRequest(context: PagesContext) {
  const req = context.request;
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const url = new URL(req.url);
  const rest = url.pathname.replace(/^\/php/, "") || "/";
  const origin = String(pagesEnv(context.env).PHP_API_ORIGIN || "http://api.flex.forex").replace(/\/$/, "");
  const headers = new Headers();
  const ct = req.headers.get("Content-Type");
  if (ct) headers.set("Content-Type", ct);
  const init: RequestInit = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer();
  try {
    const res = await fetch(`${origin}${rest}${url.search}`, init);
    return new Response(res.body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json; charset=utf-8" },
    });
  } catch {
    return Response.json({ error: "Club API is unreachable." }, { status: 502 });
  }
}
