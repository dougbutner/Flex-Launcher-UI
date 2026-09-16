import type { ListingGithubTarget } from "@/services/listingHelper";

export type ListingPrResult = {
  ok?: boolean;
  error?: string;
  url?: string;
  number?: number;
  state?: string;
  already?: boolean;
  sync?: string;
};

async function readJson(res: Response): Promise<ListingPrResult> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as ListingPrResult) : {};
  } catch {
    return { error: text || res.statusText };
  }
}

export async function syncListingForks(): Promise<ListingPrResult> {
  const res = await fetch("/api/listing-pr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sync" }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(body.error || `GitHub sync ${res.status}`);
  return body;
}

export async function openListingPr(args: {
  target: ListingGithubTarget;
  symbol: string;
  contract: string;
  precision: number;
  name: string;
  website: string;
  desc: string;
  socials: string[];
  iconurl: string;
  pngBase64?: string;
}): Promise<ListingPrResult> {
  const res = await fetch("/api/listing-pr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pr", ...args }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(body.error || `GitHub PR ${res.status}`);
  return body;
}
