import type { ChainAction } from "@/services/launchActions";
import { parseAsset, validPrecision } from "@/services/assets";
import { CACHE_KEYS } from "@/services/cacheKeys";
import { readLaunches, readStat } from "@/services/flexTables";
import { liveOr, siteStatus } from "@/services/readThrough";
import { siteSandboxFlag } from "@/services/siteSandbox";
import { symbolCodeOf } from "@/services/preflight";
import { getActions, getTableRows } from "@/services/rpc";
import { rememberRemoteTokenIcon } from "@/services/tokenIcons";

/** token.proton::reg/update typically want tcontract@active (3asy / fl3x / for3x). Manager lets the connected account try first. Do not wire this to the launch wizard. */
export const TOKEN_PROTON = "token.proton";
export const TOKEN_PROTON_TNAME_MAX = 16;

export function protonTname(value: string, fallback = "") {
  const t = value.trim().slice(0, TOKEN_PROTON_TNAME_MAX);
  return t || fallback.trim().slice(0, TOKEN_PROTON_TNAME_MAX);
}

export type ProtonTokenRow = {
  id: number | string;
  tcontract: string;
  tname: string;
  url: string;
  desc: string;
  iconurl: string;
  symbol: unknown;
  blisted?: number;
};

export function protonSymbol(precision: number, code: string) {
  return `${precision},${code}`;
}

export function parseProtonSymbol(raw: unknown): { precision: number; code: string } | null {
  if (typeof raw === "string") {
    const m = /^(\d+),([A-Z]{1,7})$/.exec(raw.trim());
    if (!m) return null;
    const precision = Number(m[1]);
    if (!validPrecision(precision)) return null;
    return { precision, code: m[2] };
  }
  if (raw && typeof raw === "object") {
    const o = raw as { precision?: number; name?: string; symbol?: string; code?: string };
    if (typeof o.symbol === "string") return parseProtonSymbol(o.symbol);
    const code = String(o.name || o.code || "").toUpperCase();
    if (typeof o.precision === "number" && /^[A-Z]{1,7}$/.test(code) && validPrecision(o.precision)) {
      return { precision: o.precision, code };
    }
  }
  return null;
}

export function rowMatchesContractCode(row: ProtonTokenRow, tcontract: string, code: string) {
  if (row.tcontract !== tcontract) return false;
  const s = parseProtonSymbol(row.symbol);
  return Boolean(s && s.code === code.trim().toUpperCase());
}

export function rowMatchesContractSymbol(
  row: ProtonTokenRow,
  tcontract: string,
  precision: number,
  code: string
) {
  if (!rowMatchesContractCode(row, tcontract, code)) return false;
  const s = parseProtonSymbol(row.symbol);
  return Boolean(s && s.precision === precision);
}

export function pickProtonRow(
  rows: ProtonTokenRow[],
  tcontract: string,
  code: string,
  precision?: number
): ProtonTokenRow | null {
  const hits = rows.filter((row) => rowMatchesContractCode(row, tcontract, code));
  if (!hits.length) return null;
  if (precision == null) return hits[0];
  return hits.find((row) => rowMatchesContractSymbol(row, tcontract, precision, code)) ?? hits[0];
}

function rememberRowIcon(row: ProtonTokenRow) {
  const parsed = parseProtonSymbol(row.symbol);
  if (!parsed || !row.tcontract || !row.iconurl) return;
  rememberRemoteTokenIcon(row.tcontract, parsed.code, row.iconurl);
}

let protonTableJob: Promise<ProtonTokenRow[]> | null = null;

export async function fetchProtonTokenRows(): Promise<ProtonTokenRow[]> {
  const rows: ProtonTokenRow[] = [];
  let lower: string | number | undefined;
  try {
    for (;;) {
      const page = await getTableRows<ProtonTokenRow>({
        code: TOKEN_PROTON,
        table: "tokens",
        scope: TOKEN_PROTON,
        limit: 200,
        lower_bound: lower,
      });
      for (const row of page.rows) rows.push(row);
      if (!page.more || !page.next_key || rows.length >= 50_000) break;
      lower = page.next_key;
    }
  } catch (err) {
    if (rows.length) return rows;
    throw err;
  }
  return rows;
}

function stampIcons(rows: ProtonTokenRow[]) {
  for (const row of rows) rememberRowIcon(row);
  return rows;
}

/** Paginated token.proton tokens table. Partial rows are kept if a later page fails. */
export async function loadProtonTokenTable(force = false): Promise<ProtonTokenRow[]> {
  if (typeof window !== "undefined" && !siteSandboxFlag()) {
    const site = await siteStatus();
    if (site.live && site.db) {
      const rows = await liveOr(CACHE_KEYS.proton, () => fetchProtonTokenRows(), { force });
      return stampIcons(rows);
    }
  }
  if (!force && protonTableJob) return protonTableJob;
  protonTableJob = fetchProtonTokenRows()
    .then((rows) => stampIcons(rows))
    .catch((err) => {
      protonTableJob = null;
      throw err;
    });
  return protonTableJob;
}

export async function listProtonRowsForContract(tcontract: string): Promise<ProtonTokenRow[]> {
  const rows = await loadProtonTokenTable();
  return rows.filter((row) => row.tcontract === tcontract);
}

export function protonSyncGaps(
  tokens: Array<{ symbol: string; precision: number }>,
  rows: ProtonTokenRow[],
  tcontract: string
): Array<{ symbol: string; precision: number }> {
  return tokens.filter((t) => !rows.some((r) => rowMatchesContractCode(r, tcontract, t.symbol)));
}

export async function listContractTokenRefs(code: string): Promise<Array<{ symbol: string; precision: number }>> {
  const [launches, created] = await Promise.all([
    readLaunches(code, 400).catch(() => [] as Record<string, unknown>[]),
    getActions({ account: code, filter: `${code}:create`, limit: 200 }).catch(() => ({ actions: [] as Array<{ act?: { name?: string; data?: Record<string, unknown> } }> })),
  ]);
  const symbols = new Set<string>();
  const precisionHint = new Map<string, number>();
  for (const row of launches) {
    const symbol = symbolCodeOf(row.token_symbol ?? row.symbol);
    if (symbol) symbols.add(symbol);
  }
  for (const a of created.actions) {
    if (a.act?.name && a.act.name !== "create") continue;
    const parsed = parseAsset(String(a.act?.data?.maximum_supply ?? ""));
    if (!parsed) continue;
    symbols.add(parsed.symbol);
    precisionHint.set(parsed.symbol, parsed.precision);
  }
  const out: Array<{ symbol: string; precision: number }> = [];
  for (const symbol of symbols) {
    const stat = await readStat(code, symbol).catch(() => null);
    const supply = parseAsset(String(stat?.max_supply ?? stat?.supply ?? ""));
    const precision = supply?.precision ?? precisionHint.get(symbol);
    if (precision == null || !validPrecision(precision)) continue;
    out.push({ symbol, precision });
  }
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export async function findProtonTokenRow(
  tcontract: string,
  precision: number,
  code: string,
  force = false
): Promise<ProtonTokenRow | null> {
  try {
    const rows = await loadProtonTokenTable(force);
    return pickProtonRow(rows, tcontract, code, precision);
  } catch {
    return null;
  }
}

export function tokenProtonLogoAction(args: {
  row: ProtonTokenRow | null;
  tcontract: string;
  tname: string;
  url: string;
  desc: string;
  iconurl: string;
  precision: number;
  symbol: string;
  signer?: string;
}): ChainAction {
  const symbol = protonSymbol(args.precision, args.symbol);
  const data: Record<string, unknown> = {
    tcontract: args.tcontract,
    tname: protonTname(args.tname, args.symbol),
    url: args.url,
    desc: args.desc,
    iconurl: args.iconurl,
    symbol,
  };
  if (args.row) data.id = args.row.id;
  const actor = args.signer?.trim() || args.tcontract;
  return {
    account: TOKEN_PROTON,
    name: args.row ? "update" : "reg",
    data,
    authorization: [{ actor, permission: "active" }],
  };
}

export function tokenProtonRemoveAction(args: {
  id: number | string;
  signer: string;
}): ChainAction {
  return {
    account: TOKEN_PROTON,
    name: "remove",
    data: { id: args.id },
    authorization: [{ actor: args.signer, permission: "active" }],
  };
}

export async function buildTokenProtonLogoAction(args: {
  tname: string;
  url: string;
  desc: string;
  iconurl: string;
  precision: number;
  symbol: string;
  tcontract: string;
}): Promise<ChainAction> {
  const tcontract = args.tcontract;
  const row = await findProtonTokenRow(tcontract, args.precision, args.symbol);
  return tokenProtonLogoAction({ ...args, tcontract, row });
}
