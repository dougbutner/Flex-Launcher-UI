import type { FlexProgram } from "@/config/launch";
import { validPrecision, validSymbol } from "@/services/assets";
import { validImageUrl } from "@/services/tokenLogo";
import type { ManagerToken } from "@/services/managerStore";
import { parseProtonSymbol, protonTname, type ProtonTokenRow } from "@/services/tokenProton";

export const ALCOR_TOKEN_DOCS = "https://docs.alcor.exchange/adding-token-information/token-logo";
export const ALCOR_UI_OWNER = "alcorexchange";
export const ALCOR_UI_REPO_NAME = "alcor-ui";
export const EOS_AIRDROPS_OWNER = "eoscafe";
export const EOS_AIRDROPS_REPO_NAME = "eos-airdrops";
export const LISTING_GITHUB_LOGIN = "dougbutner";
export const ALCOR_UI_REPO = `https://github.com/${ALCOR_UI_OWNER}/${ALCOR_UI_REPO_NAME}`;
export const ALCOR_UI_FORK = `${ALCOR_UI_REPO}/fork`;
export const EOS_AIRDROPS_REPO = `https://github.com/${EOS_AIRDROPS_OWNER}/${EOS_AIRDROPS_REPO_NAME}`;
export const EOS_AIRDROPS_FORK = `${EOS_AIRDROPS_REPO}/fork`;
export const FLEX_TELEGRAM = "https://t.me/flextokens";

export type ListingGithubTarget = "alcor-ui" | "eos-airdrops";

export function listingPrBranch(symbol: string, contract: string) {
  const sym = symbol.trim().toLowerCase();
  const acct = contract.trim().toLowerCase().replace(/\./g, "-");
  return `flex-listing-${sym}-${acct}`;
}

export function alcorFundamentalsKey(symbol: string, contract: string) {
  return `${symbol.trim().toUpperCase()}@${contract.trim()}`;
}

export function alcorLogoPath(symbol: string, contract: string) {
  return `assets/tokens/proton/${alcorLogoFilename(symbol, contract)}`;
}

export function airdropsLogoPath(symbol: string, contract: string) {
  return `logos/${airdropsLogoFilename(symbol, contract)}`;
}

export function listingVersionLabel(program: FlexProgram | null | undefined) {
  if (program === "easyflex") return "easy";
  if (program === "complexflex") return "complex";
  if (program === "flexforex") return "forex";
  return "";
}

export function logoRequestTooltip(symbol: string, program?: FlexProgram | null) {
  const ticker = symbol.trim().toUpperCase() || "SYMBOL";
  const version = listingVersionLabel(program);
  if (version) {
    return `In Telegram, tell us the symbol ${ticker} and that you are using ${version} (easy, complex, or forex).`;
  }
  return `In Telegram, tell us the symbol ${ticker} and whether you are using easy, complex, or forex.`;
}

export type ListingDraft = {
  tname: string;
  url: string;
  desc: string;
  iconurl: string;
  twitter: string;
  telegram: string;
  farcaster: string;
};

type ListingCopyArgs = {
  name: string;
  url: string;
  desc: string;
  iconurl: string;
  symbol: string;
  contract: string;
  precision: number;
  twitter?: string;
  telegram?: string;
  farcaster?: string;
};

export function alcorLogoFilename(symbol: string, contract: string) {
  return `${symbol.trim().toLowerCase()}_${contract.trim().toLowerCase()}.png`;
}

export function airdropsLogoFilename(symbol: string, contract: string) {
  return `${symbol.trim().toLowerCase()}-${contract.trim().toLowerCase()}.png`;
}

function listingName(args: ListingCopyArgs) {
  return protonTname(args.name, args.symbol);
}

function socialUrl(value: string, kind: "twitter" | "telegram" | "farcaster") {
  const v = value.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (kind === "twitter") return `https://x.com/${v.replace(/^@/, "")}`;
  if (kind === "telegram") return `https://t.me/${v.replace(/^@/, "").replace(/^t\.me\//i, "")}`;
  return v;
}

export function listingSocials(args: Pick<ListingCopyArgs, "twitter" | "telegram" | "farcaster">) {
  return [
    socialUrl(args.twitter ?? "", "twitter"),
    socialUrl(args.telegram ?? "", "telegram"),
    socialUrl(args.farcaster ?? "", "farcaster"),
  ].filter(Boolean);
}

export function alcorFundamentalsEntry(args: ListingCopyArgs) {
  return {
    name: listingName(args),
    website: {
      link: args.url.trim(),
      name: listingName(args),
    },
    tags: ["XPR", "flex"],
    socials: listingSocials(args),
    description: args.desc.trim(),
  };
}

export function listingPacketJson(args: ListingCopyArgs) {
  const file = airdropsLogoFilename(args.symbol, args.contract);
  const logo = `https://raw.githubusercontent.com/eoscafe/eos-airdrops/master/logos/${file}`;
  return {
    name: listingName(args),
    logo,
    logo_lg: logo,
    symbol: args.symbol,
    account: args.contract,
    chain: "proton",
  };
}

export function listingPacketText(args: ListingCopyArgs) {
  const file = alcorLogoFilename(args.symbol, args.contract);
  return [
    `tname: ${listingName(args)}`,
    `url: ${args.url.trim()}`,
    `desc: ${args.desc.trim()}`,
    `iconurl: ${args.iconurl.trim()}`,
    `symbol: ${args.precision},${args.symbol}`,
    `tcontract: ${args.contract}`,
    `alcor logo: ${file} (64x64 PNG)`,
    ALCOR_TOKEN_DOCS,
  ].join("\n");
}

export function alcorListingPrompt(args: ListingCopyArgs) {
  const file = alcorLogoFilename(args.symbol, args.contract);
  const airdropsFile = airdropsLogoFilename(args.symbol, args.contract);
  const icon = args.iconurl.trim();
  const iconLine = icon
    ? `Download the logo from this public URL (IPFS gateway or https). Do not invent a different image:\n${icon}`
    : "The icon URL is missing. Ask the user for a public http(s) or IPFS gateway image URL before downloading. Do not invent a logo.";
  const fundamentals = {
    [`${args.symbol}@${args.contract}`]: alcorFundamentalsEntry(args),
  };
  const airdrops = listingPacketJson(args);
  return [
    "You are listing a Proton (XPR Network) token on Alcor Exchange.",
    "",
    "Do not commit to alcorexchange/alcor-ui or eoscafe/eos-airdrops directly. The user does not own those repos. Fork each repo first, make the changes on the fork, then open a pull request from the fork into upstream.",
    "",
    `Official docs: ${ALCOR_TOKEN_DOCS}`,
    `Fork alcor-ui: ${ALCOR_UI_FORK}`,
    `Upstream alcor-ui: ${ALCOR_UI_REPO}`,
    `Fork eos-airdrops: ${EOS_AIRDROPS_FORK}`,
    `Upstream eos-airdrops: ${EOS_AIRDROPS_REPO}`,
    "",
    "Token",
    `- Name: ${listingName(args)}`,
    `- Symbol: ${args.symbol}`,
    `- Contract: ${args.contract}`,
    `- Precision: ${args.precision}`,
    `- Website: ${args.url.trim() || "(none)"}`,
    `- Description: ${args.desc.trim() || "(none)"}`,
    "",
    iconLine,
    "",
    "1. alcor-ui (fast track logo + metadata)",
    `- Fork ${ALCOR_UI_REPO}.`,
    "- Download the icon from the URL above.",
    "- Convert and resize it to a 64x64 PNG.",
    `- Save it as assets/tokens/proton/${file} (symbol and contract lowercase).`,
    "- Merge this object into assets/fundamentals/proton.json. Keep valid JSON. Do not remove other tokens. Key is uppercase SYMBOL@contract:",
    JSON.stringify(fundamentals, null, 2),
    "- Open a pull request from the fork to alcorexchange/alcor-ui.",
    "",
    "2. eos-airdrops (legacy token info used by Alcor)",
    `- Fork ${EOS_AIRDROPS_REPO}.`,
    "- Download the same icon.",
    `- Save it as logos/${airdropsFile}.`,
    "- Insert this object into tokens.json, sorted alphabetically by name. logo and logo_lg must stay on the eos-airdrops raw GitHub path:",
    JSON.stringify(airdrops, null, 2),
    "- Open a pull request from the fork to eoscafe/eos-airdrops.",
    "",
    "If a field is empty, keep the required keys and files. Do not invent websites, socials, or artwork.",
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
    if (!validSymbol(code) || !validPrecision(precision)) return;
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
  return { tname: symbol, url: "", desc: "", iconurl: "", twitter: "", telegram: "", farcaster: "" };
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
    tname: protonTname(row?.tname || sq?.name || args.symbol, args.symbol),
    url: row?.url || sq?.website || "",
    desc: row?.desc || sq?.description || "",
    iconurl: validImageUrl(icon) ? icon : icon,
    twitter: sq?.twitter || "",
    telegram: sq?.telegram || "",
    farcaster: sq?.farcaster || "",
  };
}
