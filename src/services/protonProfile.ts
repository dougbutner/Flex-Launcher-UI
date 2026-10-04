import { getTableRows } from "@/services/rpc";

export type ProtonProfile = {
  acc: string;
  name: string;
  avatar: string;
  verified: boolean;
};

const cache = new Map<string, { at: number; profile: ProtonProfile | null }>();
const TTL = 5 * 60_000;

export async function readProtonProfile(account: string): Promise<ProtonProfile | null> {
  const acc = account.trim().toLowerCase();
  if (!acc) return null;
  const hit = cache.get(acc);
  const now = Date.now();
  if (hit && now - hit.at < TTL) return hit.profile;
  try {
    const { rows } = await getTableRows<Record<string, unknown>>({
      code: "eosio.proton",
      scope: "eosio.proton",
      table: "usersinfo",
      lower_bound: acc,
      upper_bound: acc,
      limit: 1,
    });
    const row = rows[0];
    if (!row || String(row.acc ?? "").toLowerCase() !== acc) {
      cache.set(acc, { at: now, profile: null });
      return null;
    }
    const profile: ProtonProfile = {
      acc,
      name: String(row.name ?? ""),
      avatar: String(row.avatar ?? ""),
      verified: Boolean(row.verified),
    };
    cache.set(acc, { at: now, profile });
    return profile;
  } catch {
    cache.set(acc, { at: now, profile: null });
    return null;
  }
}

export async function readProtonVerified(account: string): Promise<boolean> {
  const profile = await readProtonProfile(account);
  return Boolean(profile?.verified);
}

/** Accounts in `accounts` with `usersinfo.verified`. */
export async function readVerifiedAccounts(
  accounts: readonly string[],
  signal?: AbortSignal,
  onProgress?: (read: number) => void
): Promise<Set<string>> {
  const have = new Set<string>();
  let done = 0;
  for (let i = 0; i < accounts.length; i += 10) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const slice = accounts.slice(i, i + 10);
    const found = await Promise.all(
      slice.map(async (account) => {
        const acc = account.trim().toLowerCase();
        const { rows } = await getTableRows<Record<string, unknown>>({
          code: "eosio.proton",
          scope: "eosio.proton",
          table: "usersinfo",
          lower_bound: acc,
          upper_bound: acc,
          limit: 1,
        });
        const row = rows[0];
        return row && String(row.acc ?? "").toLowerCase() === acc && Boolean(row.verified) ? account : "";
      })
    );
    for (const account of found) if (account) have.add(account);
    done += slice.length;
    onProgress?.(done);
  }
  return have;
}
