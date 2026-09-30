/** Production Pages talks to Namecheap. Local `npm run dev` leaves this empty and uses the Vite /api plugin. */
export function flexApiOrigin(): string {
  const raw = String(import.meta.env.VITE_FLEX_API_URL ?? "").trim().replace(/\/$/, "");
  if (raw) return raw;
  if (import.meta.env.PROD) return "https://api.flex.forex";
  return "";
}

/** Namecheap docroot is the `api/` folder, so `/api/site` there is a nested `/api/api/site`. */
export function pathOnApiHost(origin: string, path: string): string {
  let p = path.startsWith("/") ? path : `/${path}`;
  const host = origin.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
  if (host === "api.flex.forex" && (p === "/api" || p.startsWith("/api/"))) {
    p = p.slice(4) || "/";
  }
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
