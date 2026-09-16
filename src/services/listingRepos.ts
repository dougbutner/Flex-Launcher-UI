import {
  ALCOR_UI_OWNER,
  ALCOR_UI_REPO_NAME,
  EOS_AIRDROPS_OWNER,
  EOS_AIRDROPS_REPO_NAME,
  LISTING_GITHUB_LOGIN,
  airdropsLogoPath,
  alcorFundamentalsKey,
  alcorLogoPath,
  listingPacketJson,
  listingPrBranch,
  type ListingGithubTarget,
} from "@/services/listingHelper";

export type ListingPlaceCheck = {
  listed: boolean;
  logoUrl: string;
  logoOn: boolean;
  jsonOn: boolean;
  prUrl: string;
  prState: string;
};

const RAW = "https://raw.githubusercontent.com";
const API = "https://api.github.com";

type Cache<T> = { at: number; value: T };
const TTL = 5 * 60_000;

let fundCache: Cache<Record<string, unknown>> | null = null;
let airdropsCache: Cache<unknown[]> | null = null;

async function fetchOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function rawUrl(owner: string, repo: string, branch: string, path: string) {
  return `${RAW}/${owner}/${repo}/${branch}/${path}`;
}

export function alcorLogoRawUrl(symbol: string, contract: string, branch = "master") {
  return rawUrl(ALCOR_UI_OWNER, ALCOR_UI_REPO_NAME, branch, alcorLogoPath(symbol, contract));
}

export function airdropsLogoRawUrl(symbol: string, contract: string, branch = "master") {
  return rawUrl(EOS_AIRDROPS_OWNER, EOS_AIRDROPS_REPO_NAME, branch, airdropsLogoPath(symbol, contract));
}

export function airdropsEntryMatch(row: unknown, symbol: string, contract: string) {
  if (!row || typeof row !== "object") return false;
  const o = row as Record<string, unknown>;
  const chain = String(o.chain ?? "").toLowerCase();
  if (chain && chain !== "proton") return false;
  return (
    String(o.symbol ?? "").toUpperCase() === symbol.trim().toUpperCase() &&
    String(o.account ?? "").toLowerCase() === contract.trim().toLowerCase()
  );
}

async function loadFundamentals(): Promise<Record<string, unknown>> {
  if (fundCache && Date.now() - fundCache.at < TTL) return fundCache.value;
  const json =
    (await fetchJson<Record<string, unknown>>(
      rawUrl(ALCOR_UI_OWNER, ALCOR_UI_REPO_NAME, "master", "assets/fundamentals/proton.json")
    )) ?? {};
  fundCache = { at: Date.now(), value: json };
  return json;
}

async function loadAirdropsTokens(): Promise<unknown[]> {
  if (airdropsCache && Date.now() - airdropsCache.at < TTL) return airdropsCache.value;
  const json =
    (await fetchJson<unknown[]>(rawUrl(EOS_AIRDROPS_OWNER, EOS_AIRDROPS_REPO_NAME, "master", "tokens.json"))) ?? [];
  airdropsCache = { at: Date.now(), value: Array.isArray(json) ? json : [] };
  return airdropsCache.value;
}

async function findPr(target: ListingGithubTarget, symbol: string, contract: string) {
  const upstream = target === "alcor-ui" ? `${ALCOR_UI_OWNER}/${ALCOR_UI_REPO_NAME}` : `${EOS_AIRDROPS_OWNER}/${EOS_AIRDROPS_REPO_NAME}`;
  const branch = listingPrBranch(symbol, contract);
  const head = `${LISTING_GITHUB_LOGIN}:${branch}`;
  try {
    const res = await fetch(`${API}/repos/${upstream}/pulls?head=${encodeURIComponent(head)}&state=all&per_page=5`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return { prUrl: "", prState: "" };
    const rows = (await res.json()) as Array<{ html_url?: string; state?: string; merged_at?: string | null }>;
    const hit = rows[0];
    if (!hit?.html_url) return { prUrl: "", prState: "" };
    const prState = hit.merged_at ? "merged" : hit.state === "open" ? "open" : "closed";
    return { prUrl: hit.html_url, prState };
  } catch {
    return { prUrl: "", prState: "" };
  }
}

export async function checkAlcorListing(symbol: string, contract: string): Promise<ListingPlaceCheck> {
  const logoUrl = alcorLogoRawUrl(symbol, contract);
  const [logoOn, fund, pr] = await Promise.all([fetchOk(logoUrl), loadFundamentals(), findPr("alcor-ui", symbol, contract)]);
  const jsonOn = Object.prototype.hasOwnProperty.call(fund, alcorFundamentalsKey(symbol, contract));
  return { listed: logoOn && jsonOn, logoUrl, logoOn, jsonOn, ...pr };
}

export async function checkAirdropsListing(symbol: string, contract: string): Promise<ListingPlaceCheck> {
  const logoUrl = airdropsLogoRawUrl(symbol, contract);
  const [logoOn, tokens, pr] = await Promise.all([
    fetchOk(logoUrl),
    loadAirdropsTokens(),
    findPr("eos-airdrops", symbol, contract),
  ]);
  const jsonOn = tokens.some((row) => airdropsEntryMatch(row, symbol, contract));
  return { listed: jsonOn, logoUrl, logoOn, jsonOn, ...pr };
}

export function airdropsPacketFor(symbol: string, contract: string, precision: number, name: string) {
  return listingPacketJson({
    name,
    url: "",
    desc: "",
    iconurl: "",
    symbol,
    contract,
    precision,
  });
}
