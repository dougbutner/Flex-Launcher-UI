/** Production Pages talks to Namecheap. Local `npm run dev` leaves this empty and uses the Vite /api plugin. */
export function flexApiOrigin(): string {
  const raw = String(import.meta.env.VITE_FLEX_API_URL ?? "").trim().replace(/\/$/, "");
  if (raw) return raw;
  if (import.meta.env.PROD) return "https://api.flex.forex";
  return "";
}

export function joinFlexApi(origin: string, path: string, query?: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
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
