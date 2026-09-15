import { useMemo, useState, type MouseEvent } from "react";
import type { ChartPoint } from "@/services/alcorMarket";
import { fmtQuotePrice } from "@/services/alcorMarket";

type Props = {
  points: ChartPoint[];
  quoteSymbol: string;
};

const W = 640;
const H = 220;
const PAD = { l: 64, r: 14, t: 16, b: 28 };

function fmtAxisTime(t: number): string {
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function GoldPriceChart({ points, quoteSymbol }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const xs = points.map((p) => p.t);
    const ys = points.map((p) => p.price);
    const minX = xs[0];
    const maxX = xs[xs.length - 1];
    const rawMin = Math.min(...ys);
    const rawMax = Math.max(...ys);
    const span = rawMax - rawMin;
    const pad = span > 0 ? span * 0.08 : rawMax * 0.08 || 1;
    const minY = Math.max(0, rawMin - pad);
    const maxY = rawMax + pad;
    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const xOf = (t: number) => PAD.l + ((t - minX) / Math.max(1, maxX - minX)) * iw;
    const yOf = (p: number) => PAD.t + ((maxY - p) / Math.max(1e-18, maxY - minY)) * ih;
    const d = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.t).toFixed(1)} ${yOf(p.price).toFixed(1)}`)
      .join(" ");
    const area = `${d} L ${xOf(maxX).toFixed(1)} ${(PAD.t + ih).toFixed(1)} L ${xOf(minX).toFixed(1)} ${(PAD.t + ih).toFixed(1)} Z`;
    const ticks = [maxY, (minY + maxY) / 2, minY];
    return { minX, maxX, minY, maxY, xOf, yOf, d, area, ticks, iw, ih };
  }, [points]);

  if (!geom) {
    return (
      <div className="flex min-h-[220px] w-full items-center justify-center text-xs text-muted-foreground">
        Not enough swaps to draw a line yet.
      </div>
    );
  }

  const hi = hover != null ? points[Math.max(0, Math.min(points.length - 1, hover))] : null;

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dx = Math.abs(geom.xOf(points[i].t) - x);
      if (dx < bestD) {
        bestD = dx;
        best = i;
      }
    }
    setHover(best);
  };

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Price chart"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.28" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {geom.ticks.map((y, i) => {
          const yy = geom.yOf(y);
          return (
            <g key={i}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={yy}
                y2={yy}
                stroke="hsl(var(--border))"
                strokeWidth="1"
                strokeDasharray={i === 1 ? "3 5" : undefined}
              />
              <text
                x={PAD.l - 8}
                y={yy + 3}
                textAnchor="end"
                fill="hsl(var(--muted-foreground))"
                fontSize="10"
                fontFamily="ui-monospace, monospace"
              >
                {fmtQuotePrice(y)}
              </text>
            </g>
          );
        })}
        <text
          x={PAD.l}
          y={H - 8}
          fill="hsl(var(--muted-foreground))"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
        >
          {fmtAxisTime(geom.minX)}
        </text>
        <text
          x={W - PAD.r}
          y={H - 8}
          textAnchor="end"
          fill="hsl(var(--muted-foreground))"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
        >
          {fmtAxisTime(geom.maxX)}
        </text>
        <path d={geom.area} fill="url(#goldFill)" />
        <path
          d={geom.d}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hi ? (
          <>
            <line
              x1={geom.xOf(hi.t)}
              x2={geom.xOf(hi.t)}
              y1={PAD.t}
              y2={PAD.t + geom.ih}
              stroke="hsl(var(--primary))"
              strokeOpacity="0.35"
              strokeWidth="1"
            />
            <circle
              cx={geom.xOf(hi.t)}
              cy={geom.yOf(hi.price)}
              r="4"
              fill="hsl(var(--primary))"
              stroke="hsl(var(--background))"
              strokeWidth="2"
            />
          </>
        ) : null}
      </svg>
      {hi ? (
        <div className="pointer-events-none absolute right-3 top-2 rounded-md border border-primary/30 bg-background/90 px-2.5 py-1 font-mono text-[11px] text-primary shadow-lg">
          {fmtQuotePrice(hi.price)} {quoteSymbol}
          <span className="ml-2 text-muted-foreground">
            {new Date(hi.t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      ) : null}
    </div>
  );
}
