import { useState } from "react";
import { DecimalText } from "@/components/Amount";

export type ShapePart = {
  size: number;
  color: string;
  label: string;
  title?: string;
};

export type CoverExtra = {
  ratio: number | null;
  usd: string | null;
  label: string;
  color: string;
  hint: string;
};

const INK = "#f4f1e8";
const MUTED = "#a8a29e";
const TRACK = "#262626";
const GOLD = "#eab308";
export const BACKING_LP = "#60a5fa";
export const ECOSYSTEM_LP = "#2dd4bf";
export const DEGEN_LP = "#fb7185";

function shareLabel(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "-";
  const pct = n * 100;
  const abs = Math.abs(pct);
  if (abs >= 1000) return `${pct.toFixed(0)}%`;
  if (abs >= 10) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

function MetricLabel({ label, explain, color }: { label: string; explain: string; color?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="whitespace-nowrap bg-primary/10 px-1 text-left text-[10px] font-semibold uppercase tracking-wider hover:bg-primary/25"
        style={{ color: color ?? "#a8a29e" }}
        aria-expanded={open}
        onClick={() => setOpen((on) => !on)}
      >
        {label}
      </button>
      {open ? <p className="mt-1 text-[11px] font-normal normal-case tracking-normal text-[#a8a29e]">{explain}</p> : null}
    </div>
  );
}

function FigureTitle({ label, explain, center }: { label: string; explain: string; center?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <figcaption className={center ? "text-center" : undefined}>
      <button
        type="button"
        className={`bg-primary/10 px-1 text-[10px] font-semibold uppercase tracking-wider text-[#f4f1e8]/80 hover:bg-primary/25 ${center ? "text-center" : "text-left"}`}
        aria-expanded={open}
        onClick={() => setOpen((on) => !on)}
      >
        {label}
      </button>
      {open ? (
        <p className={`mt-1 text-[11px] font-normal normal-case tracking-normal text-[#a8a29e] ${center ? "mx-auto max-w-xl text-center" : ""}`}>
          {explain}
        </p>
      ) : null}
    </figcaption>
  );
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function semiArc(cx: number, cy: number, r: number, from: number, to: number): string {
  if (!(to > from)) return "";
  const a0 = Math.PI + Math.PI * from;
  const a1 = Math.PI + Math.PI * to;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** Semicircle of locked backing inside market cap, then community LP bands. */
export function CoverGauge({
  ratio,
  backing,
  total,
  cap,
  extras,
}: {
  ratio: number | null;
  backing: string;
  total: string;
  cap: string;
  extras: readonly CoverExtra[];
}) {
  const r = 132;
  const cx = 230;
  const cy = 162;
  const shown = extras.filter((extra) => extra.ratio != null && extra.ratio > 0);
  let cursor = ratio == null ? 0 : clamp01(ratio);
  const arcs: { d: string; color: string }[] = [];
  const gold = semiArc(cx, cy, r, 0, cursor);
  if (gold) arcs.push({ d: gold, color: GOLD });
  for (const extra of shown) {
    const start = Math.min(1, cursor + 0.016);
    const end = Math.min(1, start + clamp01(extra.ratio ?? 0));
    const d = semiArc(cx, cy, r, start, end);
    if (d) arcs.push({ d, color: extra.color });
    cursor = end;
  }

  return (
    <figure className="bg-[#0d0d0d] px-3 py-3" aria-label={`Pure liquid backing is ${shareLabel(ratio)} of market cap`}>
      <FigureTitle
        center
        label="Backing / market cap"
        explain="Gold arc is pure liquid backing (locked quote) divided by mid price times max supply. Extra arcs are community LP quote USD in the launch quote, ecosystem quotes, and other quotes, each divided by that same market cap."
      />
      <svg viewBox="0 0 460 210" className="mx-auto mt-1 block w-full max-w-3xl" role="img">
        <title>Pure liquid backing over market cap, plus backing community LP, ecosystem community LP, and degen community LP.</title>
        <path d={semiArc(cx, cy, r, 0, 1)} fill="none" stroke={TRACK} strokeWidth="18" />
        {arcs.map((arc) => (
          <path key={arc.color} d={arc.d} fill="none" stroke={arc.color} strokeWidth="18" strokeLinecap="butt" />
        ))}
        <text x={cx} y={132} textAnchor="middle" fontSize="28" fontFamily="ui-monospace, monospace" fill={GOLD}>
          <DecimalText text={shareLabel(ratio)} svg />
        </text>
        {shown.length ? (
          <text x={cx} y={160} textAnchor="middle" fontSize="20" fontFamily="ui-monospace, monospace">
            {shown.map((extra, i) => (
              <tspan key={extra.label} fill={extra.color}>
                {i ? "  " : ""}+ <DecimalText text={shareLabel(extra.ratio)} svg />
              </tspan>
            ))}
          </text>
        ) : null}
      </svg>
      <div className="mx-auto mt-1 flex w-full flex-nowrap items-start justify-between gap-4 overflow-x-auto font-mono text-[11px]">
        {(
          [
            {
              label: "Market cap",
              explain: "Pool mid price times the Alcor USD price of the quote, times stat max supply.",
              color: INK,
              value: cap,
            },
            {
              label: "Total backing",
              explain: "Pure liquid backing plus quote dollars in backing community LP, ecosystem community LP, and degen community LP.",
              color: INK,
              value: total,
            },
            {
              label: "Pure liquid backing",
              explain: "Quote in the day-one locked position times the Alcor USD price of that quote.",
              color: GOLD,
              value: backing,
            },
            ...extras.map((extra) => ({
              label: extra.label,
              explain: extra.hint,
              color: extra.color,
              value: extra.usd ?? "-",
            })),
          ]
        ).map((cell) => (
          <div key={cell.label} className="shrink-0">
            <MetricLabel label={cell.label} explain={cell.explain} color={cell.color} />
            <div style={{ color: cell.color }}>
              <DecimalText text={cell.value} />
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Square cut into vertical bands. Supply sitting in each place. */
export function BandSquare({ parts }: { parts: readonly ShapePart[] }) {
  const live = parts.filter((part) => part.size > 0);
  const total = live.reduce((sum, part) => sum + part.size, 0) || 1;
  const gap = live.length > 1 ? 6 : 0;
  const inner = 200 - gap * Math.max(0, live.length - 1);
  let x = 20;
  const bands = live.map((part) => {
    const w = (part.size / total) * inner;
    const band = { ...part, x, w };
    x += w + gap;
    return band;
  });

  return (
    <figure className="bg-[#0d0d0d] px-3 py-3">
      <FigureTitle
        label="Supply bands"
        explain="Token amounts: locked position from its liquidity, community LP as swap.alcor minus that position, spot as the alcor account balance, wallets as the rest of wallet float."
      />
      <svg viewBox="0 0 240 132" className="mt-2 block w-full" role="img" aria-label="Supply split into bands">
        {bands.map((band) => (
          <rect key={band.label} x={band.x} y={16} width={Math.max(band.w, 0.5)} height={100} fill={band.color} />
        ))}
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {bands.map((band) => (
          <li key={band.label} className="font-mono text-[11px]" style={{ color: band.color }} title={band.title}>
            {band.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Disk split between community LP and loose wallets. */
export function LoyaltyDisk({ ratio }: { ratio: number | null }) {
  const frac = ratio == null ? 0 : clamp01(ratio);
  const cx = 120;
  const cy = 78;
  const r = 58;
  const end = -Math.PI / 2 + Math.PI * 2 * frac;
  const x = cx + r * Math.cos(end);
  const y = cy + r * Math.sin(end);
  const large = frac > 0.5 ? 1 : 0;
  const wedge =
    frac <= 0
      ? ""
      : frac >= 1
        ? ""
        : `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${x.toFixed(1)} ${y.toFixed(1)} Z`;

  return (
    <figure className="bg-[#0d0d0d] px-3 py-3" aria-label={`LP loyalty ${shareLabel(ratio)}`}>
      <FigureTitle
        label="LP loyalty"
        explain="Satellite pooled tokens divided by satellite pooled plus wallet float. Satellite is the swap.alcor balance minus the locked position. Wallet float is max supply minus swap.alcor."
      />
      <svg viewBox="0 0 240 168" className="mt-2 block w-full" role="img">
        <circle cx={cx} cy={cy} r={r} fill="#14532d" />
        {frac >= 1 ? <circle cx={cx} cy={cy} r={r} fill={GOLD} /> : null}
        {wedge ? <path d={wedge} fill={GOLD} /> : null}
        <circle cx={cx} cy={cy} r={34} fill="#0d0d0d" />
        <text x={cx} y={84} textAnchor="middle" fill={INK} fontSize="16" fontFamily="ui-monospace, monospace">
          <DecimalText text={shareLabel(ratio)} svg />
        </text>
      </svg>
    </figure>
  );
}

/** Two horizontal tracks. Lengths share one scale. */
export function TrackPair({
  left,
  right,
}: {
  left: { label: string; amount: number; text: string; color: string };
  right: { label: string; amount: number; text: string; color: string };
}) {
  const max = Math.max(left.amount, right.amount, 1);
  const rows = [left, right];
  return (
    <figure className="bg-[#0d0d0d] px-3 py-3">
      <FigureTitle
        label="Volume and backing"
        explain="Left bar is the sum of Alcor volumeUSD24 on this token's pools. Right bar is quote in the locked position times the Alcor USD price of that quote."
      />
      <svg viewBox="0 0 240 168" className="mt-2 block w-full" role="img" aria-label="24h volume next to pure backing">
        {rows.map((row, i) => {
          const y = 28 + i * 72;
          const w = (Math.max(0, row.amount) / max) * 200;
          return (
            <g key={row.label}>
              <text x={20} y={y} fill={MUTED} fontSize="11" fontFamily="ui-monospace, monospace">
                {row.label}
              </text>
              <rect x={20} y={y + 8} width={200} height={14} fill={TRACK} />
              <rect x={20} y={y + 8} width={Math.max(w, row.amount > 0 ? 2 : 0)} height={14} fill={row.color} />
              <text x={20} y={y + 40} fill={INK} fontSize="12" fontFamily="ui-monospace, monospace">
                <DecimalText text={row.text} svg />
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
