import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { assetAmountNumber, parseAsset, validAccount } from "@/services/assets";
import { marksCacheKey } from "@/services/cacheKeys";
import { readInsiders } from "@/services/flexTables";
import { liveOr } from "@/services/readThrough";
import { addinsidersAction, setpresaleAction, type ChainAction, type SetPresaleArgs } from "@/services/launchActions";

/** lock_secs + 3d must stay under the 91-day wizard lock. */
export const PRESALE_LOCK_MAX_SECS = 88 * 24 * 60 * 60;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local wall time, including seconds, so a unix value round-trips in this timezone. */
export function unixToLocal(unix: number): string {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Datetime-local is parsed as this browser's timezone. A digit string is unix seconds. */
export function localToUnix(value: string): number {
  const raw = value.trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  }
  const t = Date.parse(raw);
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

/** setpresale is open while launches.launched is false, even after a presale liftoff. */
export function presaleAdjustState(launched: boolean, hasRow: boolean): "open" | "sealed" | "missed" {
  if (!launched) return "open";
  return hasRow ? "sealed" : "missed";
}

export type PresaleAdjust = {
  insiderTime: string;
  launchTime: string;
  mode: number;
  insiderBps: number;
  lockedInsiderBps: number;
  collection: string;
  schema: string;
  nftMin: number;
  minTokenQty: string;
  minTokenContract: string;
  lpMin: number;
  lockSecs: number;
  lockedLpMin: number;
  needKyc: boolean;
  gatesAll: boolean;
  inviteList: string;
};

/** Contract checks for setpresale. Times may move earlier while the row is still writable. */
export function presaleAdjustError(form: PresaleAdjust): string | null {
  const insiderTime = localToUnix(form.insiderTime);
  const launchTime = localToUnix(form.launchTime);
  if (!insiderTime || !launchTime) return "Set insider buys start and public launch.";
  if (launchTime <= insiderTime) return "Public launch must come after insider buys start.";
  if (form.mode < 0 || form.mode > 3 || !Number.isInteger(form.mode)) return "Mode is 0-3.";
  if (
    form.insiderBps < 0 ||
    form.insiderBps > 10000 ||
    form.lockedInsiderBps < 0 ||
    form.lockedInsiderBps > 10000
  ) {
    return "Caps are 0-100% of supply.";
  }
  if (form.lockedInsiderBps > 0 && form.lockedInsiderBps < form.insiderBps) {
    return "LP provider bonus must be at least Insider Max.";
  }
  const col = form.collection.trim();
  const schema = form.schema.trim();
  if ((col && !schema) || (!col && schema)) return "NFT needs both AtomicAssets collection and schema.";
  if ((col && !validAccount(col)) || (schema && !validAccount(schema))) {
    return "AtomicAssets collection and schema must be account names.";
  }
  const minQty = form.minTokenQty.trim();
  const minContract = form.minTokenContract.trim();
  if (minQty) {
    if (!parseAsset(minQty)) return "Min Hold needs a quantity like 1.000000 EASY.";
    if (assetAmountNumber(minQty) > 0) {
      if (!minContract) return "Min Hold quantity needs a contract.";
      if (!validAccount(minContract)) return "Min Hold contract is not a valid account.";
    }
  } else if (minContract && !validAccount(minContract)) {
    return "Min Hold contract is not a valid account.";
  }
  if ((form.lockedLpMin > 0 || form.lockSecs > 0) && form.lockSecs > PRESALE_LOCK_MAX_SECS) {
    return "Insider LP lock days must be at least 3 days shorter than the 91-day main lock.";
  }
  return inviteListError(form.inviteList);
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
    return "Insider LP lock days must be at least 3 days shorter than the 91-day main lock.";
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
    needKyc: draft.presaleNeedKyc,
    gatesAll: draft.presaleGatesAll,
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

export function rowForAccount(rows: Record<string, unknown>[], actor: string) {
  const want = actor.trim().toLowerCase();
  if (!want) return null;
  return rows.find((r) => String(r.account ?? "").toLowerCase() === want) ?? null;
}

export function actorClubMark(rows: Record<string, unknown>[], actor: string): ClubMark | null {
  return clubMarkOf(rowForAccount(rows, actor));
}

export function clubKey(contract: string, symbol: string, account: string): string {
  return `${contract.toLowerCase()}:${symbol.toUpperCase()}:${account.toLowerCase()}`;
}

export async function loadClubMarksFresh(contract: string, symbol: string): Promise<Record<string, ClubMark>> {
  const code = contract.trim().toLowerCase();
  const sym = symbol.trim().toUpperCase();
  const rows = await readInsiders(code, sym, 500).catch(() => [] as Record<string, unknown>[]);
  const out: Record<string, ClubMark> = {};
  for (const row of rows) {
    const mark = clubMarkOf(row);
    const account = String(row.account ?? "").toLowerCase();
    if (!mark || !account) continue;
    out[clubKey(code, sym, account)] = mark;
  }
  return out;
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
  const parts = await Promise.all(
    [...unique.values()].map(({ contract, symbol }) =>
      liveOr(marksCacheKey(contract, symbol), () => loadClubMarksFresh(contract, symbol))
    )
  );
  return Object.assign({}, ...parts);
}
