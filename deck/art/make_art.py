"""Procedural glitch art for the Mercado deck (original, seeded, no external images).

Renders a peso note and the HTTP 402 log, then datamoshes them: pixel-sorted
streaks, slit-scan smears, macroblock compression tiles, halftone dot fields,
scanlines and film grain. Run: python3 deck/art/make_art.py  -> deck/assets/art-*.png
"""
import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "assets")
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
MONO_B = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

BLACK = (13, 13, 13)
LIME = (212, 255, 58)
PINK = (231, 154, 184)
MINT = (143, 217, 168)
LAV = (169, 155, 214)
PAPER = (230, 230, 220)
GREY = (154, 154, 150)
PALETTE = np.array([BLACK, LIME, PINK, MINT, LAV, PAPER, GREY], dtype=np.float32)


def font(size, bold=False):
    return ImageFont.truetype(MONO_B if bold else MONO, size)


def lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def peso_note(w, h, rng):
    """A stylized banknote: guilloche rosette, frame, big denomination."""
    im = Image.new("RGB", (w, h), BLACK)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=28, outline=PAPER, width=6)
    d.rounded_rectangle([22, 22, w - 23, h - 23], radius=18, outline=GREY, width=2)
    cx, cy = int(w * 0.68), h // 2
    for k in range(70):
        col = [LAV, MINT, PINK, PAPER][k % 4]
        r0 = 40 + k * 3.1
        pts = []
        for t in range(0, 721):
            a = t / 720 * 2 * math.pi
            r = r0 + 22 * math.sin(7 * a + k * 0.21) + 9 * math.cos(13 * a)
            pts.append((cx + r * math.cos(a), cy + r * 0.72 * math.sin(a)))
        d.line(pts, fill=col, width=1)
    d.text((70, 60), "xMXN", font=font(110, True), fill=PAPER)
    d.text((70, h - 250), "100", font=font(230, True), fill=LIME)
    d.text((76, h - 72), "PESO SINTETICO · TESTNET · SIN VALOR", font=font(30), fill=GREY)
    for i in range(14):
        y = 210 + i * 22
        d.line([(70, y), (70 + rng.integers(160, 520), y)], fill=GREY, width=3)
    return np.asarray(im).astype(np.float32)


def log_panel(w, h):
    lines = [
        ("→ POST /api/bills/pay", PAPER),
        ("← 402 Payment Required", LIME),
        ("  amount 100 xMXN · tempo/charge", GREY),
        ("→ transfer 100 xMXN", MINT),
        ("→ retry + credential", LAV),
        ("← 200 OK · Payment-Receipt", PINK),
        ("  verified on-chain", MINT),
    ]
    im = Image.new("RGB", (w, h), BLACK)
    d = ImageDraw.Draw(im)
    f = font(58, True)
    for i, (t, c) in enumerate(lines):
        d.text((40, 30 + i * 84), t, font=f, fill=c)
    return np.asarray(im).astype(np.float32)


def pixel_sort_rows(a, rng, rows, thr=40, reverse=False):
    L = lum(a)
    for y in rows:
        m = L[y] > thr
        if not m.any():
            continue
        idx = np.flatnonzero(np.diff(np.concatenate(([0], m.view(np.int8), [0]))))
        for s, e in zip(idx[::2], idx[1::2]):
            if e - s < 4:
                continue
            seg = a[y, s:e]
            order = np.argsort(L[y, s:e], kind="stable")
            if reverse:
                order = order[::-1]
            a[y, s:e] = seg[order]
    return a


def slit_smear(a, rng, n, direction=-1, maxlen=900):
    h, w, _ = a.shape
    for _ in range(n):
        y0 = int(rng.integers(0, h - 8))
        hh = int(rng.integers(2, 26))
        x0 = int(rng.integers(w // 4, w - 2))
        ln = int(rng.integers(80, maxlen))
        for y in range(y0, min(h, y0 + hh)):
            col = a[y, x0].copy()
            if lum(col[None])[0] < 25:
                continue
            if direction < 0:
                s = max(0, x0 - ln)
                fade = np.linspace(0.15, 1.0, x0 - s)[:, None]
                a[y, s:x0] = np.maximum(a[y, s:x0], col * fade)
            else:
                e = min(w, x0 + ln)
                fade = np.linspace(1.0, 0.15, e - x0)[:, None]
                a[y, x0:e] = np.maximum(a[y, x0:e], col * fade)
    return a


def quantize(c):
    d = ((PALETTE - c) ** 2).sum(1)
    return PALETTE[int(d.argmin())]


def macroblocks(a, rng, bs=24, p_shift=0.06, p_flat=0.05, region=None):
    h, w, _ = a.shape
    src = a.copy()
    x_lo, x_hi = region if region else (0, w)
    for by in range(0, h - bs, bs):
        for bx in range(x_lo - x_lo % bs, min(x_hi, w - bs), bs):
            r = rng.random()
            if r < p_shift:
                dx = int(rng.integers(-6, 7)) * bs
                dy = int(rng.integers(-2, 3)) * bs
                sx, sy = np.clip(bx + dx, 0, w - bs), np.clip(by + dy, 0, h - bs)
                a[by:by + bs, bx:bx + bs] = src[sy:sy + bs, sx:sx + bs]
            elif r < p_shift + p_flat:
                blk = src[by:by + bs, bx:bx + bs]
                if lum(blk).mean() > 20:
                    a[by:by + bs, bx:bx + bs] = quantize(blk.reshape(-1, 3).mean(0))
    return a


def halftone(a, rng, x0, y0, x1, y1, color, step=12, gamma=1.0):
    h, w, _ = a.shape
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    for y in range(y0, y1, step):
        for x in range(x0, x1, step):
            t = ((x - x0) / max(1, x1 - x0))
            v = (math.sin(y * 0.018 + t * 5.0) * 0.5 + 0.5) * t ** gamma
            r = v * step * 0.48
            if r > 0.8:
                d.ellipse([x - r, y - r, x + r, y + r], fill=color)
    return np.asarray(im).astype(np.float32)


def bayer_dither_field(a, x0, y0, x1, y1, color, strength=1.0):
    B = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
    hh, ww = y1 - y0, x1 - x0
    yy, xx = np.mgrid[0:hh, 0:ww]
    g = (xx / ww) * strength * (0.6 + 0.4 * np.sin(yy / hh * math.pi))
    m = g > B[yy % 4, xx % 4]
    sub = a[y0:y1, x0:x1]
    sub[m] = np.maximum(sub[m], np.array(color, dtype=np.float32) * 0.85)
    return a


def finish(a, rng, scan=True, grain=9.0):
    if scan:
        a[::3] *= 0.82
    a += rng.normal(0, grain, a.shape[:2])[..., None]
    return np.clip(a, 0, 255).astype(np.uint8)


def left_fade(a, start, end):
    w = a.shape[1]
    ramp = np.clip((np.arange(w) - start) / max(1, end - start), 0, 1) ** 1.6
    bg = np.array(BLACK, dtype=np.float32)
    return bg + (a - bg) * ramp[None, :, None]


def save(a, name):
    Image.fromarray(a).save(os.path.join(OUT, name), optimize=True)
    print(name, a.shape[1], "x", a.shape[0])


def cover(rng):
    W, H = 1920, 1080
    a = np.full((H, W, 3), BLACK, dtype=np.float32)
    note = peso_note(980, 560, rng)
    a[250:810, 860:1840] = note
    a = halftone(a, rng, 700, 60, 1900, 250, LAV, step=14, gamma=1.4)
    a = bayer_dither_field(a, 1100, 840, 1920, 1080, MINT, strength=0.9)
    a = macroblocks(a, rng, bs=24, p_shift=0.10, p_flat=0.07, region=(820, W))
    rows = [y for y in range(250, 810) if rng.random() < 0.38]
    a = pixel_sort_rows(a, rng, rows, thr=35)
    a = slit_smear(a, rng, 70, direction=-1, maxlen=1100)
    for _ in range(5):
        y = int(rng.integers(60, H - 60))
        a[y:y + int(rng.integers(2, 6)), 700:] = np.array([LIME, PINK, MINT, LAV][_ % 4], dtype=np.float32) * 0.9
    a = left_fade(a, 420, 1060)
    save(finish(a, rng), "art-cover.png")


def band(rng, name, seed_shift):
    W, H = 1920, 160
    big = np.full((600, W, 3), BLACK, dtype=np.float32)
    lp = log_panel(1300, 600)
    off = 120 + seed_shift * 160
    big[:, off:off + 1300] = lp[:, : min(1300, W - off)]
    big = macroblocks(big, rng, bs=20, p_shift=0.18, p_flat=0.08)
    rows = [y for y in range(600) if rng.random() < 0.55]
    big = pixel_sort_rows(big, rng, rows, thr=30, reverse=bool(seed_shift % 2))
    big = slit_smear(big, rng, 120, direction=1 if seed_shift % 2 else -1, maxlen=1400)
    a = big[200:360].copy()
    a = bayer_dither_field(a, 0, 0, 420, H, tuple(int(c * 0.35) for c in LAV), strength=0.45)
    save(finish(a, rng, grain=7.0), name)


def edge(rng):
    W, H = 220, 1080
    a = np.full((H, 1300, 3), BLACK, dtype=np.float32)
    note = peso_note(980, 560, rng)
    a[260:820, 160:1140] = note
    a = macroblocks(a, rng, bs=20, p_shift=0.2, p_flat=0.1)
    rows = [y for y in range(H) if rng.random() < 0.6]
    a = pixel_sort_rows(a, rng, rows, thr=25)
    a = slit_smear(a, rng, 160, direction=1, maxlen=900)
    strip = a[:, 900:900 + W].copy()
    save(finish(strip, rng, grain=8.0), "art-edge.png")


def tile(rng):
    S = 1080
    a = np.full((S, S, 3), BLACK, dtype=np.float32)
    lp = log_panel(1300, 600)
    a[60:660, 0:1080] = lp[:, :1080]
    note = peso_note(980, 560, rng)
    a[560:1080, 300:1080] = note[:520, :780]
    a = halftone(a, rng, 0, 0, S, 300, PINK, step=12, gamma=2.2)
    a = macroblocks(a, rng, bs=24, p_shift=0.14, p_flat=0.08)
    rows = [y for y in range(S) if rng.random() < 0.45]
    a = pixel_sort_rows(a, rng, rows, thr=30)
    a = slit_smear(a, rng, 90, direction=-1, maxlen=700)
    save(finish(a, rng), "art-tile.png")


# ---------------------------------------------------------------------------
# Product hero art for the app (DESIGN-ECOSYSTEM.md): one signature color each.
# Run: python3 deck/art/make_art.py products  -> apps/web/public/art/*.png
# ---------------------------------------------------------------------------
APP_OUT = os.environ.get("ART_OUT", os.path.join(os.path.dirname(__file__), "..", "..", "apps", "web", "public", "art"))
INK = (21, 17, 14)
CREAM = (245, 239, 228)
PRODUCTS = {
    "mint": ((0, 166, 138), ["xMXN · Mercado Mint", "OUSD  sOUSD  tTBILL", "mint 13,333.33 xMXN", "ratio 250% · liq 135%"]),
    "remesas": ((255, 138, 31), ["Mercado Remesas", "50 OUSD → 995 xMXN", "para mamá · Guadalajara", "Tiempo Aire 100 MXN"]),
    "global": ((47, 107, 255), ["Mercado Global", "USD ⇄ MXN · oracle mid", "quote 250 → 4,975 xMXN", "402 · partner API"]),
    "credito": ((242, 53, 125), ["Mercado Crédito", "score 96.5 · line 1,500", "draw 300 · owed 306", "EIP-712 · nonce burned"]),
    "card": ((124, 92, 255), ["Mercado Card", "demo card ···· 4821", "cobrar 250 xMXN", "freeze · limit · refund"]),
    "invest": ((242, 184, 7), ["Mercado Invest", "ahorro en pesos · dólares", "tTBILL · demo T-bill", "rendimiento variable"]),
}


def tint(c, k):
    return tuple(int(v + (255 - v) * k) for v in c)


def shade(c, k):
    return tuple(int(v * k) for v in c)


def product_source(w, h, accent, lines, rng, bars=False):
    im = Image.new("RGB", (w, h), INK)
    d = ImageDraw.Draw(im)
    f = font(int(h * 0.11), True)
    cols = [CREAM, accent, tint(accent, 0.45), GREY]
    for i, t in enumerate(lines):
        d.text((int(w * 0.04), int(h * 0.08) + i * int(h * 0.2)), t, font=f, fill=cols[i % len(cols)])
    if bars:
        x0, base = int(w * 0.62), int(h * 0.92)
        for i in range(12):
            bh = int(h * (0.35 + 0.4 * rng.random()))
            d.rectangle([x0 + i * int(w * 0.03), base - bh, x0 + i * int(w * 0.03) + int(w * 0.02), base], fill=accent if i % 3 else CREAM)
    else:
        cx, cy = int(w * 0.76), h // 2
        for k in range(48):
            col = [accent, tint(accent, 0.5), CREAM, GREY][k % 4]
            r0 = h * 0.08 + k * h * 0.008
            pts = []
            for t in range(0, 721):
                a = t / 720 * 2 * math.pi
                r = r0 + h * 0.05 * math.sin(7 * a + k * 0.21) + h * 0.02 * math.cos(13 * a)
                pts.append((cx + r * 1.6 * math.cos(a), cy + r * math.sin(a)))
            d.line(pts, fill=col, width=2)
    return np.asarray(im).astype(np.float32)


def product_art(name, accent, lines, rng, w, h, fade):
    global PALETTE
    PALETTE = np.array([INK, accent, tint(accent, 0.45), shade(accent, 0.5), CREAM, GREY], dtype=np.float32)
    a = product_source(w, h, accent, lines, rng, bars=(name == "credito"))
    a = halftone(a, rng, int(w * 0.45), 0, w, int(h * 0.3), tint(accent, 0.35), step=max(10, h // 40), gamma=1.5)
    a = bayer_dither_field(a, int(w * 0.5), int(h * 0.75), w, h, shade(accent, 0.8), strength=0.9)
    a = macroblocks(a, rng, bs=max(16, h // 30), p_shift=0.12, p_flat=0.08, region=(int(w * 0.3), w))
    rows = [y for y in range(h) if rng.random() < 0.4]
    a = pixel_sort_rows(a, rng, rows, thr=35)
    a = slit_smear(a, rng, int(h * 0.12), direction=-1, maxlen=int(w * 0.5))
    if fade:
        bg = np.array(INK, dtype=np.float32)
        ramp = np.clip((np.arange(w) - w * 0.22) / (w * 0.33), 0, 1) ** 1.5
        a = bg + (a - bg) * ramp[None, :, None]
    return finish(a, rng, grain=8.0)


def home_art(rng, w, h, fade):
    global PALETTE
    accents = [c for c, _ in PRODUCTS.values()]
    PALETTE = np.array([INK, CREAM, GREY] + accents, dtype=np.float32)
    a = np.full((h, w, 3), INK, dtype=np.float32)
    strip = w // len(PRODUCTS)
    for i, (name, (acc, lines)) in enumerate(PRODUCTS.items()):
        src = product_source(strip, h, acc, lines[1:3], rng, bars=(name == "credito"))
        a[:, i * strip:(i + 1) * strip] = src
    a = macroblocks(a, rng, bs=max(16, h // 30), p_shift=0.16, p_flat=0.08)
    rows = [y for y in range(h) if rng.random() < 0.45]
    a = pixel_sort_rows(a, rng, rows, thr=35)
    a = slit_smear(a, rng, int(h * 0.15), direction=-1, maxlen=int(w * 0.4))
    if fade:
        bg = np.array(INK, dtype=np.float32)
        ramp = np.clip((np.arange(w) - w * 0.15) / (w * 0.3), 0, 1) ** 1.4
        a = bg + (a - bg) * ramp[None, :, None]
    return finish(a, rng, grain=8.0)


def products():
    os.makedirs(APP_OUT, exist_ok=True)
    for i, (name, (acc, lines)) in enumerate(PRODUCTS.items()):
        for suffix, w, h, fade in (("", 2400, 480, True), ("-square", 1200, 1200, False)):
            img = product_art(name, acc, lines, np.random.default_rng(1000 + i), w, h, fade)
            Image.fromarray(img).save(os.path.join(APP_OUT, f"{name}{suffix}.png"), optimize=True)
            print(f"{name}{suffix}.png", w, "x", h)
    for suffix, w, h, fade in (("", 2400, 480, True), ("-square", 1200, 1200, False)):
        img = home_art(np.random.default_rng(42), w, h, fade)
        Image.fromarray(img).save(os.path.join(APP_OUT, f"home{suffix}.png"), optimize=True)
        print(f"home{suffix}.png", w, "x", h)


if __name__ == "__main__" and len(__import__("sys").argv) > 1 and __import__("sys").argv[1] == "products":
    products()
elif __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    cover(np.random.default_rng(402))
    band(np.random.default_rng(42431), "art-band-1.png", 0)
    band(np.random.default_rng(4020), "art-band-2.png", 1)
    edge(np.random.default_rng(510))
    tile(np.random.default_rng(995))
