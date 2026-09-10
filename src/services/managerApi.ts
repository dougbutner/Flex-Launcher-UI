import { managerFromDraft } from "@/services/managerDraft";
import { parseManagerToken, type ManagerToken } from "@/services/managerStore";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || res.statusText };
  }
}

export async function listManagerTokens(q: { issuer?: string; contract?: string }): Promise<ManagerToken[]> {
  const params = new URLSearchParams();
  if (q.issuer) params.set("issuer", q.issuer);
  if (q.contract) params.set("contract", q.contract);
  if (![...params.keys()].length) return [];
  const res = await fetch(`/api/manager?${params}`);
  const body = (await readJson(res)) as { tokens?: unknown; error?: string };
  if (!res.ok) throw new Error(body.error || `Manager store ${res.status}`);
  const tokens = Array.isArray(body.tokens) ? body.tokens : [];
  return tokens.map(parseManagerToken).filter((row): row is ManagerToken => Boolean(row));
}

export async function upsertManagerToken(token: ManagerToken): Promise<ManagerToken> {
  const res = await fetch("/api/manager", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(token),
  });
  const body = (await readJson(res)) as { token?: unknown; error?: string };
  if (!res.ok) throw new Error(body.error || `Manager store ${res.status}`);
  const parsed = parseManagerToken(body.token);
  if (!parsed) throw new Error("Manager store returned a bad row.");
  if (typeof window !== "undefined") window.dispatchEvent(new Event("flex-manager-updated"));
  return parsed;
}

/** Best-effort write after a signed launch step. Never throws. */
export async function persistLaunchDraft(issuer: string, draft: LaunchDraft): Promise<void> {
  if (!issuer || !draft.symbol || !draft.createTx) return;
  try {
    await upsertManagerToken(managerFromDraft(issuer, draft));
  } catch (err) {
    console.warn("Manager sqlite persist failed", err);
  }
}
