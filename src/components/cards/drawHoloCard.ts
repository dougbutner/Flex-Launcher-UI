import { CARD_H, CARD_W, foilOf, type CardSettings } from "@/config/holoCards";

export type CardArt = {
  logo: CanvasImageSource | null;
  pattern: CanvasImageSource | null;
};

function roundClip(ctx: CanvasRenderingContext2D) {
  const r = 30;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(CARD_W, 0, CARD_W, CARD_H, r);
  ctx.arcTo(CARD_W, CARD_H, 0, CARD_H, r);
  ctx.arcTo(0, CARD_H, 0, 0, r);
  ctx.arcTo(0, 0, CARD_W, 0, r);
  ctx.closePath();
  ctx.clip();
}

function blit(ctx: CanvasRenderingContext2D, img: CanvasImageSource, cx: number, cy: number, side: number, turn: boolean) {
  ctx.save();
  ctx.translate(cx, cy);
  if (turn) ctx.rotate(Math.PI);
  ctx.drawImage(img, -side / 2, -side / 2, side, side);
  ctx.restore();
}

/** One still of the card from the current layers and sizes. */
export function drawHoloCard(ctx: CanvasRenderingContext2D, spec: CardSettings, art: CardArt) {
  const foil = foilOf(spec.foil);
  const mark = spec.pattern === "card" ? art.logo : art.pattern ?? art.logo;
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  ctx.save();
  roundClip(ctx);
  ctx.fillStyle = "#100e0c";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  if (spec.layers.foil) {
    const wash = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    wash.addColorStop(0, foil.stops[0]);
    wash.addColorStop(0.48, foil.stops[1]);
    wash.addColorStop(1, foil.stops[2]);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    const glare = ctx.createLinearGradient(CARD_W, CARD_H, 0, 0);
    glare.addColorStop(0, "rgba(255,255,255,0)");
    glare.addColorStop(0.42, "rgba(255,255,255,0.08)");
    glare.addColorStop(0.55, "rgba(255,255,255,0.55)");
    glare.addColorStop(0.68, "rgba(255,255,255,0.05)");
    glare.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glare;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }

  if (spec.layers.repeat && art.logo) {
    const cell = 36;
    ctx.save();
    ctx.globalAlpha = 0.22;
    for (let y = 8; y < CARD_H; y += cell) {
      for (let x = 8; x < CARD_W; x += cell) ctx.drawImage(art.logo, x, y, 22, 22);
    }
    ctx.restore();
  }

  if (spec.layers.mark && mark) {
    const side = Math.round(CARD_W * spec.logoWidth);
    const join = Math.round(CARD_H * spec.overlap);
    const sep = side - join;
    const cx = CARD_W / 2;
    const top = CARD_H / 2 - sep / 2;
    const bot = CARD_H / 2 + sep / 2;
    blit(ctx, mark, cx, top, side, false);
    blit(ctx, mark, cx, bot, side, true);
  }

  ctx.strokeStyle = foil.id === "diamond" || foil.id === "silver" ? "rgba(255,255,255,0.7)" : "rgba(255,220,160,0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, CARD_W - 24, CARD_H - 24);

  if (spec.layers.edges) {
    ctx.save();
    ctx.fillStyle = foil.ink;
    ctx.font = "700 34px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(spec.bleed, CARD_H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(spec.symbol, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = foil.ink;
    ctx.font = "700 34px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(CARD_W - spec.bleed, CARD_H / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(spec.symbol, 0, 0);
    ctx.restore();
  }

  if (spec.layers.corners) {
    const size = Math.max(64, Math.round(CARD_W * 0.145 * spec.rankScale));
    ctx.font = `700 ${size}px Inter, sans-serif`;
    const tw = ctx.measureText(spec.rank).width;
    const suitSize = Math.round(size * 0.62);
    const width = Math.max(tw, suitSize) + 8;
    const height = Math.round(size * 0.92) + Math.round(size * 0.18) + suitSize;
    const paint = (x: number, y: number, turn: boolean) => {
      ctx.save();
      ctx.translate(x + width / 2, y + height / 2);
      if (turn) ctx.rotate(Math.PI);
      ctx.translate(-width / 2, -height / 2);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.font = `700 ${size}px Inter, sans-serif`;
      ctx.fillText(spec.rank, width / 2 + 2, size * 0.82 + 2);
      ctx.fillStyle = foil.suitInk;
      ctx.fillText(spec.rank, width / 2, size * 0.82);
      ctx.font = `${suitSize}px Inter, sans-serif`;
      ctx.fillText(foil.suit, width / 2, size * 0.92 + size * 0.18 + suitSize * 0.82);
      ctx.restore();
    };
    paint(CARD_W - spec.bleed - width, spec.bleed, false);
    paint(spec.bleed, CARD_H - spec.bleed - height, true);
  }

  if (spec.layers.edition) {
    ctx.fillStyle = foil.ink;
    ctx.font = "600 16px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${foil.word.toUpperCase()}  LIMITED EDITION OF ${foil.edition}`, CARD_W / 2, CARD_H - 28);
  }

  ctx.restore();
}
