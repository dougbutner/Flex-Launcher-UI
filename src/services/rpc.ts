import { HYPERION_ENDPOINTS, RPC_ENDPOINTS } from "@/config/launch";
import { safeScopeName } from "@/services/eosioName";

const UA = { "Content-Type": "application/json" };

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function rpcPost<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  let last = "RPC failed";
  for (let i = 0; i < RPC_ENDPOINTS.length; i++) {
    const url = `${RPC_ENDPOINTS[i % RPC_ENDPOINTS.length]}${path}`;
    try {
      const res = await fetch(url, { method: "POST", headers: UA, body: JSON.stringify(body) });
      if (res.status === 429 || res.status === 503) {
        await sleep(Math.min(8000, 1000 * 2 ** i));
        continue;
      }
      const data = (await res.json()) as T & { error?: { what?: string; details?: Array<{ message?: string }> } };
      if (!res.ok) {
        last = data?.error?.details?.[0]?.message || data?.error?.what || res.statusText;
        continue;
      }
      return data;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(last);
}

export async function getTableRows<T = Record<string, unknown>>(args: {
  code: string;
  table: string;
  scope: string;
  limit?: number;
  lower_bound?: string | number;
  upper_bound?: string | number;
  index_position?: string;
  key_type?: string;
  reverse?: boolean;
}): Promise<{ rows: T[]; more: boolean; next_key: string }> {
  const data = await rpcPost<{ rows?: T[]; more?: boolean; next_key?: string }>("/v1/chain/get_table_rows", {
    json: true,
    limit: args.limit ?? 100,
    code: args.code,
    table: args.table,
    scope: safeScopeName(String(args.scope)),
    lower_bound: args.lower_bound,
    upper_bound: args.upper_bound,
    index_position: args.index_position,
    key_type: args.key_type,
    reverse: args.reverse,
  });
  return { rows: data.rows ?? [], more: Boolean(data.more), next_key: data.next_key ?? "" };
}

export async function getAllTableRows<T = Record<string, unknown>>(
  args: Parameters<typeof getTableRows>[0],
  max = 500
): Promise<T[]> {
  const rows: T[] = [];
  let lower: string | number | undefined = args.lower_bound;
  for (;;) {
    const page = await getTableRows<T>({ ...args, lower_bound: lower, limit: Math.min(args.limit ?? 100, max - rows.length) });
    rows.push(...page.rows);
    if (!page.more || rows.length >= max || !page.next_key) break;
    lower = page.next_key;
  }
  return rows;
}

export async function getInfo() {
  return rpcPost<{ chain_id?: string; head_block_num?: number }>("/v1/chain/get_info", {});
}

export async function getAbi(accountName: string) {
  const data = await rpcPost<{ abi?: { actions?: Array<{ name: string }> } }>("/v1/chain/get_abi", {
    account_name: accountName,
  });
  return data.abi ?? { actions: [] };
}

export async function getAccount(name: string) {
  return rpcPost<{
    account_name?: string;
    ram_quota?: number;
    ram_usage?: number;
    core_liquid_balance?: string;
    error?: unknown;
  }>("/v1/chain/get_account", { account_name: name });
}

export async function getCurrencyBalance(code: string, account: string, symbol?: string): Promise<string[]> {
  const data = await rpcPost<string[] | { error?: unknown }>("/v1/chain/get_currency_balance", {
    code,
    account,
    symbol,
  });
  return Array.isArray(data) ? data : [];
}

export async function getCurrencyStats(code: string, symbol: string) {
  return rpcPost<Record<string, { supply: string; max_supply: string; issuer: string }>>(
    "/v1/chain/get_currency_stats",
    { code, symbol }
  );
}

export type HyperionAction = {
  "@timestamp"?: string;
  timestamp?: string;
  trx_id?: string;
  act?: { account: string; name: string; data?: Record<string, unknown> };
};

export async function getTransaction(id: string): Promise<Record<string, unknown>> {
  let last = "get_transaction failed";
  const q = new URLSearchParams({ id });
  for (const base of HYPERION_ENDPOINTS) {
    try {
      const res = await fetch(`${base}/v2/history/get_transaction?${q}`);
      if (res.status === 429 || res.status === 503) continue;
      if (!res.ok) {
        last = res.statusText;
        continue;
      }
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(last);
}

export async function getActions(params: {
  account: string;
  filter?: string;
  limit?: number;
  skip?: number;
}): Promise<{ actions: HyperionAction[]; total: number }> {
  let last = "Hyperion failed";
  const q = new URLSearchParams({
    account: params.account,
    limit: String(params.limit ?? 50),
    sort: "desc",
  });
  if (params.filter) q.set("filter", params.filter);
  if (params.skip) q.set("skip", String(params.skip));
  for (const base of HYPERION_ENDPOINTS) {
    try {
      const res = await fetch(`${base}/v2/history/get_actions?${q}`);
      if (res.status === 429 || res.status === 503) continue;
      if (!res.ok) {
        last = res.statusText;
        continue;
      }
      const data = (await res.json()) as { actions?: HyperionAction[]; total?: { value?: number } | number };
      const total = typeof data.total === "number" ? data.total : data.total?.value ?? 0;
      return { actions: data.actions ?? [], total };
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(last);
}

export async function getTokens(account: string): Promise<Array<{ symbol: string; amount: string; contract: string; decimals?: number }>> {
  let last = "get_tokens failed";
  for (const base of HYPERION_ENDPOINTS) {
    try {
      const res = await fetch(`${base}/v2/state/get_tokens?account=${encodeURIComponent(account)}`);
      if (!res.ok) {
        last = res.statusText;
        continue;
      }
      const data = (await res.json()) as { tokens?: Array<{ symbol: string; amount: string; contract: string; decimals?: number }> };
      return data.tokens ?? [];
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(last);
}
