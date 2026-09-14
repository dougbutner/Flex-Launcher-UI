/** Classic EOSIO / XPR asset precision. Not Leap's 18. */
export const EOSIO_MAX_PRECISION = 8;

export type ParsedAsset = {
  amount: string;
  precision: number;
  symbol: string;
};

export function validPrecision(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= EOSIO_MAX_PRECISION;
}

export function parseAsset(value: unknown): ParsedAsset | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(-?\d+)(?:\.(\d+))?\s+([A-Z]{1,7})$/);
  if (!m) return null;
  const precision = m[2]?.length ?? 0;
  if (!validPrecision(precision)) return null;
  return { amount: m[2] != null ? `${m[1]}.${m[2]}` : m[1], precision, symbol: m[3] };
}

export function assetAmountNumber(value: string): number {
  const p = parseAsset(value);
  return p ? Number(p.amount) : 0;
}

export function formatAsset(amount: string, precision: number, symbol: string): string {
  const neg = amount.startsWith("-");
  const raw = neg ? amount.slice(1) : amount;
  const [iRaw, fRaw = ""] = raw.split(".");
  const i = (iRaw.replace(/^0+(?=\d)/, "") || "0").replace(/[^\d]/g, "") || "0";
  if (precision <= 0) return `${neg ? "-" : ""}${i} ${symbol}`;
  const frac = (fRaw + "0".repeat(precision)).slice(0, precision);
  return `${neg ? "-" : ""}${i}.${frac} ${symbol}`;
}

export function zeroAsset(precision: number, symbol: string): string {
  return formatAsset("0", precision, symbol);
}

export function extendedAsset(quantity: string, contract: string) {
  return { quantity, contract };
}

export function validSymbol(code: string): boolean {
  return /^[A-Z]{1,7}$/.test(code);
}

export function validAccount(name: string): boolean {
  return /^[a-z1-5.]{1,12}$/.test(name) && !name.startsWith(".") && !name.endsWith(".");
}

export const SUPPLY_SHORTCUTS = [
  { label: "1T", value: "1000000000000" },
  { label: "1B", value: "1000000000" },
  { label: "1M", value: "1000000" },
] as const;

export function parseSupplyInput(raw: string): string {
  let s = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  return s;
}

export function formatSupplyCommas(raw: string): string {
  if (!raw) return "";
  const [i, f] = raw.split(".");
  const grouped = (i || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return f != null && raw.includes(".") ? `${grouped}.${f}` : grouped;
}
