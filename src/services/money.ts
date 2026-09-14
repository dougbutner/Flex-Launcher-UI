/** Compact USD for tiles and pool chips. 0 and non-finite render as `-`. */
export function fmtUsd(n: number): string {
  if (!(n > 0) || !Number.isFinite(n)) return "-";
  if (n >= 1e12) return `$${(n / 1e12).toPrecision(3)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toPrecision(3)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toPrecision(3)}M`;
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(3)}`;
}
