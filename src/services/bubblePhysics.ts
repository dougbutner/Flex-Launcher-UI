export type BubbleSeed = {
  id: string;
  value: number;
};

export type SimNode = {
  id: string;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export function bubbleRadius(value: number, maxV: number, minR: number, maxR: number): number {
  if (!(maxV > 0)) return minR;
  return minR + Math.sqrt(Math.max(0, value) / maxV) * (maxR - minR);
}

export function seedNodes(items: BubbleSeed[], width: number, height: number): SimNode[] {
  const w = Math.max(160, width);
  const h = Math.max(160, height);
  const cx = w / 2;
  const cy = h / 2;
  const ranked = [...items].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const maxV = Math.max(...ranked.map((i) => i.value), 0);
  const maxR = Math.min(w, h) * 0.22;
  const minR = 12;
  return ranked.map((item, i) => {
    const r = bubbleRadius(item.value, maxV, minR, maxR);
    const ang = i * 2.399963;
    const rad = Math.sqrt(i) * (maxR * 0.5);
    return {
      id: item.id,
      r,
      x: cx + Math.cos(ang) * rad,
      y: cy + Math.sin(ang) * rad,
      vx: Math.cos(ang + 1) * 0.4,
      vy: Math.sin(ang + 1) * 0.4,
    };
  });
}

export function stepNodes(
  nodes: SimNode[],
  width: number,
  height: number,
  mouse: { x: number; y: number } | null
): void {
  const cx = width / 2;
  const cy = height / 2;
  const pad = 4;
  for (const n of nodes) {
    n.vx += (cx - n.x) * 0.014;
    n.vy += (cy - n.y) * 0.014;
    if (mouse) {
      const dx = n.x - mouse.x;
      const dy = n.y - mouse.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const reach = n.r + 56;
      if (dist < reach) {
        const force = ((reach - dist) / reach) * 1.6;
        n.vx += (dx / dist) * force;
        n.vy += (dy / dist) * force;
      }
    }
    n.vx += Math.sin(n.x * 0.025 + n.r) * 0.06;
    n.vy += Math.cos(n.y * 0.025 + n.r) * 0.06;
    n.vx *= 0.9;
    n.vy *= 0.9;
    n.x += n.vx;
    n.y += n.vy;
    n.x = Math.min(width - n.r - pad, Math.max(n.r + pad, n.x));
    n.y = Math.min(height - n.r - pad, Math.max(n.r + pad, n.y));
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy) || 0.001;
      const need = a.r + b.r + 1.5;
      if (dist >= need) continue;
      dx /= dist;
      dy /= dist;
      const overlap = (need - dist) / 2;
      a.x -= dx * overlap;
      a.y -= dy * overlap;
      b.x += dx * overlap;
      b.y += dy * overlap;
      const bounce = 0.35;
      const av = a.vx * dx + a.vy * dy;
      const bv = b.vx * dx + b.vy * dy;
      a.vx += (bv - av) * bounce;
      a.vy += (bv - av) * bounce;
      b.vx += (av - bv) * bounce;
      b.vy += (av - bv) * bounce;
    }
  }
}

export function hueFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 360;
}
