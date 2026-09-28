import { DecimalText } from "@/components/Amount";

export type RingSlice = {
  size: number;
  color: string;
  label: string;
  title?: string;
};

type Props = {
  center: string;
  sub: string;
  /** Upper arch. Holdings. */
  top: readonly RingSlice[];
  /** Lower arch, opening the other way. Backing. */
  bottom: readonly RingSlice[];
  topCaption?: string;
  topTitle?: string;
  bottomCaption?: string;
  bottomTitle?: string;
};

const VB_W = 640;
const VB_H = 348;
const CX = 320;
const RX = 228;
const CUT = 0.045;

const TOP = { cy: 128, ry: 62, from: Math.PI + 0.22, to: Math.PI * 2 - 0.22 };
const BOT = { cy: 236, ry: 62, from: 0.22, to: Math.PI - 0.22 };

function pt(theta: number, cy: number, ry: number, rx = RX): [number, number] {
  return [CX + rx * Math.cos(theta), cy + ry * Math.sin(theta)];
}

function arc(cy: number, ry: number, from: number, to: number): string {
  const steps = Math.max(10, Math.ceil(Math.abs(to - from) * 28));
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const [x, y] = pt(from + ((to - from) * i) / steps, cy, ry);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

function layout(slices: readonly RingSlice[], from: number, to: number, cy: number, ry: number) {
  const parts = slices.filter((slice) => slice.size > 0);
  const total = parts.reduce((sum, slice) => sum + slice.size, 0) || 1;
  const span = to - from;
  const cuts = Math.max(0, parts.length - 1);
  const drawable = Math.max(0.2, span - cuts * CUT);
  let cursor = from;
  return parts.map((slice) => {
    const len = (slice.size / total) * drawable;
    const a0 = cursor;
    const a1 = cursor + len;
    cursor = a1 + CUT;
    const mid = (a0 + a1) / 2;
    const [rawX, rawY] = pt(mid, cy, ry + 28, RX + 40);
    const lx = Math.min(VB_W - 36, Math.max(36, rawX));
    const ly = Math.min(VB_H - 10, Math.max(14, rawY));
    return { d: arc(cy, ry, a0, a1), color: slice.color, label: slice.label, title: slice.title, showLabel: len > 0.26, lx, ly };
  });
}

/** Top arch and a separate reverse arch underneath. Interior stays empty. */
export function OvalRing({
  center,
  sub,
  top,
  bottom,
  topCaption = "Distribution",
  topTitle = "Distribution of supply.",
  bottomCaption = "Pure liquid backing",
  bottomTitle = "Tokens currently in liquidity pools with this token.",
}: Props) {
  const upper = layout(top, TOP.from, TOP.to, TOP.cy, TOP.ry);
  const lower = layout(bottom, BOT.from, BOT.to, BOT.cy, BOT.ry);

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="block w-full bg-[#0d0d0d]" role="img" aria-label={`${center} ${sub}. ${topTitle} ${bottomTitle}`}>
      <title>{`${center} ${sub}. ${topTitle} ${bottomTitle}`}</title>
      <text x={CX} y={18} textAnchor="middle" fill="#f4f1e8" fillOpacity="0.45" fontSize="12" fontFamily="ui-monospace, monospace">
        <title>{topTitle}</title>
        {topCaption}
      </text>
      <text x={CX} y={240} textAnchor="middle" fill="#f4f1e8" fillOpacity="0.45" fontSize="12" fontFamily="ui-monospace, monospace">
        <title>{bottomTitle}</title>
        {bottomCaption}
      </text>
      {[...upper, ...lower].map((path, i) => (
        <path key={i} d={path.d} fill="none" stroke={path.color} strokeWidth={16} strokeLinecap="butt" />
      ))}
      <text x={CX} y={178} textAnchor="middle" fill="#f4f1e8" fontSize="20" fontFamily="ui-monospace, monospace">
        <DecimalText text={center} svg />
      </text>
      <text x={CX} y={198} textAnchor="middle" fill="#a8a29e" fontSize="12" fontFamily="ui-monospace, monospace">
        {sub}
      </text>
      {upper.map((path, i) =>
        path.showLabel ? (
          <text key={`t${i}`} x={path.lx} y={path.ly} textAnchor="middle" fill={path.color} fontSize="11" fontFamily="ui-monospace, monospace">
            {path.title ? <title>{path.title}</title> : null}
            {path.label}
          </text>
        ) : null
      )}
      {lower.map((path, i) =>
        path.showLabel ? (
          <text key={`b${i}`} x={path.lx} y={path.ly} textAnchor="middle" fill={path.color} fontSize="11" fontFamily="ui-monospace, monospace">
            {path.title ? <title>{path.title}</title> : null}
            {path.label}
          </text>
        ) : null
      )}
    </svg>
  );
}
