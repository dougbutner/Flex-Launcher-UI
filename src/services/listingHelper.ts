import { validSymbol } from "@/services/assets";
import { validImageUrl } from "@/services/tokenLogo";
import type { ManagerToken } from "@/services/managerStore";
import { parseProtonSymbol, type ProtonTokenRow } from "@/services/tokenProton";

export const ALCOR_LOGO_UPLOAD = "https://github.com/alcorexchange/alcor-ui/upload/master/assets/tokens/proton";

export type ListingDraft = { tname: string; url: string; desc: string; iconurl: string };

export function alcorLogoFilename(symbol: string, contract: string) {
  return `${symbol.trim().toLowerCase()}_${contract.trim().toLowerCase()}.png`;
}

export function listingPacketJson(args: {
  name: string;
  iconurl: string;
  symbol: string;
  contract: string;
}) {
  return {
    name: args.name.trim() || args.symbol,
    logo: args.iconurl.trim(),
    symbol: args.symbol,
    account: args.contract,
    chain: "proton",
  };
}

export function listingPacketText(args: {
  name: string;
  url: string;
  desc: string;
  iconurl: string;
  symbol: string;
  contract: string;
  precision: number;
}) {
  const file = alcorLogoFilename(args.symbol, args.contract);
  return [
    `tname: ${args.name.trim() || args.symbol}`,
    `url: ${args.url.trim()}`,
    `desc: ${args.desc.trim()}`,
    `iconurl: ${args.iconurl.trim()}`,
    `symbol: ${args.precision},${args.symbol}`,
    `tcontract: ${args.contract}`,
    `alcor logo: ${file} (64x64 PNG)`,
    ALCOR_LOGO_UPLOAD,
  ].join("\n");
}

export function mergeAdminTokenRefs(args: {
  tcontract: string;
  refs: Array<{ symbol: string; precision: number }>;
  stored: ManagerToken[];
  proton: ProtonTokenRow[];
}): Array<{ symbol: string; precision: number }> {
  const bySym = new Map<string, { symbol: string; precision: number }>();
  const add = (symbol: string, precision: number) => {
    const code = symbol.trim().toUpperCase();
    if (!validSymbol(code) || !Number.isFinite(precision) || precision < 0 || precision > 18) return;
    if (!bySym.has(code)) bySym.set(code, { symbol: code, precision });
  };
  for (const t of args.refs) add(t.symbol, t.precision);
  for (const row of args.stored) {
    if (row.contract !== args.tcontract) continue;
    add(row.symbol, row.precision);
  }
  for (const row of args.proton) {
    if (row.tcontract !== args.tcontract) continue;
    const parsed = parseProtonSymbol(row.symbol);
    if (parsed) add(parsed.code, parsed.precision);
  }
  return [...bySym.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function emptyListingDraft(symbol: string): ListingDraft {
  return { tname: symbol, url: "", desc: "", iconurl: "" };
}

export function draftFromSources(args: {
  symbol: string;
  proton?: ProtonTokenRow | null;
  stored?: ManagerToken | null;
}): ListingDraft {
  const row = args.proton;
  const sq = args.stored;
  const icon = row?.iconurl || sq?.imageUrl || "";
  return {
    tname: row?.tname || sq?.name || args.symbol,
    url: row?.url || sq?.website || "",
    desc: row?.desc || sq?.description || "",
    iconurl: validImageUrl(icon) ? icon : icon,
  };
}
