const CHARSET = ".12345abcdefghijklmnopqrstuvwxyz";

/** EOSIO name → u64. Needed for Alcor token sort and numeric scopes. */
export function nameToU64(name: string): bigint {
  let value = 0n;
  const len = Math.min(name.length, 12);
  for (let i = 0; i < len; i++) {
    const idx = CHARSET.indexOf(name[i]);
    if (idx < 0) return 0n;
    value |= BigInt(idx) << BigInt(64 - 5 * (i + 1));
  }
  if (name.length >= 13) {
    const idx = CHARSET.indexOf(name[12]);
    if (idx >= 0) value |= BigInt(idx & 0xf);
  }
  return value;
}

/** nodeos accepts decimal-string scopes for uint64 scopes (e.g. Alcor positions by pool id). Pass through. */
export function safeScopeName(name: string): string {
  return name;
}

/** EOSIO symbol_code packing (little-endian char bytes). */
export function symbolCodeToU64(code: string): bigint {
  let value = 0n;
  const s = code.slice(0, 7);
  for (let i = 0; i < s.length; i++) {
    value |= BigInt(s.charCodeAt(i)) << BigInt(8 * i);
  }
  return value;
}

export type ExtToken = { symbol: string; contract: string; precision: number };

export function compareExtTokens(a: ExtToken, b: ExtToken): number {
  const ca = nameToU64(a.contract);
  const cb = nameToU64(b.contract);
  if (ca < cb) return -1;
  if (ca > cb) return 1;
  const sa = symbolCodeToU64(a.symbol);
  const sb = symbolCodeToU64(b.symbol);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

export function sortPair(a: ExtToken, b: ExtToken): [ExtToken, ExtToken] {
  return compareExtTokens(a, b) <= 0 ? [a, b] : [b, a];
}
