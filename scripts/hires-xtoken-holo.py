#!/usr/bin/env python3
"""Sharp xtoken logos, 512 holographic stills, and a short gold shimmer loop.

Sources are vector logos (1024px PNG in public/tokens/xtokenpng).
512holoxtokens is the foil still. 512holoxtokensanimated is a WebP.
512holoxtokensapng is the same loop as an APNG (.png), transparent background.
128holoxtokensapng is that APNG at 128px. 128holoxtokensshiny moves the foil
lines with the gold streak, same 128px size and timing.
14 fps for a 1 second sweep, then a 2 second hold, infinite loop.
The sweep matches the site gold line (.tetra-shimmer / .btn::before).

Needs Node sharp at /tmp/raster (npm install sharp). Raster only. Foil stays here.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PARENT = ROOT / "public" / "tokens" / "xtokenpng"
STILL = PARENT / "512holoxtokens"
ANIM = PARENT / "512holoxtokensanimated"
APNG = PARENT / "512holoxtokensapng"
APNG128 = PARENT / "128holoxtokensapng"
SHINY128 = PARENT / "128holoxtokensshiny"
CACHE = Path("/tmp/xtoken-logo-src")
SHARP = Path("/tmp/raster/node_modules/sharp")
SIZE = 1024
OUT = 512
FONT = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"

SPOTHQ = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/{}.svg"
W3 = "https://raw.githubusercontent.com/0xa3k5/web3icons/main/raw-svgs/tokens/branded/{}.svg"
TERRA = "https://raw.githubusercontent.com/terra-money/assets/master/icon/{}"

# Same circular marks MetalX shipped at 64px, as the color SVG.
SPOTHQ_SLUG = {
    "XBTC": "btc",
    "XETH": "eth",
    "XXRP": "xrp",
    "XBNB": "bnb",
    "XUSDC": "usdc",
    "XUSDT": "usdt",
    "XDOGE": "doge",
    "XADA": "ada",
    "XXLM": "xlm",
    "XLTC": "ltc",
    "XBCH": "bch",
    "XEOS": "eos",
    "XDOT": "dot",
    "XFIL": "fil",
    "XLINK": "link",
    "XPAX": "pax",
    "XPAXG": "paxg",
    "XTHETA": "theta",
    "XTRX": "trx",
    "XTUSD": "tusd",
    "XUNI": "uni",
    "XINCH": "1inch",
}


def curl(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 80:
        return
    subprocess.check_call(
        ["curl", "-fsSL", "--max-time", "40", "-A", "Mozilla/5.0", "-o", str(dest), url],
    )


def raster_svg(src: Path, size: int = SIZE) -> Image.Image:
    if not SHARP.exists():
        raise SystemExit("missing sharp. Run: mkdir -p /tmp/raster && cd /tmp/raster && npm install sharp")
    dest = src.with_suffix(".raster.png")
    script = r"""
const sharp = require(process.env.SHARP_MOD);
const [src, dest, size] = process.argv.slice(1);
sharp(src)
  .resize(Number(size), Number(size), { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(dest)
  .catch((err) => { console.error(err); process.exit(1); });
"""
    subprocess.check_call(
        ["node", "-e", script, str(src), str(dest), str(size)],
        env={**dict(**{k: v for k, v in __import__("os").environ.items()}), "SHARP_MOD": str(SHARP)},
    )
    return Image.open(dest).convert("RGBA")


def trim_fit(im: Image.Image, size: int = SIZE, pad: float = 0.04) -> Image.Image:
    arr = np.asarray(im)
    ys, xs = np.where(arr[..., 3] > 12)
    if len(xs) == 0:
        return im.resize((size, size), Image.Resampling.LANCZOS)
    crop = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    side = max(1, int(size * (1 - pad * 2)))
    crop.thumbnail((side, side), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(crop, ((size - crop.width) // 2, (size - crop.height) // 2), crop)
    return canvas


def recolor(im: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    arr = np.asarray(im).copy()
    arr[..., 0] = rgb[0]
    arr[..., 1] = rgb[1]
    arr[..., 2] = rgb[2]
    return Image.fromarray(arr)


def on_circle(glyph: Image.Image, fill: tuple[int, int, int], scale: float) -> Image.Image:
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).ellipse((0, 0, SIZE - 1, SIZE - 1), fill=fill + (255,))
    fitted = trim_fit(glyph, SIZE, pad=(1 - scale) / 2)
    return Image.alpha_composite(canvas, fitted)


def metal_logo() -> Image.Image:
    svg = CACHE / "METAL-draw.svg"
    svg.write_text(
        f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#d24ea8"/>
<stop offset="0.5" stop-color="#7a3ec8"/>
<stop offset="1" stop-color="#3e6496"/>
</linearGradient></defs>
<circle cx="{SIZE // 2}" cy="{SIZE // 2}" r="{SIZE // 2}" fill="url(#g)"/>
</svg>""",
        encoding="utf-8",
    )
    im = raster_svg(svg)
    draw = ImageDraw.Draw(im)
    font = ImageFont.truetype(FONT, int(SIZE * 0.58))
    bbox = draw.textbbox((0, 0), "M", font=font)
    x = (SIZE - (bbox[2] - bbox[0])) / 2 - bbox[0]
    y = (SIZE - (bbox[3] - bbox[1])) / 2 - bbox[1] - SIZE * 0.03
    draw.text((x, y), "M", font=font, fill=(255, 255, 255, 255))
    return im


def xmt_logo() -> Image.Image:
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    draw.ellipse((0, 0, SIZE - 1, SIZE - 1), fill=(255, 255, 255, 255))
    scale = SIZE / 64
    bars = [
        (13.2, 18, 5.2, 27, (130, 28, 186)),
        (24, 23, 5.0, 18, (248, 80, 102)),
        (35, 26.5, 4.6, 10.5, (252, 138, 55)),
        (45.2, 18, 5.2, 27, (255, 198, 12)),
    ]
    for x, y, w, h, color in bars:
        draw.rounded_rectangle(
            (x * scale, y * scale, (x + w) * scale, (y + h) * scale),
            radius=(w * scale) / 2,
            fill=color + (255,),
        )
    return im


def load_remote(url: str, name: str) -> Image.Image:
    dest = CACHE / name
    curl(url, dest)
    return trim_fit(raster_svg(dest))


def source_for(symbol: str) -> Image.Image:
    if symbol in SPOTHQ_SLUG:
        return load_remote(SPOTHQ.format(SPOTHQ_SLUG[symbol]), f"{symbol}.svg")
    if symbol == "XSOL":
        return load_remote(W3.format("SOL"), "SOL.svg")
    if symbol == "XDC":
        return load_remote(W3.format("XDC"), "XDC.svg")
    if symbol == "XEUROC":
        return load_remote(W3.format("EURC"), "EURC.svg")
    if symbol == "XLUNA":
        return load_remote(TERRA.format("svg/LUNC.svg"), "LUNC.svg")
    if symbol == "XUST":
        return load_remote(TERRA.format("svg/Terra/UST.svg"), "UST.svg")
    if symbol == "XBUSD":
        mark = recolor(load_remote(TERRA.format("thorswap/BUSD.svg"), "BUSD.svg"), (255, 255, 255))
        return on_circle(mark, (240, 185, 11), 0.62)
    if symbol == "XHBAR":
        mark = load_remote(W3.format("HBAR"), "HBAR.svg")
        return on_circle(recolor(mark, (255, 255, 255)), (0, 0, 0), 0.7)
    if symbol == "XPYUSD":
        mark = load_remote(W3.format("PYUSD"), "PYUSD.svg")
        return on_circle(recolor(mark, (255, 255, 255)), (48, 96, 216), 0.66)
    if symbol == "XLUNR":
        # LunarCrush mark: purple arc and dot, same shapes as the 64px icon.
        return recolor(load_remote(W3.format("LUNR"), "LUNR.svg"), (130, 103, 227))
    if symbol == "METAL":
        return metal_logo()
    if symbol == "XMT":
        return xmt_logo()
    raise SystemExit(f"no source for {symbol}")


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


def foil(im: Image.Image, size: int, phase_shift: float = 0.0, ridge_gain: float = 0.2) -> Image.Image:
    im = im.convert("RGBA")
    if im.size != (size, size):
        im = im.resize((size, size), Image.Resampling.LANCZOS)
    arr = np.asarray(im).astype(np.float32) / 255.0
    rgb = np.clip(arr[..., :3], 0, 1)
    a = arr[..., 3]
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
    phase = diag * 14 + 0.9 * np.sin(yn * 4.5 + xn) + phase_shift
    ridge = np.clip(np.cos(phase * np.pi), 0, 1) ** 4
    out = np.clip(out + foil_rgb * ridge[..., None] * ridge_gain, 0, 1)
    gloss = np.exp(-((xn * 0.75 - yn * 0.55 - 0.12) ** 2) / 0.018) * np.clip(a, 0, 1)
    out = 1 - (1 - out) * (1 - gloss[..., None] * 0.34)
    rng = np.random.default_rng(20261001)
    spark = (rng.random((h, w)) > 0.996).astype(np.float32) * (a > 0.92)
    out = np.clip(out + spark[..., None] * foil_rgb * 0.7, 0, 1)
    out = out * (a > 0.004)[..., None]
    rgba = np.dstack([np.clip(out, 0, 1), np.clip(a, 0, 1)])
    return Image.fromarray((rgba * 255).astype(np.uint8), "RGBA")


def ease(x: float) -> float:
    """Linear. The site bezier sits still at 14 samples, so the line never moves."""
    return x


def shimmer(still: Image.Image, frame: int, frames: int = 14) -> Image.Image:
    """Gold 135deg line, same colors as .tetra-shimmer, crossing in one second."""
    arr = np.asarray(still).astype(np.float32) / 255.0
    h, w = arr.shape[:2]
    y, x = np.mgrid[0:h, 0:w]
    d = (x / (w - 1) + y / (h - 1)) / 2
    # Circle icons only cover the middle of the diagonal, so the line
    # travels that span for the whole second instead of sitting in the corners.
    center = 0.93 - 0.86 * ease(frame / (frames - 1))
    dist = np.abs(d - center) * w
    half = w * 0.07
    core = w * 0.02
    edge = np.clip((half - dist) / half, 0, 1)
    hot = np.clip((core - dist) / max(core, 1), 0, 1)
    alpha = np.clip(0.28 * edge + 0.85 * hot, 0, 1) * np.clip(arr[..., 3], 0, 1)
    gold = np.array([1.0, 229 / 255, 102 / 255], dtype=np.float32)
    rgb = arr[..., :3] * (1 - alpha[..., None]) + gold * alpha[..., None]
    rgba = np.dstack([np.clip(rgb, 0, 1), arr[..., 3]])
    return Image.fromarray((rgba * 255).astype(np.uint8), "RGBA")


def anim_frames(still: Image.Image) -> tuple[list[Image.Image], list[int]]:
    frames = [shimmer(still, i) for i in range(14)]
    frames.append(still)
    # 14 fps across the 1s sweep, then hold 2s. 71*13+77 = 1000.
    return frames, [71] * 13 + [77, 2000]


def write_anim(still: Image.Image, dest: Path) -> None:
    frames, durations = anim_frames(still)
    frames[0].save(
        dest,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        format="WEBP",
        quality=48,
        alpha_quality=90,
        method=4,
        exact=True,
        kmin=1,
        kmax=1,
    )


def write_apng(still: Image.Image, dest: Path, frames: list[Image.Image] | None = None) -> None:
    if frames is None:
        frames, durations = anim_frames(still)
    else:
        durations = [71] * 13 + [77, 2000]
    # disposal 1 clears each frame to transparent before the next one.
    frames[0].save(
        dest,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        format="PNG",
        disposal=1,
        blend=0,
        compress_level=9,
    )


def shiny_frames(logo: Image.Image) -> list[Image.Image]:
    """Foil lines slide one band-spacing while the gold streak crosses."""
    frames: list[Image.Image] = []
    for i in range(14):
        t = i / 13
        foiled = foil(logo, OUT, phase_shift=t * 2, ridge_gain=0.34)
        small = foiled.resize((128, 128), Image.Resampling.LANCZOS)
        frames.append(shimmer(small, i))
    rest = foil(logo, OUT, phase_shift=0, ridge_gain=0.34)
    frames.append(rest.resize((128, 128), Image.Resampling.LANCZOS))
    return frames


def main() -> int:
    src_dir = ROOT / "public" / "tokens" / "xtokens"
    symbols = sorted(p.stem for p in src_dir.glob("*.png"))
    if not symbols:
        print("no xtoken pngs", file=sys.stderr)
        return 1
    PARENT.mkdir(parents=True, exist_ok=True)
    STILL.mkdir(parents=True, exist_ok=True)
    ANIM.mkdir(parents=True, exist_ok=True)
    APNG.mkdir(parents=True, exist_ok=True)
    APNG128.mkdir(parents=True, exist_ok=True)
    SHINY128.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    for symbol in symbols:
        logo = source_for(symbol)
        logo.save(PARENT / f"{symbol}.png", "PNG")
        foiled = foil(logo, OUT)
        foiled.save(STILL / f"{symbol}.png", "PNG")
        write_anim(foiled, ANIM / f"{symbol}.webp")
        write_apng(foiled, APNG / f"{symbol}.png")
        small = foiled.resize((128, 128), Image.Resampling.LANCZOS)
        write_apng(small, APNG128 / f"{symbol}.png")
        write_apng(small, SHINY128 / f"{symbol}.png", shiny_frames(logo))
        kb = (ANIM / f"{symbol}.webp").stat().st_size / 1024
        apng_kb = (APNG / f"{symbol}.png").stat().st_size / 1024
        print(f"{symbol}  webp {kb:.0f}kb  apng {apng_kb:.0f}kb")
    print(f"{len(symbols)} -> {PARENT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
