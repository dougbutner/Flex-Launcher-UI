#!/usr/bin/env python3
"""Foil every logo in public/tokens/xtokens into public/tokens/holoxtokens.

Static trading-card holographic look: rainbow foil bands, a plastic sleeve
streak, and sparse sparkles. Original alpha is kept. Output is 512px so the
foil still reads after the 64px sources are scaled up.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "tokens" / "xtokens"
DST = ROOT / "public" / "tokens" / "holoxtokens"
OUT = 512


def hsv_to_rgb(h: np.ndarray, s: np.ndarray, v: np.ndarray) -> np.ndarray:
    h = np.mod(h, 1.0)
    i = np.floor(h * 6).astype(np.int32) % 6
    f = h * 6 - np.floor(h * 6)
    p = v * (1 - s)
    q = v * (1 - f * s)
    t = v * (1 - (1 - f) * s)
    r = np.choose(i, [v, q, p, p, t, v])
    g = np.choose(i, [t, v, v, q, p, p])
    b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], axis=-1)


def soft_light(base: np.ndarray, blend: np.ndarray) -> np.ndarray:
    return np.where(
        blend <= 0.5,
        base - (1 - 2 * blend) * base * (1 - base),
        base + (2 * blend - 1) * (np.sqrt(np.clip(base, 0, 1)) - base),
    )


def foil(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA").resize((OUT, OUT), Image.Resampling.LANCZOS)
    arr = np.asarray(im).astype(np.float32) / 255.0
    rgb = np.clip(arr[..., :3], 0, 1)
    a = arr[..., 3]
    # 64px circles stair-step at 512. Blur only the mask.
    a_img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "L")
    a = np.asarray(a_img.filter(ImageFilter.GaussianBlur(2.4))).astype(np.float32) / 255.0

    h, w = a.shape
    y, x = np.mgrid[0:h, 0:w]
    xn = x / (w - 1) * 2 - 1
    yn = y / (h - 1) * 2 - 1
    diag = xn * 0.62 + yn * 0.78

    hue = np.mod(diag * 0.42 + 0.12 + 0.05 * np.sin(xn * 3.2) * np.cos(yn * 2.4), 1.0)
    foil_rgb = hsv_to_rgb(hue, np.full_like(hue, 0.82), np.ones_like(hue))
    lum = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    soft = soft_light(rgb, foil_rgb)
    screened = 1 - (1 - rgb) * (1 - foil_rgb * 0.5)
    dark = np.clip((0.32 - lum) / 0.32, 0, 1)[..., None]
    out = rgb * 0.46 + soft * 0.54
    out = out * (1 - dark * 0.6) + screened * (dark * 0.6)

    # One set of soft diffraction bands, wavy like a tilted card.
    phase = diag * 14 + 0.9 * np.sin(yn * 4.5 + xn)
    ridge = np.clip(np.cos(phase * np.pi), 0, 1) ** 4
    out = np.clip(out + foil_rgb * ridge[..., None] * 0.2, 0, 1)

    gloss = np.exp(-((xn * 0.75 - yn * 0.55 - 0.12) ** 2) / 0.018)
    gloss = gloss * np.clip(a, 0, 1)
    out = 1 - (1 - out) * (1 - gloss[..., None] * 0.34)

    rng = np.random.default_rng(20261001)
    spark = (rng.random((h, w)) > 0.994).astype(np.float32)
    spark = spark * (a > 0.92)
    out = np.clip(out + spark[..., None] * foil_rgb * 0.75, 0, 1)

    out = out * (a > 0.004)[..., None]
    rgba = np.dstack([np.clip(out, 0, 1), np.clip(a, 0, 1)])
    return Image.fromarray((rgba * 255).astype(np.uint8), "RGBA")


def main() -> int:
    if not SRC.is_dir():
        print(f"missing {SRC}", file=sys.stderr)
        return 1
    DST.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in SRC.iterdir() if p.suffix.lower() == ".png")
    if not files:
        print(f"no pngs in {SRC}", file=sys.stderr)
        return 1
    for src in files:
        foil(Image.open(src)).save(DST / src.name, "PNG")
        print(src.name)
    print(f"{len(files)} -> {DST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
