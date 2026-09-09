import { TOKEN_ICON_SRC } from "@/config/tokenIconManifest";
import { XTOKENS } from "@/config/launch";

export function tokenIconKey(contract: string, symbol: string) {
  return `${contract.trim().toLowerCase()}:${symbol.trim().toUpperCase()}`;
}

/** Bundled `/tokens/...` path from the token.proton snapshot. Never hits the network. */
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
