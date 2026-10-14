#!/usr/bin/env python3
"""Press plates on the Flex landing background.

The background is the home page field: #050705, the three home glows,
and public/tetra/pattern-field.svg tiled at 208x180 with opacity 0.28.
Type, panels, and arrows come from the flex.report make-hero tools.

  python3 press/diagram.py background
  python3 press/diagram.py angel --out press/samples/angel-numbers.png
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
HERO = Path("/Users/fresh/Dropbox/htdocs/flex.report/.cursor/skills/make-hero-image/scripts")
sys.path.insert(0, str(HERO))
import make_hero  # noqa: E402

W, H = 1280, 720
VOID = (5, 7, 5, 255)
FIELD = ROOT / "public" / "tetra" / "pattern-field.svg"
HOLO = ROOT / "public" / "tokens" / "holoxtokens"
FLAT = ROOT / "public" / "tokens" / "xtokens"
BG = Path(__file__).resolve().parent / "landing-bg.png"


def _tile() -> Image.Image:
    """One 208x180 cell of pattern-field.svg. Stroke #22c55e at 0.22."""
    scale = 2
    tw, th = 104 * scale, 90 * scale
    im = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ink = (34, 197, 94, int(255 * 0.22))
    width = max(1, round(0.55 * scale))

    def S(pts):
        return [(x * scale, y * scale) for x, y in pts]

    polys = [
        [(0, 90), (52, 0), (104, 90)],
        [(52, 0), (104, 90), (156, 0)],
        [(-52, 0), (0, 90), (52, 0)],
    ]
    lines = [
        [(52, 60), (0, 90)],
        [(52, 60), (52, 0)],
        [(52, 60), (104, 90)],
        [(104, 30), (52, 0)],
        [(104, 30), (104, 90)],
        [(104, 30), (156, 0)],
        [(0, 30), (-52, 0)],
        [(0, 30), (0, 90)],
        [(0, 30), (52, 0)],
    ]
    for pts in polys:
        d.line(S(pts) + [S(pts)[0]], fill=ink, width=width)
    for a, b in lines:
        d.line(S([a, b]), fill=ink, width=width)
    return im


def _glow(box_w, box_h, cx, cy, rgb, amount) -> np.ndarray:
    """CSS radial-gradient(ellipse at cx,cy, color-mix(rgb amount%, transparent), transparent 42%)."""
    y, x = np.mgrid[0:box_h, 0:box_w]
    rx = max(cx, box_w - cx)
    ry = max(cy, box_h - cy)
    t = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
    a = np.clip((0.42 - t) / 0.42, 0, 1) * (amount / 100)
    layer = np.zeros((box_h, box_w, 4), np.float32)
    layer[..., 0] = rgb[0]
    layer[..., 1] = rgb[1]
    layer[..., 2] = rgb[2]
    layer[..., 3] = a
    return layer


def landing() -> Image.Image:
    """Home background for a 1280x720 frame. Glow box is inset -20%. Field is inset -24%."""
    base = np.zeros((H, W, 4), np.float32)
    base[..., 0], base[..., 1], base[..., 2], base[..., 3] = 5, 7, 5, 1

    gw, gh = int(W * 1.4), int(H * 1.4)
    ox, oy = int(W * 0.2), int(H * 0.2)
    glows = np.zeros((gh, gw, 4), np.float32)
    for fx, fy, rgb, amount in (
        (0.12, 0.18, (212, 175, 55), 28),
        (0.88, 0.12, (255, 229, 102), 22),
        (0.70, 0.88, (34, 197, 94), 14),
    ):
        g = _glow(gw, gh, fx * gw, fy * gh, rgb, amount)
        glows[..., :3] = glows[..., :3] * (1 - g[..., 3:]) + g[..., :3] * g[..., 3:]
        glows[..., 3] = glows[..., 3] + g[..., 3] * (1 - glows[..., 3])
    crop = glows[oy : oy + H, ox : ox + W]
    base[..., :3] = base[..., :3] * (1 - crop[..., 3:]) + crop[..., :3] * crop[..., 3:]

    field = Image.new("RGBA", (int(W * 1.48), int(H * 1.48)), (0, 0, 0, 0))
    tile = _tile()
    for y in range(0, field.height, tile.height):
        for x in range(0, field.width, tile.width):
            field.paste(tile, (x, y))
    arr = np.asarray(field).astype(np.float32)
    arr[..., 3] *= 0.28
    fx, fy = int(W * 0.24), int(H * 0.24)
    patch = arr[fy : fy + H, fx : fx + W] / 255.0
    base[..., :3] = base[..., :3] * (1 - patch[..., 3:]) + patch[..., :3] * 255 * patch[..., 3:]
    out = np.zeros((H, W, 4), np.uint8)
    out[..., :3] = np.clip(base[..., :3], 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(base[..., 3] * 255, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def coin(kind: str, symbol: str, px: int) -> Image.Image:
    path = (HOLO if kind == "holo" else FLAT) / f"{symbol}.png"
    im = Image.open(path).convert("RGBA").resize((px, px), Image.Resampling.LANCZOS)
    mask = Image.new("L", (px, px), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, px - 1, px - 1), fill=255)
    im.putalpha(mask)
    return im


def paste(base: Image.Image, im: Image.Image, cx: int, cy: int) -> None:
    base.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))


def angel(caption: str) -> Image.Image:
    """One motion: a picked number, then the matching payout moves to the holder."""
    img = landing().convert("RGBA")
    d = ImageDraw.Draw(img)
    make_hero.title_block(d, "Angel numbers", "Pick 0 to 999. A match gets paid.", y=36, title_size=68)

    labels = ["Pick\n0 to 999", "The draw\nfalls", "Matches\nget paid"]
    make_hero.flow_boxes(d, labels, y=430, box_h=150, font_size=22)
    box_w, gap, n = 260, 24, 3
    x0 = (W - (n * box_w + (n - 1) * gap)) // 2
    centers = [x0 + i * (box_w + gap) + box_w // 2 for i in range(n)]
    # Holo coin is the pot in motion. 777 is a number in the 0-999 pick. Flat coin is the payout.
    paste(img, coin("holo", "XBTC", 100), centers[0], 300)
    paste(img, coin("flat", "XUSDC", 88), centers[2], 300)
    d = ImageDraw.Draw(img)
    d.text((centers[1], 292), "777", fill=make_hero.YELLOW, font=make_hero.bebas(96), anchor="mm")
    make_hero.arrow_h(d, centers[0] + 62, centers[1] - 78, 300)
    make_hero.arrow_h(d, centers[1] + 78, centers[2] - 56, 300)

    line = caption or "Taken from reflections. Not an extra tax."
    d.text((W / 2, 660), line, fill=make_hero.GOLD, font=make_hero.openb(22), anchor="mm")
    return img.convert("RGB")


def main() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("background")
    one = sub.add_parser("angel")
    one.add_argument("--out", required=True)
    one.add_argument("--caption", default="")
    args = p.parse_args()
    if args.cmd == "background":
        landing().convert("RGB").save(BG, "PNG")
        print(BG)
        return
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    angel(args.caption).save(out, "PNG")
    print(out)


if __name__ == "__main__":
    main()
