import { useEffect, useId, useRef, type PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { hueFromId, seedNodes, stepNodes, type SimNode } from "@/services/bubblePhysics";

export type LiveBubbleItem = {
  id: string;
  value: number;
  label: string;
  sub?: string;
  href?: string;
  to?: string;
  color?: string;
  striped?: boolean;
};

type Props = {
  items: LiveBubbleItem[];
  className?: string;
  labelMinR?: number;
};

const LABEL_MIN = 34;
const SUB_MIN = 52;

function fillOf(item: LiveBubbleItem): string {
  if (item.color) return item.color;
  const h = hueFromId(item.id);
  return `hsl(${h} 62% 42%)`;
}

export function LiveBubbles({ items, className, labelMinR = LABEL_MIN }: Props) {
  const navigate = useNavigate();
  const stripeId = `live-locked-stripes-${useId().replace(/:/g, "")}`;
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const nodes = useRef<SimNode[]>([]);
  const els = useRef(new Map<string, SVGGElement>());
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const size = useRef({ w: 640, h: 360 });

  const bind = (id: string) => (el: SVGGElement | null) => {
    if (el) els.current.set(id, el);
    else els.current.delete(id);
  };

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const sync = () => {
      size.current = { w: Math.max(160, el.clientWidth), h: Math.max(160, el.clientHeight) };
      const svgEl = svg.current;
      if (svgEl) svgEl.setAttribute("viewBox", `0 0 ${size.current.w} ${size.current.h}`);
      const prev = new Map(nodes.current.map((n) => [n.id, n]));
      const next = seedNodes(
        items.map((item) => ({ id: item.id, value: item.value })),
        size.current.w,
        size.current.h
      );
      for (const n of next) {
        const old = prev.get(n.id);
        if (!old) continue;
        n.x = old.x;
        n.y = old.y;
        n.vx = old.vx;
        n.vy = old.vy;
      }
      nodes.current = next;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const { w, h } = size.current;
      stepNodes(nodes.current, w, h, mouse.current);
      for (const n of nodes.current) {
        const g = els.current.get(n.id);
        if (!g) continue;
        g.setAttribute("transform", `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`);
        const circle = g.querySelector("circle");
        if (circle) circle.setAttribute("r", n.r.toFixed(1));
        const label = g.querySelector("[data-label]");
        if (label instanceof SVGElement) label.setAttribute("display", n.r >= labelMinR ? "block" : "none");
        const sub = g.querySelector("[data-sub]");
        if (sub instanceof SVGElement) sub.setAttribute("display", n.r >= SUB_MIN ? "block" : "none");
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [items, labelMinR]);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = wrap.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    mouse.current = { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  return (
    <div
      ref={wrap}
      className={className ?? "relative mt-2 h-[min(56vh,420px)] overflow-hidden border border-border bg-[#0d0d0d]"}
      onPointerMove={onMove}
      onPointerLeave={() => {
        mouse.current = null;
      }}
    >
      <svg ref={svg} className="absolute inset-0 h-full w-full" role="img">
        <defs>
          <pattern id={stripeId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#1a1408" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#eab308" strokeWidth="2.4" />
          </pattern>
        </defs>
        {items.map((item) => {
          const color = fillOf(item);
          const inner = (
            <>
              <circle
                r={20}
                fill={item.striped ? `url(#${stripeId})` : color}
                stroke={item.striped ? "#eab308" : "rgba(255,255,255,0.22)"}
                strokeWidth="1.4"
              />
              <text
                data-label
                y={item.sub ? -3 : 3}
                textAnchor="middle"
                fill="#fff8ee"
                fontSize="11"
                fontFamily="ui-monospace, monospace"
                display="none"
              >
                {item.label}
              </text>
              {item.sub ? (
                <text
                  data-sub
                  y={12}
                  textAnchor="middle"
                  fill="rgba(255,248,238,0.7)"
                  fontSize="7"
                  fontFamily="ui-monospace, monospace"
                  display="none"
                >
                  {item.sub}
                </text>
              ) : null}
            </>
          );
          const href = item.href || item.to;
          if (href) {
            return (
              <a
                key={item.id}
                href={href}
                target={item.href ? "_blank" : undefined}
                rel={item.href ? "noreferrer" : undefined}
                onClick={(e) => {
                  if (!item.to) return;
                  e.preventDefault();
                  navigate(item.to);
                }}
              >
                <g ref={bind(item.id)}>{inner}</g>
              </a>
            );
          }
          return (
            <g key={item.id} ref={bind(item.id)}>
              {inner}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
