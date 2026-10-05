import { TOKEN_ICON_SRC } from "@/config/tokenIconManifest";
import { XTOKENS } from "@/config/launch";
import { flexApi } from "@/services/flexApi";
import { airdropsLogoRawUrl, alcorLogoRawUrl } from "@/services/listingRepos";
import { validImageUrl } from "@/services/tokenLogo";

const remoteIconSrc: Record<string, string> = {};
const logoSaved = new Set<string>();
const listeners = new Set<() => void>();
let logoEpoch = 0;

const CID = /Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{20,80}/;

export function ipfsCid(value: string | undefined) {
  const m = CID.exec((value || "").trim());
  return m ? m[0] : "";
}

export function tokenIconKey(contract: string, symbol: string) {
  return `${contract.trim().toLowerCase()}:${symbol.trim().toUpperCase()}`;
}

/** Bundled `/tokens/...` path from the token.proton snapshot. */
export function localTokenIconSrc(contract: string | undefined, symbol: string): string | undefined {
  const code = symbol.trim().toUpperCase();
  if (!code) return undefined;
  const acct = (contract || "").trim().toLowerCase();
  if (acct) {
    const hit = TOKEN_ICON_SRC[tokenIconKey(acct, code)];
    if (hit) return hit;
  }
  if (!acct || acct === XTOKENS) return TOKEN_ICON_SRC[tokenIconKey(XTOKENS, code)];
  return undefined;
}

export function subscribeTokenIcons(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function tokenIconEpoch() {
  return logoEpoch;
}

export function rememberRemoteTokenIcon(contract: string, symbol: string, url: string) {
  if (!validImageUrl(url)) return;
  const key = tokenIconKey(contract, symbol);
  const next = url.trim();
  if (remoteIconSrc[key] === next) return;
  remoteIconSrc[key] = next;
  logoEpoch += 1;
  for (const onStoreChange of listeners) onStoreChange();
}

export function remoteTokenIconSrc(contract: string | undefined, symbol: string): string | undefined {
  const acct = (contract || "").trim().toLowerCase();
  const code = symbol.trim().toUpperCase();
  if (!acct || !code) return undefined;
  return remoteIconSrc[tokenIconKey(acct, code)];
}

function fallbackIconSrc(url?: string) {
  const u = (url || "").trim();
  if (!u) return undefined;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  return validImageUrl(u) ? u : undefined;
}

function httpIcon(url?: string) {
  const raw = fallbackIconSrc(url);
  return raw && /^https?:\/\//i.test(raw) ? raw : undefined;
}

/** Remote icon URL for this token, when one is known. */
export function tokenIconRemote(contract: string | undefined, symbol: string, fallback?: string) {
  return httpIcon(fallback) || remoteTokenIconSrc(contract, symbol);
}

function logoAccount(contract: string | undefined, symbol: string) {
  const acct = (contract || "").trim().toLowerCase();
  const code = symbol.trim().toUpperCase();
  if (!/^[a-z1-5.]{1,12}$/.test(acct) || acct.startsWith(".") || acct.endsWith(".") || !/^[A-Z]{1,7}$/.test(code)) return null;
  return { acct, code };
}

/** One static file: `public/tokens/{contract}/{SYMBOL}-{cid}.png`, or the extension already on the link. */
export function localLogoSrc(contract: string | undefined, symbol: string, url?: string) {
  const cid = ipfsCid(url);
  const id = logoAccount(contract, symbol);
  if (!cid || !id) return undefined;
  const found = /\.(png|svg|jpe?g|webp|gif)(?:$|[?#])/i.exec(url || "");
  const ext = found ? (found[1].toLowerCase() === "jpeg" ? "jpg" : found[1].toLowerCase()) : "png";
  return `/tokens/${id.acct}/${id.code}-${cid}.${ext}`;
}

export function storeLogoQuiet(contract: string, symbol: string, url: string) {
  const id = logoAccount(contract, symbol);
  const raw = (url || "").trim();
  const cid = ipfsCid(raw);
  if (!id || !httpIcon(raw)) return;
  if (raw !== alcorLogoRawUrl(id.code, id.acct) && raw !== airdropsLogoRawUrl(id.code, id.acct) && !cid) return;
  const key = `${id.acct}:${id.code}:${raw}`;
  if (logoSaved.has(key)) return;
  logoSaved.add(key);
  void fetch(flexApi("/api/logo"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract: id.acct, symbol: id.code, cid, url: raw }),
  }).catch(() => undefined);
}

export async function storeLogoFile(contract: string, symbol: string, cid: string, file: Blob) {
  const id = logoAccount(contract, symbol);
  if (!id || !ipfsCid(cid)) return;
  try {
    const form = new FormData();
    form.append("contract", id.acct);
    form.append("symbol", id.code);
    form.append("cid", cid);
    form.append("file", file, "logo.png");
    await fetch(flexApi("/api/logo"), { method: "POST", body: form });
  } catch {
    /* quiet */
  }
}

/** Local file, then Alcor, then eos-airdrops, then the IPFS (or other http) icon. One at a time. */
export function tokenIconPlaces(contract: string | undefined, symbol: string, fallback?: string): string[] {
  const picked = (fallback || "").trim();
  if (picked.startsWith("data:") || picked.startsWith("blob:")) return [picked];
  const id = logoAccount(contract, symbol);
  const remote = httpIcon(picked) || remoteTokenIconSrc(contract, symbol);
  const places: string[] = [];
  const add = (url?: string) => {
    if (url && !places.includes(url)) places.push(url);
  };
  add(localTokenIconSrc(contract, symbol));
  if (id) add(`/tokens/${id.acct}/${id.code}.png`);
  if (id) {
    add(alcorLogoRawUrl(id.code, id.acct));
    add(airdropsLogoRawUrl(id.code, id.acct));
  }
  add(remote);
  if (picked.startsWith("/") && !picked.startsWith("//")) add(picked);
  if (id && (picked === alcorLogoRawUrl(id.code, id.acct) || picked === airdropsLogoRawUrl(id.code, id.acct))) {
    const start = places.indexOf(picked);
    if (start > 0) return places.slice(start).concat(places.slice(0, start));
  }
  return places;
}

export function tokenIconSrc(contract: string | undefined, symbol: string, fallback?: string): string | undefined {
  return tokenIconPlaces(contract, symbol, fallback)[0];
}
