import type { ChainAction } from "@/services/launchActions";
import { parseAsset, validPrecision } from "@/services/assets";
import { readLaunches, readStat } from "@/services/flexTables";
import { symbolCodeOf } from "@/services/preflight";
import { getActions, getTableRows } from "@/services/rpc";
import { rememberRemoteTokenIcon } from "@/services/tokenIcons";

/** Live token.proton::reg/update require tcontract@active. Flex tcontract is 3asy/fl3x/for3x, so the issuer cannot sign. Do not wire this to the issuer wizard. */
export const TOKEN_PROTON = "token.proton";

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

export function rowMatchesContractSymbol(
  row: ProtonTokenRow,
  tcontract: string,
  precision: number,
  code: string
) {
  if (row.tcontract !== tcontract) return false;
  const s = parseProtonSymbol(row.symbol);
  return Boolean(s && s.precision === precision && s.code === code);
}

function rememberRowIcon(row: ProtonTokenRow) {
  const parsed = parseProtonSymbol(row.symbol);
  if (!parsed || !row.tcontract || !row.iconurl) return;
  rememberRemoteTokenIcon(row.tcontract, parsed.code, row.iconurl);
}

let protonTableJob: Promise<ProtonTokenRow[]> | null = null;

/** Paginated token.proton tokens table. Partial rows are kept if a later page fails. */
export async function loadProtonTokenTable(force = false): Promise<ProtonTokenRow[]> {
  if (!force && protonTableJob) return protonTableJob;
  protonTableJob = (async () => {
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
        for (const row of page.rows) {
          rows.push(row);
          rememberRowIcon(row);
        }
        if (!page.more || !page.next_key || rows.length >= 8000) break;
        lower = page.next_key;
      }
    } catch (err) {
      if (rows.length) return rows;
      throw err;
    }
    return rows;
  })();
  try {
    return await protonTableJob;
  } catch (err) {
    protonTableJob = null;
    throw err;
  }
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
  return tokens.filter((t) => !rows.some((r) => rowMatchesContractSymbol(r, tcontract, t.precision, t.symbol)));
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
  code: string
): Promise<ProtonTokenRow | null> {
  try {
    const rows = await loadProtonTokenTable();
    return rows.find((row) => rowMatchesContractSymbol(row, tcontract, precision, code)) ?? null;
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
}): ChainAction {
  const symbol = protonSymbol(args.precision, args.symbol);
  const data: Record<string, unknown> = {
    tcontract: args.tcontract,
    tname: args.tname,
    url: args.url,
    desc: args.desc,
    iconurl: args.iconurl,
    symbol,
  };
  if (args.row) data.id = args.row.id;
  return {
    account: TOKEN_PROTON,
    name: args.row ? "update" : "reg",
    data,
    authorization: [{ actor: args.tcontract, permission: "active" }],
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
