const MAX_BILLS = 200;

type Bit = { el: HTMLDivElement; x: number; y: number; vx: number; vy: number; rot: number; vr: number };

let layer: HTMLDivElement | null = null;
let bits: Bit[] = [];
let frame = 0;
let last = 0;

function svg(w: number, h: number, body: string) {
  const el = document.createElement("div");
  el.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;
  return el;
}

function bill() {
  return svg(
    56,
    26,
    `<rect width="56" height="26" rx="3" fill="#1f7a3a"/>
     <rect x="2" y="2" width="52" height="22" rx="2" fill="none" stroke="#b7e2c2" stroke-width="1"/>
     <ellipse cx="28" cy="13" rx="8" ry="7" fill="#e8f6ec"/>
     <text x="28" y="16.5" text-anchor="middle" font-size="9" font-family="ui-monospace,monospace" font-weight="700" fill="#14532d">$1</text>`,
  );
}

function coin(d: number, fill: string, label: string, ink: string) {
  const r = d / 2;
  return svg(
    d,
    d,
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="${fill}" stroke="rgba(0,0,0,.25)" stroke-width="1"/>
     <text x="${r}" y="${r + 3}" text-anchor="middle" font-size="${d > 18 ? 8 : 7}" font-family="ui-monospace,monospace" font-weight="700" fill="${ink}">${label}</text>`,
  );
}

function piece(kind: "1" | "25" | "10" | "5" | "1c") {
  if (kind === "1") return bill();
  if (kind === "25") return coin(22, "#c5c9ce", "25", "#1f2937");
  if (kind === "10") return coin(16, "#d7dbe0", "10", "#1f2937");
  if (kind === "5") return coin(20, "#b9bec4", "5", "#1f2937");
  return coin(18, "#c4784a", "1", "#3f1d0b");
}

function ensure() {
  if (layer) return layer;
  layer = document.createElement("div");
  layer.className = "money-rain";
  document.body.appendChild(layer);
  return layer;
}

function step(now: number) {
  const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
  last = now;
  const floor = window.innerHeight + 48;
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i];
    b.vy = Math.min(72, b.vy + 220 * dt);
    b.vx *= 0.985;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.vr * dt;
    if (b.y > floor) {
      b.el.remove();
      bits.splice(i, 1);
      continue;
    }
    b.el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${b.rot}deg)`;
  }
  if (bits.length) frame = requestAnimationFrame(step);
  else {
    frame = 0;
    layer?.remove();
    layer = null;
  }
}

function launch(kind: "1" | "25" | "10" | "5" | "1c", x: number, y: number) {
  const el = piece(kind);
  const w = kind === "1" ? 56 : kind === "10" ? 16 : kind === "1c" ? 18 : kind === "5" ? 20 : 22;
  const host = ensure();
  host.appendChild(el);
  const bit: Bit = {
    el,
    x: x - w / 2 + (Math.random() - 0.5) * 18,
    y: y - 8,
    vx: (Math.random() - 0.5) * 140,
    vy: -140 - Math.random() * 80,
    rot: (Math.random() - 0.5) * 24,
    vr: (Math.random() - 0.5) * 70,
  };
  bits.push(bit);
  if (!frame) {
    last = performance.now();
    frame = requestAnimationFrame(step);
  }
}

function walletOpen() {
  for (const id of ["proton-web-ui", "wharfkit-web-ui", "xpr-forge-wharf-ui"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.childElementCount > 0) return true;
    if (el.shadowRoot && el.shadowRoot.childNodes.length > 0) return true;
  }
  return Boolean(document.querySelector("dialog[open]"));
}

/** Resolves once the signing window is gone, plus a short beat so the close finishes. */
export function whenWalletClosed() {
  return new Promise<void>((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (!walletOpen() || performance.now() - start > 4000) {
        window.setTimeout(resolve, 220);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** $1 bills for each whole dollar, then quarters, dimes, nickels, and pennies. */
export function rainCash(usd: number, from: HTMLElement | { x: number; y: number }) {
  if (!(usd > 0) || !Number.isFinite(usd)) return;
  const cents = Math.round(usd * 100);
  const kinds: Array<"1" | "25" | "10" | "5" | "1c"> = [];
  const dollars = Math.min(MAX_BILLS, Math.floor(cents / 100));
  for (let i = 0; i < dollars; i++) kinds.push("1");
  let rem = cents % 100;
  for (let i = 0; i < Math.floor(rem / 25); i++) kinds.push("25");
  rem %= 25;
  for (let i = 0; i < Math.floor(rem / 10); i++) kinds.push("10");
  rem %= 10;
  for (let i = 0; i < Math.floor(rem / 5); i++) kinds.push("5");
  rem %= 5;
  for (let i = 0; i < rem; i++) kinds.push("1c");
  const origin = "x" in from ? from : (() => {
    const box = from.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top };
  })();
  kinds.forEach((kind, i) => {
    window.setTimeout(() => launch(kind, origin.x, origin.y), i * 90);
  });
}
