import { TOKEN_ICON_SRC } from "@/config/tokenIconManifest";
import { XTOKENS } from "@/config/launch";
import { validImageUrl } from "@/services/tokenLogo";

const remoteIconSrc: Record<string, string> = {};

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

export function rememberRemoteTokenIcon(contract: string, symbol: string, url: string) {
  if (!validImageUrl(url)) return;
  remoteIconSrc[tokenIconKey(contract, symbol)] = url.trim();
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

export function tokenIconSrc(contract: string | undefined, symbol: string, fallback?: string): string | undefined {
  return localTokenIconSrc(contract, symbol) || fallbackIconSrc(fallback) || remoteTokenIconSrc(contract, symbol);
}
