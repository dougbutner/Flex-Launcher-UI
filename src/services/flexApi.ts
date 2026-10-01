/** Local `npm run dev` leaves this empty and uses the Vite /api plugin. */
export function flexApiOrigin(): string {
  return String(import.meta.env.VITE_FLEX_API_URL ?? "").trim().replace(/\/$/, "");
}

/** Namecheap AutoSSL is missing, so production uses /php (Pages fetch over HTTP). */
export function pagesPhpPath(path: string): string {
  let p = path.startsWith("/") ? path : `/${path}`;
  if (p === "/api" || p.startsWith("/api/")) p = `/php${p.slice(4) || "/site"}`;
  return p;
}

/** Namecheap docroot is the `api/` folder, so `/api/site` there is a nested `/api/api/site`. */
export function pathOnApiHost(origin: string, path: string): string {
  let p = path.startsWith("/") ? path : `/${path}`;
  const host = origin.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
  if (host === "api.flex.forex" && (p === "/api" || p.startsWith("/api/"))) {
    p = p.slice(4) || "/";
  }
  if (!origin && import.meta.env.PROD) p = pagesPhpPath(p);
  return p;
}

export function joinFlexApi(origin: string, path: string, query?: string): string {
  const p = pathOnApiHost(origin, path);
  const q = query
    ? p.includes("?")
      ? `&${query}`
      : `?${query}`
    : "";
  const base = origin.replace(/\/$/, "");
  return `${base}${p}${q}`;
}

export function flexApi(path: string, query?: string): string {
  return joinFlexApi(flexApiOrigin(), path, query);
}
