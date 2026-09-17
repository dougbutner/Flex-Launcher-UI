import { getTableRows } from "@/services/rpc";

export type ProtonProfile = {
  acc: string;
  name: string;
  avatar: string;
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
    };
    cache.set(acc, { at: now, profile });
    return profile;
  } catch {
    cache.set(acc, { at: now, profile: null });
    return null;
  }
}
