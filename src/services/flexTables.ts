import {
  EOSIO_TOKEN,
  SWAP_ALCOR,
  XPR_SYMBOL,
  XTOKENS,
} from "@/config/launch";
import { assetAmountNumber, parseAsset } from "@/services/assets";
import { symbolCodeToU64 } from "@/services/eosioName";
import { getAllTableRows, getCurrencyBalance, getTableRows } from "@/services/rpc";

/** Numeric primary key for tables keyed by symbol_code.raw() (launches, settings, accounts, balances). */
function codeBound(symbol?: string): string | undefined {
  return symbol ? symbolCodeToU64(symbol).toString() : undefined;
}

export async function readXprBalance(account: string): Promise<number> {
  const rows = await getCurrencyBalance(EOSIO_TOKEN, account, XPR_SYMBOL);
  return rows.reduce((sum, row) => sum + assetAmountNumber(row), 0);
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

export async function readLaunch(code: string, symbol: string) {
  const { rows } = await getTableRows<Record<string, unknown>>({
    code,
    scope: code,
    table: "launches",
    lower_bound: codeBound(symbol),
    upper_bound: codeBound(symbol),
    key_type: "i64",
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function readSettings(code: string, symbol: string) {
  const { rows } = await getTableRows<Record<string, unknown>>({
    code,
    scope: symbol,
    table: "settings",
    lower_bound: codeBound(symbol),
    upper_bound: codeBound(symbol),
    key_type: "i64",
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function readStat(code: string, symbol: string) {
  const { rows } = await getTableRows<Record<string, unknown>>({
    code,
    scope: symbol,
    table: "stat",
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function readLaunches(code: string, limit = 200) {
  return getAllTableRows<Record<string, unknown>>(
    { code, scope: code, table: "launches", limit: 100 },
    limit
  );
}

export async function readFlexers(code: string, symbol: string, limit = 200) {
  return getAllTableRows<Record<string, unknown>>(
    { code, scope: symbol, table: "flexers", limit: 100 },
    limit
  );
}

/** Scope = symbol code. PK = Alcor pool id. */
export async function readFlexpools(code: string, symbol: string, limit = 100) {
  return getAllTableRows<Record<string, unknown>>(
    { code, scope: symbol, table: "flexpools", limit: 50 },
    limit
  );
}

export async function readAccounts(code: string, owner: string, symbol?: string) {
  return getTableRows<Record<string, unknown>>({
    code,
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

export async function quoteProofOk(
  poolId: number,
  quoteSymbol: string,
  quoteContract: string
): Promise<{ ok: boolean; reason: string }> {
  if (!(poolId > 0)) return { ok: false, reason: "Proof pool id must be greater than zero." };
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
  const hasQuote = pair.some((t) => t.contract === quoteContract && t.symbol === quoteSymbol);
  const other = pair.find(
    (t) => (t.contract === XTOKENS && t.symbol === "XUSDC") || (t.contract === EOSIO_TOKEN && t.symbol === "XPR")
  );
  if (!hasQuote || !other) return { ok: false, reason: "Proof pool must pair this quote with XUSDC or XPR." };
  if (!pool.active) return { ok: false, reason: "Proof pool is not active." };
  const inv = await getCurrencyBalance(quoteContract, SWAP_ALCOR, quoteSymbol);
  const amount = inv.reduce((s, row) => s + assetAmountNumber(row), 0);
  if (other.symbol === "XUSDC" && amount >= 10) return { ok: true, reason: "Inventory looks sufficient vs XUSDC." };
  if (other.symbol === "XPR" && amount >= 1000) return { ok: true, reason: "Inventory looks sufficient vs XPR." };
  return {
    ok: true,
    reason: `Pair is valid (pool active). On-chain still requires ≥ 10 XUSDC or ≥ 1,000 XPR of valued inventory - ${amount} ${quoteSymbol} on swap.alcor may be too thin.`,
  };
}

/** @deprecated use quoteProofOk */
export async function xtokenProofOk(poolId: number, xtokenSymbol: string): Promise<{ ok: boolean; reason: string }> {
  return quoteProofOk(poolId, xtokenSymbol, XTOKENS);
}
