/** Expand JS scientific strings (`1e+12`, `1e-8`) to a plain decimal. */
export function expandScientific(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n === 0) return "0";
  const sign = n < 0 ? "-" : "";
  const raw = Math.abs(n).toString();
  if (!/[eE]/.test(raw)) return sign + raw;
  const m = raw.match(/^(\d+)(?:\.(\d+))?e([+-]?\d+)$/i);
  if (!m) return sign + raw;
  const digits = m[1] + (m[2] || "");
  const exp = Number(m[3]);
  const point = m[1].length + exp;
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${"0".repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

const SCI_MIN_FRAC_DIGITS = 9;
const MAX_FRAC = 8;
const TINY_LEADING_ZEROS = 6;
const TINY_SIG_FIGS = 4;

function firstFracDigitIndex(frac: string): number {
  return frac.search(/[1-9]/);
}

function groupInt(intRaw: string, group: boolean): string {
  return group ? intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : intRaw;
}

function usdFixed2(n: number): string {
  const [intRaw, frac = "00"] = Math.abs(n).toFixed(2).split(".");
  return `${groupInt(intRaw, true)}.${frac}`;
}

function fromExpandedAbs(abs: number, group: boolean): string {
  const expanded = expandScientific(abs);
  const [intRaw, fracRaw = ""] = expanded.split(".");
  const frac = fracRaw.replace(/0+$/, "");
  const int = groupInt(intRaw, group);
  return frac ? `${int}.${frac}` : int;
}

/** Full decimal. Scientific only when the first non-zero is at the 9th decimal or later. */
export function formatPlainNumber(n: number, group = true): string {
  if (!Number.isFinite(n)) return "0";
  if (n === 0) return "0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const expanded = expandScientific(abs);
  const [intRaw, fracRaw = ""] = expanded.split(".");
  const frac = fracRaw.replace(/0+$/, "");
  const first = firstFracDigitIndex(frac);
  if (intRaw === "0" && first >= SCI_MIN_FRAC_DIGITS - 1) {
    return `${sign}${abs.toExponential(2)}`.replace("e+", "e");
  }
  return sign + fromExpandedAbs(abs, group);
}

/** Quiet on-screen number. Max 8 decimals. Tiny values (6+ leading zeros) use 4 significant figures. */
export function formatNiceNumber(n: number, group = true): string {
  if (!Number.isFinite(n)) return "0";
  if (n === 0) return "0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const expanded = expandScientific(abs);
  const [intRaw, fracRaw = ""] = expanded.split(".");
  const frac = fracRaw.replace(/0+$/, "");
  const first = firstFracDigitIndex(frac);
  if (intRaw === "0" && first >= SCI_MIN_FRAC_DIGITS - 1) {
    return `${sign}${abs.toExponential(2)}`.replace("e+", "e");
  }
  if (intRaw === "0" && first >= TINY_LEADING_ZEROS) {
    return sign + fromExpandedAbs(Number(abs.toPrecision(TINY_SIG_FIGS)), group);
  }
  return sign + fromExpandedAbs(Number(abs.toFixed(MAX_FRAC)), group);
}

export type NumParts = { display: string; full: string };

export function numberParts(n: number): NumParts {
  if (!Number.isFinite(n)) return { display: "0", full: "0" };
  return { display: formatNiceNumber(n), full: formatPlainNumber(n) };
}

/** Compact USD for volume, TVL, mcap. Dollar prices use 2 decimals from $0.01 up. */
export function fmtUsd(n: number): string {
  return usdParts(n).display;
}

export function usdParts(n: number): NumParts {
  if (!(n > 0) || !Number.isFinite(n)) return { display: "-", full: "-" };
  const full = `$${formatPlainNumber(n)}`;
  if (n >= 1e12) return { display: `$${(n / 1e12).toFixed(2)}T`, full };
  if (n >= 1e9) return { display: `$${(n / 1e9).toFixed(2)}B`, full };
  if (n >= 1e6) return { display: `$${(n / 1e6).toFixed(2)}M`, full };
  if (n >= 1) {
    const cents = Number(n.toFixed(2));
    if (cents % 1 === 0) return { display: `$${fromExpandedAbs(Math.round(cents), true)}`, full };
    return { display: `$${usdFixed2(cents)}`, full };
  }
  if (n >= 0.01) return { display: `$${usdFixed2(n)}`, full };
  return { display: `$${formatNiceNumber(n)}`, full };
}
