import {
  EOSIO_TOKEN,
  LOAN_SYMBOL,
  LOAN_TOKEN,
  programFromAccount,
  PROJECT_CORE_TOKENS,
  QUOTE_PRESETS,
  XPR_PRECISION,
  XPR_SYMBOL,
  XTOKENS,
} from "@/config/launch";
import { formatSupplyCommas, parseAsset, parseSupplyInput, validAccount, validSymbol } from "@/services/assets";
import type { ChainAction } from "@/services/launchActions";
import { rpcPost } from "@/services/rpc";

/** Chain transfer memo cap (easyflex, complexflex, flexforex, and the core token contracts). */
export const MEMO_MAX_BYTES = 256;
export const AIRDROP_BATCH = 100;
export const AIRDROP_MIN_ACCOUNTS = 100;
export const AIRDROP_MAX_ACCOUNTS = 10_000;
/** Light API `topholders` rejects counts outside 10-1000. */
export const LIGHT_API_MAX = 1000;
const CHAIN_ROW_CAP = 12_000;

/** EOSUSA chain + Hyperion. RAM, balances, tax, and flexer rows go here first. */
const EOSUSA = "https://proton.eosusa.io";
/**
 * Holder ranks. EOSUSA does not serve `/api/topholders` (that path 404s).
 * Light API is the ranked list. Chain reads stay on EOSUSA.
 */
const LIGHT_BASES = ["https://lightapi.eosamsterdam.net", "https://api.light.xeos.me"];

/** Plain eosio.token-style assets the airdrop can send, besides flex and the four core tokens. */
const SEND_EXTRAS = [
  { contract: EOSIO_TOKEN, symbol: XPR_SYMBOL, precision: XPR_PRECISION },
  { contract: LOAN_TOKEN, symbol: LOAN_SYMBOL, precision: 4 },
  { contract: XTOKENS, symbol: "METAL", precision: 8 },
] as const;

/** Plain transfers to these accounts fail or park the tokens. */
export const SKIP_ACCOUNTS = ["swap.alcor", "alcor", "eosio", "eosio.token", "eosio.proton"] as const;

const CORE_PRECISION = new Map<string, number>([
  ...QUOTE_PRESETS.filter((q) => q.flexQuote).map((q) => [`${q.contract}:${q.symbol}`, q.precision] as const),
  ...SEND_EXTRAS.map((q) => [`${q.contract}:${q.symbol}`, q.precision] as const),
]);

export type DropMode = "uniform" | "proportional";

export type AirdropHolder = {
  account: string;
  weightRaw: bigint;
};

export type PlannedDrop = AirdropHolder & { amountRaw: bigint };

export type TaxBps = { reflection: number; burn: number; project: number };

export type IssuedRef = { contract: string; symbol: string; precision: number };

export type WalletDrop = IssuedRef & { balanceRaw: bigint; owned: boolean };

export function tokenKey(contract: string, symbol: string): string {
  return `${contract}:${symbol.trim().toUpperCase()}`;
}

export function isDroppableToken(contract: string, symbol: string): boolean {
  const code = contract.trim();
  const sym = symbol.trim().toUpperCase();
  if (!validSymbol(sym)) return false;
  if (programFromAccount(code)) return true;
  if (PROJECT_CORE_TOKENS.some((t) => t.contract === code && t.symbol === sym)) return true;
  return SEND_EXTRAS.some((t) => t.contract === code && t.symbol === sym);
}

/** Flexer book we can walk on EOSUSA. XPR, LOAN, and METAL have no such table. */
function walksFlexers(contract: string): boolean {
  return Boolean(programFromAccount(contract)) || PROJECT_CORE_TOKENS.some((t) => t.contract === contract);
}

/** Legacy single-token contracts scope flexers and settings by the account. Newer flex scopes by symbol. */
export function holderTableScope(contract: string, symbol: string): string {
  const code = contract.trim().toLowerCase();
  if (PROJECT_CORE_TOKENS.some((t) => t.contract === code)) return code;
  return symbol.trim().toUpperCase();
}

export function corePrecision(contract: string, symbol: string): number | null {
  return CORE_PRECISION.get(tokenKey(contract, symbol)) ?? null;
}

/** Bytes to open a new balance plus holder row. Conservative, so the estimate stays under the real bill. */
export function ramPerNewHolder(contract: string): number {
  const program = programFromAccount(contract);
  if (program === "flexforex") return 480;
  if (program === "complexflex") return 320;
  if (program === "easyflex") return 280;
  if (contract === EOSIO_TOKEN || contract === LOAN_TOKEN || contract === XTOKENS) return 124;
  return 360;
}

export function holdersFitInRam(freeBytes: number, perHolder: number): number {
  if (!Number.isFinite(freeBytes) || freeBytes <= 0 || perHolder <= 0) return 0;
  return Math.floor(freeBytes / perHolder);
}

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function clampMemo(input: string, max = MEMO_MAX_BYTES): string {
  if (utf8Bytes(input) <= max) return input;
  let out = "";
  for (const ch of input) {
    if (utf8Bytes(out + ch) > max) break;
    out += ch;
  }
  return out;
}

export function parseAccountCount(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < AIRDROP_MIN_ACCOUNTS || n > AIRDROP_MAX_ACCOUNTS) return null;
  return n;
}

export function decimalToRaw(amount: string, precision: number): bigint {
  const p = Math.max(0, Math.min(8, Math.floor(precision) || 0));
  const cleaned = amount.trim().replace(/,/g, "");
  const neg = cleaned.startsWith("-");
  const body = neg ? cleaned.slice(1) : cleaned;
  const [iRaw, fRaw = ""] = body.split(".");
  const i = (iRaw || "0").replace(/\D/g, "") || "0";
  const frac = (fRaw.replace(/\D/g, "") + "0".repeat(p)).slice(0, p);
  const raw = BigInt(i) * 10n ** BigInt(p) + BigInt(frac || "0");
  return neg ? -raw : raw;
}

export function budgetToRaw(input: string, precision: number): bigint | null {
  const cleaned = parseSupplyInput(input);
  if (!cleaned || cleaned === ".") return null;
  const raw = decimalToRaw(cleaned, precision);
  return raw > 0n ? raw : null;
}

export function formatRaw(raw: bigint, precision: number, symbol: string): string {
  const neg = raw < 0n;
  const v = neg ? -raw : raw;
  const p = Math.max(0, Math.min(8, Math.floor(precision) || 0));
  const scale = 10n ** BigInt(p);
  const whole = v / scale;
  const frac = p > 0 ? `.${(v % scale).toString().padStart(p, "0")}` : "";
  return `${neg ? "-" : ""}${whole.toString()}${frac} ${symbol}`;
}

export function formatRawPretty(raw: bigint, precision: number, symbol: string): string {
  const asset = formatRaw(raw, precision, symbol);
  const parsed = parseAsset(asset);
  if (!parsed) return asset;
  return `${formatSupplyCommas(parsed.amount)} ${parsed.symbol}`;
}

export function keepHolder(account: string, sender: string, contracts: readonly string[]): boolean {
  const name = account.trim();
  if (!validAccount(name)) return false;
  if (name === sender) return false;
  if ((SKIP_ACCOUNTS as readonly string[]).includes(name)) return false;
  if (contracts.includes(name)) return false;
  return true;
}

export function byHoldingDesc(a: AirdropHolder, b: AirdropHolder): number {
  if (a.weightRaw > b.weightRaw) return -1;
  if (a.weightRaw < b.weightRaw) return 1;
  return a.account.localeCompare(b.account);
}

/**
 * Light API page is full of positive balances and still short of `want`
 * (after skips). A short page, or a zero balance, means there is nobody larger left.
 */
export function needMoreHolders(want: number, requested: number, raw: AirdropHolder[], filteredCount: number): boolean {
  if (filteredCount >= want) return false;
  if (raw.length < requested) return false;
  const positive = raw.filter((h) => h.weightRaw > 0n).length;
  if (positive < raw.length) return false;
  return true;
}

export function planDrop(mode: DropMode, budgetRaw: bigint, holders: AirdropHolder[]): PlannedDrop[] {
  if (budgetRaw <= 0n || holders.length === 0) {
    return holders.map((h) => ({ ...h, amountRaw: 0n }));
  }
  if (mode === "uniform") {
    const each = budgetRaw / BigInt(holders.length);
    return holders.map((h) => ({ ...h, amountRaw: each }));
  }
  const total = holders.reduce((sum, h) => sum + (h.weightRaw > 0n ? h.weightRaw : 0n), 0n);
  if (total <= 0n) return holders.map((h) => ({ ...h, amountRaw: 0n }));
  return holders.map((h) => ({
    ...h,
    amountRaw: h.weightRaw > 0n ? (budgetRaw * h.weightRaw) / total : 0n,
  }));
}

export function batchOf<T>(rows: T[], index: number, size = AIRDROP_BATCH): T[] {
  const start = Math.max(0, index) * size;
  return rows.slice(start, start + size);
}

export function batchCount(total: number, size = AIRDROP_BATCH): number {
  if (total <= 0) return 0;
  return Math.ceil(total / size);
}

/** Wallet-to-wallet tax is added on top, one bucket at a time, same integer division as transfer. */
export function debitForSend(amountRaw: bigint, tax: TaxBps, optedOut: boolean): bigint {
  if (amountRaw <= 0n) return 0n;
  if (optedOut) return amountRaw;
  const ref = (amountRaw * BigInt(tax.reflection)) / 10000n;
  const burn = (amountRaw * BigInt(tax.burn)) / 10000n;
  const project = (amountRaw * BigInt(tax.project)) / 10000n;
  return amountRaw + ref + burn + project;
}

export function sortOwnedFirst<T extends { owned: boolean; symbol: string; contract: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.owned !== b.owned) return a.owned ? -1 : 1;
    const sym = a.symbol.localeCompare(b.symbol);
    if (sym) return sym;
    return a.contract.localeCompare(b.contract);
  });
}

export function airdropTransfers(args: {
  contract: string;
  from: string;
  precision: number;
  symbol: string;
  memo: string;
  rows: Array<{ account: string; amountRaw: bigint }>;
}): ChainAction[] {
  const memo = clampMemo(args.memo);
  return args.rows
    .filter((row) => row.amountRaw > 0n && keepHolder(row.account, args.from, [args.contract]))
    .map((row) => ({
      account: args.contract,
      name: "transfer",
      data: {
        from: args.from,
        to: row.account,
        quantity: formatRaw(row.amountRaw, args.precision, args.symbol),
        memo,
      },
    }));
}

type TablePage = { rows?: Array<Record<string, unknown>>; more?: boolean; next_key?: string };

async function eosusaPost<T>(path: string, body: unknown): Promise<T> {
  try {
    const res = await fetch(`${EOSUSA}${path}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as T;
  } catch {
    /* fall through to the shared RPC list */
  }
  return rpcPost<T>(path, body);
}

function bpsOf(row: Record<string, unknown> | null, key: string): number {
  const v = Number(row?.[key] ?? 0);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(10_000, Math.floor(v));
}

export function taxFromRow(row: Record<string, unknown> | null): TaxBps {
  return {
    reflection: bpsOf(row, "reflection_rate"),
    burn: bpsOf(row, "burn_rate"),
    project: bpsOf(row, "project_rate"),
  };
}

export function rowOptedOut(row: Record<string, unknown> | null): boolean {
  if (!row) return false;
  const a = row.fee_opted_out;
  const b = row.is_banned;
  return a === true || a === 1 || b === true || b === 1;
}

function parseLightRows(data: unknown, precision: number): AirdropHolder[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { accounts?: unknown }).accounts)
      ? (data as { accounts: unknown[] }).accounts
      : [];
  const out: AirdropHolder[] = [];
  for (const row of list) {
    if (Array.isArray(row) && row.length >= 2) {
      out.push({ account: String(row[0]), weightRaw: decimalToRaw(String(row[1]), precision) });
    } else if (row && typeof row === "object" && "account" in row) {
      const rec = row as { account?: unknown; amount?: unknown };
      out.push({ account: String(rec.account ?? ""), weightRaw: decimalToRaw(String(rec.amount ?? "0"), precision) });
    }
  }
  return out;
}

async function lightTop(contract: string, symbol: string, limit: number): Promise<unknown> {
  const n = Math.min(LIGHT_API_MAX, Math.max(10, Math.floor(limit)));
  const path = `/api/topholders/proton/${encodeURIComponent(contract)}/${encodeURIComponent(symbol)}/${n}`;
  let last = "Light API failed";
  for (const base of LIGHT_BASES) {
    try {
      const res = await fetch(`${base}${path}`);
      if (res.status === 404) continue;
      if (!res.ok) {
        last = (await res.text()) || res.statusText;
        continue;
      }
      return await res.json();
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(last);
}

function applySkip(rows: AirdropHolder[], sender: string, contracts: readonly string[]): AirdropHolder[] {
  const seen = new Set<string>();
  const out: AirdropHolder[] = [];
  for (const row of rows) {
    if (row.weightRaw <= 0n) continue;
    if (!keepHolder(row.account, sender, contracts)) continue;
    if (seen.has(row.account)) continue;
    seen.add(row.account);
    out.push(row);
  }
  return out;
}

async function readFlexerHolders(
  contract: string,
  symbol: string,
  precision: number,
  signal: AbortSignal | undefined,
  onProgress?: (read: number) => void
): Promise<{ rows: AirdropHolder[]; truncated: boolean }> {
  const scope = holderTableScope(contract, symbol);
  const rows: AirdropHolder[] = [];
  let lower: string | undefined;
  let guard = "";
  let truncated = false;
  for (;;) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const page = await eosusaPost<TablePage>("/v1/chain/get_table_rows", {
      json: true,
      code: contract,
      scope,
      table: "flexers",
      limit: 100,
      lower_bound: lower,
    });
    for (const row of page.rows ?? []) {
      const account = String(row.owner ?? "");
      const parsed = parseAsset(row.balance);
      if (!parsed || parsed.symbol !== symbol.trim().toUpperCase()) continue;
      rows.push({ account, weightRaw: decimalToRaw(parsed.amount, precision) });
    }
    onProgress?.(rows.length);
    if (rows.length >= CHAIN_ROW_CAP && page.more) {
      truncated = true;
      break;
    }
    if (!page.more || !page.next_key || page.next_key === guard) break;
    guard = page.next_key;
    lower = page.next_key;
  }
  return { rows, truncated };
}

export async function loadAirdropHolders(args: {
  contract: string;
  symbol: string;
  precision: number;
  count: number;
  sender: string;
  /** Token contracts that must not receive a plain transfer. */
  skipContracts?: readonly string[];
  signal?: AbortSignal;
  onProgress?: (read: number) => void;
}): Promise<{ holders: AirdropHolder[]; truncated: boolean; short: boolean }> {
  const want = Math.min(AIRDROP_MAX_ACCOUNTS, Math.max(1, Math.floor(args.count)));
  const contracts = args.skipContracts?.length ? args.skipContracts : [args.contract];
  let requested = Math.min(LIGHT_API_MAX, Math.max(10, want));
  let raw: AirdropHolder[] = [];
  try {
    raw = parseLightRows(await lightTop(args.contract, args.symbol, requested), args.precision);
    let filtered = applySkip(raw, args.sender, contracts);
    if (needMoreHolders(want, requested, raw, filtered.length) && requested < LIGHT_API_MAX) {
      requested = LIGHT_API_MAX;
      raw = parseLightRows(await lightTop(args.contract, args.symbol, requested), args.precision);
      filtered = applySkip(raw, args.sender, contracts);
    }
    if (!needMoreHolders(want, requested, raw, filtered.length)) {
      const holders = filtered.sort(byHoldingDesc).slice(0, want);
      return { holders, truncated: false, short: holders.length < args.count };
    }
  } catch (err) {
    if (args.signal?.aborted) throw err;
    raw = [];
  }
  if (!walksFlexers(args.contract)) {
    const filtered = applySkip(raw, args.sender, contracts).sort(byHoldingDesc).slice(0, want);
    return { holders: filtered, truncated: filtered.length < want, short: false };
  }
  const chain = await readFlexerHolders(args.contract, args.symbol, args.precision, args.signal, args.onProgress);
  const merged = new Map<string, AirdropHolder>();
  for (const row of chain.rows) {
    if (row.weightRaw > 0n) merged.set(row.account, row);
  }
  for (const row of raw) {
    if (row.weightRaw > 0n && !merged.has(row.account)) merged.set(row.account, row);
  }
  const holders = applySkip([...merged.values()], args.sender, contracts).sort(byHoldingDesc).slice(0, want);
  return { holders, truncated: chain.truncated, short: !chain.truncated && holders.length < args.count };
}

export async function readDropTax(contract: string, symbol: string, actor: string): Promise<{ tax: TaxBps; optedOut: boolean }> {
  if (!walksFlexers(contract)) return { tax: { reflection: 0, burn: 0, project: 0 }, optedOut: false };
  const scope = holderTableScope(contract, symbol);
  const [settings, flexer] = await Promise.all([
    eosusaPost<TablePage>("/v1/chain/get_table_rows", {
      json: true,
      code: contract,
      scope,
      table: "settings",
      limit: 1,
    }),
    eosusaPost<TablePage>("/v1/chain/get_table_rows", {
      json: true,
      code: contract,
      scope,
      table: "flexers",
      lower_bound: actor,
      upper_bound: actor,
      limit: 1,
    }).catch(() => ({ rows: [] }) as TablePage),
  ]);
  const feeRow = (flexer.rows ?? []).find((row) => String(row.owner ?? "") === actor) ?? null;
  return { tax: taxFromRow(settings.rows?.[0] ?? null), optedOut: rowOptedOut(feeRow) };
}

export async function readFreeRam(account: string): Promise<number> {
  const row = await eosusaPost<{ ram_quota?: number; ram_usage?: number }>("/v1/chain/get_account", {
    account_name: account,
  });
  const quota = Number(row.ram_quota ?? 0);
  const usage = Number(row.ram_usage ?? 0);
  if (!Number.isFinite(quota) || !Number.isFinite(usage)) return 0;
  return Math.max(0, quota - usage);
}

export async function readBalanceRaw(contract: string, account: string, symbol: string, precision: number): Promise<bigint> {
  const data = await eosusaPost<string[] | { error?: unknown }>("/v1/chain/get_currency_balance", {
    code: contract,
    account,
    symbol,
  });
  if (!Array.isArray(data)) return 0n;
  for (const row of data) {
    const parsed = parseAsset(row);
    if (parsed && parsed.symbol === symbol) return decimalToRaw(parsed.amount, precision);
  }
  return 0n;
}

export async function readSupplyPrecision(contract: string, symbol: string): Promise<number | null> {
  const known = corePrecision(contract, symbol);
  if (known != null) return known;
  try {
    const data = await eosusaPost<Record<string, { supply?: string }>>("/v1/chain/get_currency_stats", {
      code: contract,
      symbol,
    });
    const parsed = parseAsset(data[symbol]?.supply);
    return parsed ? parsed.precision : null;
  } catch {
    return null;
  }
}
