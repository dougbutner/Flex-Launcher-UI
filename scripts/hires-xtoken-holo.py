#!/usr/bin/env python3
"""Sharp xtoken logos, 512 holographic stills, and a short gold shimmer loop.

Sources are vector logos (1024px PNG in public/tokens/xtokenpng).
512holoxtokens is the foil still. 512holoxtokensanimated is a WebP.
512holoxtokensapng is the same loop as an APNG (.png), transparent background.
128holoxtokensapng is that APNG at 128px. 256holoxtokensapng is the same
loop at 256px, full color. 256holoxtokensshiny is the moving-line foil at 256px.
128holoxtokensshiny moves the foil lines with the gold streak at 128px.
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
APNG256 = PARENT / "256holoxtokensapng"
SHINY128 = PARENT / "128holoxtokensshiny"
SHINY256 = PARENT / "256holoxtokensshiny"
GEOM = {
    128: PARENT / "128geomshimmer",
    256: PARENT / "256geomshimmer",
    512: PARENT / "512geomshimmer",
}
GEOM_KINDS = ("hex", "triangle", "pentagon", "diamond", "rings", "chevron", "square", "star", "shards")
CACHE = Path("/tmp/xtoken-logo-src")
SHARP = Path("/tmp/raster/node_modules/sharp")
SIZE = 1024
OUT = 512
FONT = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"
HOUSE = {
    "EASY": ROOT / "public" / "tokens" / "easy.png",
    "WON": ROOT / "public" / "tokens" / "won.png",
    "GRAMS": ROOT / "public" / "tokens" / "grams.png",
    "MEME": ROOT / "public" / "tokens" / "meme.png",
}

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


def foil_prep(im: Image.Image, size: int) -> dict:
    """Rainbow foil before the ridge lines. Ridges are painted on later."""
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
    gloss = np.exp(-((xn * 0.75 - yn * 0.55 - 0.12) ** 2) / 0.018) * np.clip(a, 0, 1)
    rng = np.random.default_rng(20261001)
    spark = (rng.random((h, w)) > 0.996).astype(np.float32) * (a > 0.92)
    return {
        "out": out,
        "foil_rgb": foil_rgb,
        "a": a,
        "gloss": gloss,
        "spark": spark,
        "diag": diag,
        "xn": xn,
        "yn": yn,
    }


def wavy_ridge(prep: dict, phase_shift: float) -> np.ndarray:
    phase = prep["diag"] * 14 + 0.9 * np.sin(prep["yn"] * 4.5 + prep["xn"]) + phase_shift
    return np.clip(np.cos(phase * np.pi), 0, 1) ** 4


def foil_finish(prep: dict, ridge: np.ndarray, ridge_gain: float) -> Image.Image:
    out = np.clip(prep["out"] + prep["foil_rgb"] * ridge[..., None] * ridge_gain, 0, 1)
    out = 1 - (1 - out) * (1 - prep["gloss"][..., None] * 0.34)
    out = np.clip(out + prep["spark"][..., None] * prep["foil_rgb"] * 0.7, 0, 1)
    a = prep["a"]
    out = out * (a > 0.004)[..., None]
    rgba = np.dstack([np.clip(out, 0, 1), np.clip(a, 0, 1)])
    return Image.fromarray((rgba * 255).astype(np.uint8), "RGBA")


def foil(im: Image.Image, size: int, phase_shift: float = 0.0, ridge_gain: float = 0.2) -> Image.Image:
    prep = foil_prep(im, size)
    return foil_finish(prep, wavy_ridge(prep, phase_shift), ridge_gain)


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


def save_fit(frames: list[Image.Image], dest: Path, limit: int = 1024 * 1024) -> None:
    """Full color first. If that is over 1 MB, dither down until it fits (not the old 32)."""
    write_apng(frames[0], dest, frames)
    if dest.stat().st_size <= limit:
        return
    for colors in (128, 96, 80, 64):
        fitted = [
            fr.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).convert("RGBA")
            for fr in frames
        ]
        write_apng(fitted[0], dest, fitted)
        if dest.stat().st_size <= limit:
            return


def write_apng256(still: Image.Image, dest: Path) -> None:
    """256px APNG. Full color, with a light dither only when the file would pass 1 MB."""
    small = still if still.size == (256, 256) else still.resize((256, 256), Image.Resampling.LANCZOS)
    save_fit(list(anim_frames(small)[0]), dest)


def _groove(z: np.ndarray, sharp: float = 8.0) -> np.ndarray:
    m = np.abs(z - np.round(z))
    return np.clip(1 - m * sharp, 0, 1)


def geom_mask(h: int, w: int, kind: str, t: float, flip: bool, scale: float, spark: bool, seed: int) -> np.ndarray:
    """Repeating ridge stand-in for the wavy foil lines. t=0 and t=1 match."""
    y, x = np.mgrid[0:h, 0:w]
    xn = x / (w - 1) * 2 - 1
    yn = y / (h - 1) * 2 - 1
    if flip:
        xn = -xn
    direction = -1.0 if flip else 1.0
    off = t * 2.0 * direction
    sc = scale

    if kind == "hex":
        s = 0.34 * sc
        q = (2.0 / 3.0) * xn / s
        r = (-1.0 / 3.0) * xn / s + (np.sqrt(3) / 3.0) * yn / s
        ss = -q - r
        rq, rr, rs = np.round(q), np.round(r), np.round(ss)
        dq, dr, ds = np.abs(rq - q), np.abs(rr - r), np.abs(rs - ss)
        rq = np.where((dq > dr) & (dq > ds), -rr - rs, rq)
        rr = np.where((dr > dq) & (dr > ds), -rq - rs, rr)
        dist = np.maximum(np.maximum(np.abs(q - rq), np.abs(r - rr)), np.abs((-q - r) - (-rq - rr)))
        edge = np.clip((dist - 0.28) / 0.16, 0, 1)
        wave = np.clip(np.cos((rq + rr + off) * np.pi), 0, 1) ** 2
        mask = edge * (0.35 + 0.65 * wave)
    elif kind == "triangle":
        u = xn * 4.2 * sc + off
        v = (xn * 0.5 + yn * 0.866) * 4.2 * sc
        ww = (xn * -0.5 + yn * 0.866) * 4.2 * sc
        mask = np.clip(_groove(u) + _groove(v) + _groove(ww), 0, 1)
    elif kind == "pentagon":
        ang = np.arctan2(yn, xn)
        rad = np.hypot(xn, yn)
        coord = rad * (0.72 + 0.28 * np.cos(5 * ang)) * 6.5 * sc + off
        mask = _groove(coord, 7.0)
    elif kind == "diamond":
        gx = np.abs(np.mod(xn * 3.2 * sc + off, 2) - 1)
        gy = np.abs(np.mod(yn * 3.2 * sc + off, 2) - 1)
        mask = _groove(gx + gy, 5.0)
    elif kind == "rings":
        rad = np.hypot(xn, yn) * 8.0 * sc - off
        mask = _groove(rad, 7.0)
    elif kind == "chevron":
        mask = _groove(xn * 5.0 * sc + np.abs(yn) * 3.4 * sc + off, 8.0)
    elif kind == "square":
        zx = _groove(xn * 4.0 * sc + off, 12.0)
        zy = _groove(yn * 4.0 * sc + off, 12.0)
        mask = np.clip(zx + zy, 0, 1)
    elif kind == "star":
        up = _groove(xn * 4.2 * sc + off) + _groove((xn * 0.5 + yn * 0.866) * 4.2 * sc) + _groove((xn * -0.5 + yn * 0.866) * 4.2 * sc)
        down = _groove(xn * 4.2 * sc - off) + _groove((xn * 0.5 - yn * 0.866) * 4.2 * sc) + _groove((xn * -0.5 - yn * 0.866) * 4.2 * sc)
        mask = np.clip(up * down, 0, 1)
    else:
        turn = off * np.pi
        n = np.sin(xn * 8 * sc + turn) + np.sin(yn * 6 * sc - turn) + np.sin((xn + yn) * 5 * sc + turn)
        mask = _groove(n, 4.5)

    if spark:
        rng = np.random.default_rng(seed & 0xFFFFFFFF)
        spec = (rng.random((h, w)) > 0.985).astype(np.float32)
        pulse = 0.45 + 0.55 * np.cos(off * np.pi)
        mask = np.clip(mask + spec * pulse, 0, 1)
    return mask.astype(np.float32)


def geom_variants(symbol: str) -> list[tuple[str, str, bool, bool, float]]:
    """Ten treatments. The first keeps the wavy lines. Every one still gets the gold streak."""
    rng = np.random.default_rng(zlib_crc(symbol))
    out = [("classic", "classic", False, False, 1.0)]
    for kind in GEOM_KINDS:
        spark = bool(rng.random() < 0.55)
        flip = bool(rng.random() < 0.5)
        scale = float(rng.choice([0.86, 1.0, 1.16]))
        slug = kind + ("-spark" if spark else "")
        out.append((slug, kind, spark, flip, scale))
    return out


def zlib_crc(symbol: str) -> int:
    import zlib
    return zlib.crc32(symbol.encode()) & 0xFFFFFFFF


def ridge_for(prep: dict, kind: str, t: float, spark: bool, flip: bool, scale: float, seed: int) -> np.ndarray:
    if kind == "classic":
        return wavy_ridge(prep, t * 2)
    h, w = prep["a"].shape
    return geom_mask(h, w, kind, t, flip, scale, spark, seed)


def apply_variant(prep: dict, kind: str, spark: bool, flip: bool, scale: float, seed: int) -> list[Image.Image]:
    """Gold streak on every frame. The ridge is either the waves or one geometry."""
    frames: list[Image.Image] = []
    for i in range(14):
        t = i / 13
        ridge = ridge_for(prep, kind, t, spark, flip, scale, seed)
        frames.append(shimmer(foil_finish(prep, ridge, 0.34), i))
    rest = foil_finish(prep, ridge_for(prep, kind, 0.0, spark, flip, scale, seed), 0.34)
    frames.append(rest)
    return frames


def write_geom(symbol: str, logo: Image.Image) -> None:
    """Ten APNG treatments at 128, 256, and 512. Classic waves are always first."""
    prep = foil_prep(logo, OUT)
    for size, folder in GEOM.items():
        folder.mkdir(parents=True, exist_ok=True)
    for slug, kind, spark, flip, scale in geom_variants(symbol):
        frames = apply_variant(prep, kind, spark, flip, scale, zlib_crc(symbol))
        for size, folder in GEOM.items():
            if size == 512:
                sized = frames
            else:
                sized = [fr.resize((size, size), Image.Resampling.LANCZOS) for fr in frames]
            dest = folder / f"{symbol}-{slug}.png"
            if size == 256:
                save_fit(sized, dest)
            else:
                write_apng(sized[0], dest, sized)


def shiny_frames(logo: Image.Image, size: int = 128) -> list[Image.Image]:
    """Foil lines slide one band-spacing while the gold streak crosses.

    128px still foils at 512 and scales down. 256px is drawn at 256 so the
    file stays near 1 MB without a color cut.
    """
    render = OUT if size < 256 else size
    frames: list[Image.Image] = []
    for i in range(14):
        t = i / 13
        foiled = foil(logo, render, phase_shift=t * 2, ridge_gain=0.34)
        if foiled.size != (size, size):
            foiled = foiled.resize((size, size), Image.Resampling.LANCZOS)
        frames.append(shimmer(foiled, i))
    rest = foil(logo, render, phase_shift=0, ridge_gain=0.34)
    if rest.size != (size, size):
        rest = rest.resize((size, size), Image.Resampling.LANCZOS)
    frames.append(rest)
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
    APNG256.mkdir(parents=True, exist_ok=True)
    SHINY256.mkdir(parents=True, exist_ok=True)
    SHINY128.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    for symbol in symbols:
        logo = source_for(symbol)
        logo.save(PARENT / f"{symbol}.png", "PNG")
        foiled = foil(logo, OUT)
        foiled.save(STILL / f"{symbol}.png", "PNG")
        write_anim(foiled, ANIM / f"{symbol}.webp")
        write_apng(foiled, APNG / f"{symbol}.png")
        write_apng256(foiled, APNG256 / f"{symbol}.png")
        save_fit(shiny_frames(logo, 256), SHINY256 / f"{symbol}.png")
        small = foiled.resize((128, 128), Image.Resampling.LANCZOS)
        write_apng(small, APNG128 / f"{symbol}.png")
        write_apng(small, SHINY128 / f"{symbol}.png", shiny_frames(logo))
        kb = (ANIM / f"{symbol}.webp").stat().st_size / 1024
        apng_kb = (APNG / f"{symbol}.png").stat().st_size / 1024
        print(f"{symbol}  webp {kb:.0f}kb  apng {apng_kb:.0f}kb")
    write_house()
    print(f"{len(symbols)} -> {PARENT}")
    return 0


def write_house() -> None:
    """EASY, WON, GRAMS, MEME into the same holo folders as the xtokens."""
    for folder in (PARENT, STILL, ANIM, APNG, APNG128, APNG256, SHINY128, SHINY256):
        folder.mkdir(parents=True, exist_ok=True)
    for symbol, path in HOUSE.items():
        logo = Image.open(path).convert("RGBA")
        logo.save(PARENT / f"{symbol}.png", "PNG")
        foiled = foil(logo, OUT)
        foiled.save(STILL / f"{symbol}.png", "PNG")
        write_anim(foiled, ANIM / f"{symbol}.webp")
        write_apng(foiled, APNG / f"{symbol}.png")
        small = foiled.resize((128, 128), Image.Resampling.LANCZOS)
        write_apng(small, APNG128 / f"{symbol}.png")
        write_apng256(foiled, APNG256 / f"{symbol}.png")
        save_fit(shiny_frames(logo, 256), SHINY256 / f"{symbol}.png")
        write_apng(small, SHINY128 / f"{symbol}.png", shiny_frames(logo))
        print(symbol, "house")


if __name__ == "__main__":
    raise SystemExit(main())
