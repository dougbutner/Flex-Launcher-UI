import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { validAccount } from "@/services/assets";
import { readInsiders } from "@/services/flexTables";
import { addinsidersAction, setpresaleAction, type ChainAction, type SetPresaleArgs } from "@/services/launchActions";

/** lock_secs + 3d must stay ≤ 90d main lock. */
export const PRESALE_LOCK_MAX_SECS = 87 * 24 * 60 * 60;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function unixToLocal(unix: number): string {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function localToUnix(value: string): number {
  if (!value.trim()) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}

export function defaultClubTimes(now = Math.floor(Date.now() / 1000)): { insider: string; launch: string } {
  return { insider: unixToLocal(now + 7 * 86400), launch: unixToLocal(now + 14 * 86400) };
}

export function parseInviteAccounts(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    const name = part.trim().toLowerCase();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function inviteListError(raw: string): string | null {
  for (const name of parseInviteAccounts(raw)) {
    if (!validAccount(name)) return `Bad account ${name}. Use 1-12 char names (a-z, 1-5).`;
  }
  return null;
}

/** Null if skipped or valid. */
export function insidersStepValid(draft: LaunchDraft): string | null {
  if (!draft.presaleEnabled) return null;
  const insiderTime = localToUnix(draft.presaleInsiderTime);
  const launchTime = localToUnix(draft.presaleLaunchTime);
  if (!insiderTime || !launchTime) return "Set insider buys start and public launch.";
  if (launchTime <= insiderTime) return "Public launch must come after insider buys start.";
  if (draft.presaleInsiderBps < 0 || draft.presaleInsiderBps > 10000) return "Insider Max is 0-100% of supply.";
  if (draft.presaleLockedInsiderBps > 0 && draft.presaleLockedInsiderBps < draft.presaleInsiderBps) {
    return "LP provider bonus must be at least Insider Max.";
  }
  const col = draft.presaleCollection.trim();
  const schema = draft.presaleSchema.trim();
  if (col || schema) {
    if (!col || !schema) return "NFT needs both AtomicAssets collection and schema.";
    if (!validAccount(col) || !validAccount(schema)) return "AtomicAssets collection and schema must be account names.";
  }
  const minQty = draft.presaleMinTokenQty.trim();
  const minContract = draft.presaleMinTokenContract.trim();
  if (minQty && !minContract) return "Min Hold quantity needs a contract.";
  if (minContract && !validAccount(minContract)) return "Min Hold contract is not a valid account.";
  if (draft.presaleLockSecs > PRESALE_LOCK_MAX_SECS) {
    return "Insider LP lock days must be at least 3 days shorter than the 90d main lock.";
  }
  if ((draft.presaleLockedLpMin > 0 || draft.presaleLockedInsiderBps > 0) && draft.presaleLockSecs <= 0) {
    return "LP provider bonus needs Insider LP lock days.";
  }
  return inviteListError(draft.presaleInviteList);
}

export function setpresaleArgsFromDraft(draft: LaunchDraft): SetPresaleArgs {
  return {
    launchTime: localToUnix(draft.presaleLaunchTime),
    insiderTime: localToUnix(draft.presaleInsiderTime),
    mode: 1,
    insiderBps: draft.presaleInsiderBps,
    lockedInsiderBps: draft.presaleLockedInsiderBps,
    collection: draft.presaleCollection,
    schema: draft.presaleSchema,
    nftMin: draft.presaleNftMin,
    minTokenQuantity: draft.presaleMinTokenQty,
    minTokenContract: draft.presaleMinTokenContract,
    lpMin: draft.presaleLpMin,
    lockedLpMin: draft.presaleLockedLpMin,
    lockSecs: draft.presaleLockSecs,
  };
}

export function clubSignActions(tokenContract: string, tokenSymbol: string, draft: LaunchDraft): ChainAction[] {
  const actions: ChainAction[] = [setpresaleAction(tokenContract, tokenSymbol, setpresaleArgsFromDraft(draft))];
  const names = parseInviteAccounts(draft.presaleInviteList);
  if (names.length) actions.push(addinsidersAction(tokenContract, tokenSymbol, names.join(",")));
  return actions;
}

export type ClubMark = "insider" | "proven";

export function clubMarkOf(row: Record<string, unknown> | null | undefined): ClubMark | null {
  if (!row) return null;
  const approved = Boolean(row.approved);
  if (!approved) return null;
  return Number(row.locked_pos ?? 0) > 0 ? "proven" : "insider";
}

export function clubKey(contract: string, symbol: string, account: string): string {
  return `${contract.toLowerCase()}:${symbol.toUpperCase()}:${account.toLowerCase()}`;
}

export async function loadClubMarks(
  rooms: Array<{ contract: string; symbol: string }>
): Promise<Record<string, ClubMark>> {
  const unique = new Map<string, { contract: string; symbol: string }>();
  for (const r of rooms) {
    const c = r.contract.trim().toLowerCase();
    const s = r.symbol.trim().toUpperCase();
    if (!c || !s) continue;
    unique.set(`${c}:${s}`, { contract: c, symbol: s });
  }
  const out: Record<string, ClubMark> = {};
  await Promise.all(
    [...unique.values()].map(async ({ contract, symbol }) => {
      const rows = await readInsiders(contract, symbol, 500).catch(() => [] as Record<string, unknown>[]);
      for (const row of rows) {
        const mark = clubMarkOf(row);
        const account = String(row.account ?? "").toLowerCase();
        if (!mark || !account) continue;
        out[clubKey(contract, symbol, account)] = mark;
      }
    })
  );
  return out;
}
