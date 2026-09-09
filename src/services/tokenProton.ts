import type { ChainAction } from "@/services/launchActions";
import { getAllTableRows } from "@/services/rpc";

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
    return { precision: Number(m[1]), code: m[2] };
  }
  if (raw && typeof raw === "object") {
    const o = raw as { precision?: number; name?: string; symbol?: string; code?: string };
    if (typeof o.symbol === "string") return parseProtonSymbol(o.symbol);
    const code = String(o.name || o.code || "").toUpperCase();
    if (typeof o.precision === "number" && /^[A-Z]{1,7}$/.test(code)) {
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

export async function findProtonTokenRow(
  tcontract: string,
  precision: number,
  code: string
): Promise<ProtonTokenRow | null> {
  const rows = await getAllTableRows<ProtonTokenRow>(
    { code: TOKEN_PROTON, table: "tokens", scope: TOKEN_PROTON, limit: 200 },
    8000
  );
  return rows.find((row) => rowMatchesContractSymbol(row, tcontract, precision, code)) ?? null;
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
