import type { BoardToken } from "@/services/leaderboardStore";

/** Register a new id here and in `WINNER_VIEWS` to add a Winners display. */
export const WINNER_VIEW_IDS = ["board", "tiles", "bubbles"] as const;
export type WinnerViewId = (typeof WINNER_VIEW_IDS)[number];

export const BUBBLE_SIZE_IDS = ["liq", "volume", "mcap", "change", "holders"] as const;
export type BubbleSizeId = (typeof BUBBLE_SIZE_IDS)[number];

export const CHANGE_WINDOW_IDS = ["24h", "7d", "30d"] as const;
export type ChangeWindowId = (typeof CHANGE_WINDOW_IDS)[number];

export type WinnerExtra = {
  id: string;
  change24: number;
  changeWeek: number;
  changeMonth: number;
  spark: number[];
};

export type WinnerViewState = {
  view: WinnerViewId;
  size: BubbleSizeId;
  chg: ChangeWindowId;
};

export const DEFAULT_WINNER_VIEW: WinnerViewState = {
  view: "board",
  size: "liq",
  chg: "24h",
};

function pickId<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  const v = (raw || "").trim() as T;
  return allowed.includes(v) ? v : fallback;
}

export function parseWinnerView(params: URLSearchParams): WinnerViewState {
  return {
    view: pickId(params.get("view"), WINNER_VIEW_IDS, DEFAULT_WINNER_VIEW.view),
    size: pickId(params.get("size"), BUBBLE_SIZE_IDS, DEFAULT_WINNER_VIEW.size),
    chg: pickId(params.get("chg"), CHANGE_WINDOW_IDS, DEFAULT_WINNER_VIEW.chg),
  };
}

export function winnerViewSearch(state: WinnerViewState): string {
  const next = new URLSearchParams();
  if (state.view !== DEFAULT_WINNER_VIEW.view) next.set("view", state.view);
  if (state.view === "bubbles") {
    if (state.size !== DEFAULT_WINNER_VIEW.size) next.set("size", state.size);
    if (state.size === "change" && state.chg !== DEFAULT_WINNER_VIEW.chg) next.set("chg", state.chg);
  }
  const q = next.toString();
  return q ? `?${q}` : "";
}

export function extrasNeeded(state: WinnerViewState) {
  return state.view === "board" || (state.view === "bubbles" && state.size === "change");
}

export function sparkFromPoints(points: Array<{ price: number }>, n = 12): number[] {
  if (points.length < 2) return [];
  const last = Math.min(points.length, 48);
  const slice = points.slice(-last);
  if (slice.length <= n) return slice.map((p) => p.price);
  const step = (slice.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => slice[Math.round(i * step)]?.price ?? 0);
}

export function pctFromPoints(points: Array<{ t: number; price: number }>, windowMs: number): number {
  if (points.length < 2 || !(windowMs > 0)) return 0;
  const end = points[points.length - 1];
  if (!(end.price > 0)) return 0;
  const cut = end.t - windowMs;
  let start = points[0];
  for (const p of points) {
    if (p.t <= cut) start = p;
    else break;
  }
  if (!(start.price > 0)) return 0;
  return ((end.price - start.price) / start.price) * 100;
}

export function changePct(extra: WinnerExtra | undefined, window: ChangeWindowId): number {
  if (!extra) return 0;
  if (window === "7d") return extra.changeWeek;
  if (window === "30d") return extra.changeMonth;
  return extra.change24;
}

export function bubbleValue(
  token: BoardToken,
  size: BubbleSizeId,
  extra: WinnerExtra | undefined,
  window: ChangeWindowId
): number {
  if (size === "volume") return Math.max(0, token.volumeUsd);
  if (size === "mcap") return Math.max(0, token.mcapUsd);
  if (size === "holders") return Math.max(0, token.holders);
  if (size === "change") return Math.abs(changePct(extra, window));
  return Math.max(0, token.liqUsd);
}

export type PackedBubble = {
  id: string;
  x: number;
  y: number;
  r: number;
};

/** Deterministic circle pack. Largest first, spiral seed, then push-apart. */
export function packBubbles(
  items: Array<{ id: string; value: number }>,
  width: number,
  height: number
): PackedBubble[] {
  const w = Math.max(120, width);
  const h = Math.max(120, height);
  const cx = w / 2;
  const cy = h / 2;
  const ranked = [...items].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const maxV = Math.max(...ranked.map((i) => i.value), 0);
  const maxR = Math.min(w, h) * 0.2;
  const minR = 16;
  const nodes = ranked.map((item, i) => {
    const r = maxV > 0 ? minR + Math.sqrt(item.value / maxV) * (maxR - minR) : minR;
    const ang = i * 2.399963;
    const rad = Math.sqrt(i) * (maxR * 0.55);
    return {
      id: item.id,
      r,
      x: cx + Math.cos(ang) * rad,
      y: cy + Math.sin(ang) * rad,
    };
  });
  if (nodes[0]) {
    nodes[0].x = cx;
    nodes[0].y = cy;
  }
  if (nodes.length === 1) return nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, r: n.r }));
  for (let step = 0; step < 80; step++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy) || 0.001;
        const need = a.r + b.r + 2;
        if (dist >= need) continue;
        const push = (need - dist) / 2;
        dx /= dist;
        dy /= dist;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
      }
    }
    for (const n of nodes) {
      n.x += (cx - n.x) * 0.02;
      n.y += (cy - n.y) * 0.02;
      n.x = Math.min(w - n.r - 4, Math.max(n.r + 4, n.x));
      n.y = Math.min(h - n.r - 4, Math.max(n.r + 4, n.y));
    }
  }
  return nodes;
}
