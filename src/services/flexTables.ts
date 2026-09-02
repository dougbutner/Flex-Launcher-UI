import {
  EOSIO_TOKEN,
  FLEXFOREX_CONTRACT,
  SWAP_ALCOR,
  XPR_SYMBOL,
  XTOKENS,
} from "@/config/launch";
import { assetAmountNumber, parseAsset } from "@/services/assets";
import { symbolCodeToU64 } from "@/services/eosioName";
import { getAccount, getAllTableRows, getCurrencyBalance, getTableRows } from "@/services/rpc";

/** Numeric primary key for tables keyed by symbol_code.raw() (launches, settings, accounts, balances). */
function codeBound(symbol?: string): string | undefined {
  return symbol ? symbolCodeToU64(symbol).toString() : undefined;
}

export async function readXprBalance(account: string): Promise<number> {
  const rows = await getCurrencyBalance(EOSIO_TOKEN, account, XPR_SYMBOL);
  return rows.reduce((sum, row) => sum + assetAmountNumber(row), 0);
}

export async function readContractRam(account = FLEXFOREX_CONTRACT) {
  try {
    const info = await getAccount(account);
    if (!info.account_name && info.ram_quota == null) return null;
    return { quota: info.ram_quota ?? 0, usage: info.ram_usage ?? 0 };
  } catch {
    return null;
  }
}

export async function readAlcorSystem() {
  const { rows } = await getTableRows<{
    id: number;
    active?: number;
    poolIdCounter?: number;
    activeFee?: { quantity: string; contract: string };
  }>({ code: SWAP_ALCOR, scope: SWAP_ALCOR, table: "system", limit: 1 });
  return rows[0] ?? null;
}

export async function readLaunch(symbol: string) {
  const { rows } = await getTableRows<Record<string, unknown>>({
    code: FLEXFOREX_CONTRACT,
    scope: FLEXFOREX_CONTRACT,
    table: "launches",
    lower_bound: codeBound(symbol),
    upper_bound: codeBound(symbol),
    key_type: "i64",
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function readSettings(symbol: string) {
  const { rows } = await getTableRows<Record<string, unknown>>({
    code: FLEXFOREX_CONTRACT,
    scope: FLEXFOREX_CONTRACT,
    table: "settings",
    lower_bound: codeBound(symbol),
    upper_bound: codeBound(symbol),
    key_type: "i64",
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function readStat(symbol: string) {
  const { rows } = await getTableRows<Record<string, unknown>>({
    code: FLEXFOREX_CONTRACT,
    scope: symbol,
    table: "stat",
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function readLaunches(limit = 200) {
  return getAllTableRows<Record<string, unknown>>(
    { code: FLEXFOREX_CONTRACT, scope: FLEXFOREX_CONTRACT, table: "launches", limit: 100 },
    limit
  );
}

export async function readFlexers(symbol: string, limit = 200) {
  return getAllTableRows<Record<string, unknown>>(
    { code: FLEXFOREX_CONTRACT, scope: symbol, table: "flexers", limit: 100 },
    limit
  );
}

export async function readAccounts(owner: string, symbol?: string) {
  return getTableRows<Record<string, unknown>>({
    code: FLEXFOREX_CONTRACT,
    scope: owner,
    table: "accounts",
    limit: 50,
    lower_bound: codeBound(symbol),
    upper_bound: codeBound(symbol),
    key_type: symbol ? "i64" : undefined,
  });
}

export async function findPool(tokenA: { symbol: string; contract: string }, tokenB: { symbol: string; contract: string }, fee: number) {
  const { rows } = await getTableRows<Record<string, unknown>>({
    code: SWAP_ALCOR,
    scope: SWAP_ALCOR,
    table: "pools",
    limit: 1,
    reverse: true,
  });
  const sys = await readAlcorSystem();
  const counter = Number(sys?.poolIdCounter ?? 0);
  const start = Math.max(0, counter - 30);
  for (let id = counter; id >= start; id--) {
    const { rows: poolRows } = await getTableRows<Record<string, unknown>>({
      code: SWAP_ALCOR,
      scope: SWAP_ALCOR,
      table: "pools",
      lower_bound: id,
      upper_bound: id,
      limit: 1,
    });
    const p = poolRows[0];
    if (!p) continue;
    const a = p.tokenA as { quantity?: string; contract?: string } | undefined;
    const b = p.tokenB as { quantity?: string; contract?: string } | undefined;
    const aSym = parseAsset(a?.quantity ?? "")?.symbol;
    const bSym = parseAsset(b?.quantity ?? "")?.symbol;
    if (Number(p.fee) === fee && a?.contract === tokenA.contract && b?.contract === tokenB.contract && aSym === tokenA.symbol && bSym === tokenB.symbol) {
      return { ...p, id: Number(p.id ?? id) };
    }
  }
  return rows[0] ? { ...rows[0], id: Number(rows[0].id) } : null;
}

export async function readPool(poolId: number) {
  const { rows } = await getTableRows<Record<string, unknown>>({
    code: SWAP_ALCOR,
    scope: SWAP_ALCOR,
    table: "pools",
    lower_bound: poolId,
    upper_bound: poolId,
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function readPositions(poolId: number) {
  return getAllTableRows<Record<string, unknown>>(
    { code: SWAP_ALCOR, scope: String(poolId), table: "positions", limit: 100 },
    200
  );
}

export async function readLock(posId: number) {
  const { rows } = await getTableRows<Record<string, unknown>>({
    code: SWAP_ALCOR,
    scope: SWAP_ALCOR,
    table: "locks",
    lower_bound: posId,
    upper_bound: posId,
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function readAlcorBalance(owner: string, symbol?: string) {
  return getTableRows<Record<string, unknown>>({
    code: SWAP_ALCOR,
    scope: owner,
    table: "balances",
    limit: 50,
    lower_bound: codeBound(symbol),
    upper_bound: codeBound(symbol),
    key_type: symbol ? "i64" : undefined,
  });
}

export async function xtokenProofOk(poolId: number, xtokenSymbol: string): Promise<{ ok: boolean; reason: string }> {
  const pool = await readPool(poolId);
  if (!pool) return { ok: false, reason: "Proof pool not found." };
  const tokenA = pool.tokenA as { quantity?: string; contract?: string };
  const tokenB = pool.tokenB as { quantity?: string; contract?: string };
  const a = parseAsset(tokenA?.quantity ?? "");
  const b = parseAsset(tokenB?.quantity ?? "");
  const pair = [
    { symbol: a?.symbol, contract: tokenA?.contract },
    { symbol: b?.symbol, contract: tokenB?.contract },
  ];
  const hasXt = pair.some((t) => t.contract === XTOKENS && t.symbol === xtokenSymbol);
  const quote = pair.find((t) => (t.contract === XTOKENS && t.symbol === "XUSDC") || (t.contract === EOSIO_TOKEN && t.symbol === "XPR"));
  if (!hasXt || !quote) return { ok: false, reason: "Proof pool must pair this xtoken with XUSDC or XPR." };
  const inv = await getCurrencyBalance(XTOKENS, SWAP_ALCOR, xtokenSymbol);
  const amount = inv.reduce((s, row) => s + assetAmountNumber(row), 0);
  if (quote.symbol === "XUSDC" && amount >= 10) return { ok: true, reason: "Inventory looks sufficient vs XUSDC." };
  if (quote.symbol === "XPR" && amount >= 1000) return { ok: true, reason: "Inventory looks sufficient vs XPR." };
  return { ok: false, reason: "Alcor inventory of this xtoken is below 10 XUSDC or 1,000 XPR." };
}
