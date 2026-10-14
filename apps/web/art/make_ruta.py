"""Generate Mercado Crédito's own 'ruta' texture: an abstract city street grid from above with one driver's
route traced through it (no third-party imagery, no real map data). Used inside the DriverApp hero type
(CSS background-clip:text), so features are bold enough to read at ~6% scale. Seeded and reproducible:
  python3 apps/web/art/make_ruta.py  ->  apps/web/public/photos/ruta.webp      (rosa ground, for a white canvas)
                                     ->  apps/web/public/photos/ruta-ink.webp  (ink ground, for the v5 rosa field)
"""
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

W, H = 1200, 520
ROSA, INK, CREAM, GOLD = (217, 58, 122), (10, 10, 10), (242, 230, 201), (229, 168, 35)
# variant -> (ground, streets, avenues, route): the ink one keeps the word dark (≥4.5:1) on a rosa field
VARIANTS = {
    "ruta": (ROSA, (160, 32, 88), (122, 22, 66), INK),
    "ruta-ink": (INK, (58, 16, 36), (92, 20, 54), CREAM),
}


def make(name, ground, street, avenue, route):
    rng = random.Random(2027)
    img = Image.new("RGB", (W, H), ground)
    d = ImageDraw.Draw(img)

    # blocks: an irregular grid (colonia streets), slightly rotated like a real city
    streets = []
    x = -40
    while x < W + 40:
        streets.append(((x, -20), (x + rng.randint(-30, 30), H + 20)))
        x += rng.choice([34, 42, 56, 70])
    y = -10
    while y < H + 20:
        streets.append(((-20, y), (W + 20, y + rng.randint(-24, 24))))
        y += rng.choice([30, 38, 48, 62])
    for a, b in streets:
        d.line([a, b], fill=street, width=rng.choice([5, 6, 8]))
    # avenues: a few wide ink diagonals (Reforma-like), and a ring
    for _ in range(3):
        x0 = rng.randint(-200, W)
        ang = rng.uniform(-0.6, 0.6)
        d.line([(x0, -20), (x0 + math.tan(ang) * (H + 40), H + 20)], fill=avenue, width=rng.choice([26, 34]))
    d.ellipse([W * 0.55, -H * 0.4, W * 1.35, H * 1.1], outline=avenue, width=26)
    # the route: an ink polyline hopping along the grid, with pickup dots
    px, py = 30, H * 0.75
    pts = [(px, py)]
    while px < W - 30:
        if rng.random() < 0.6:
            px += rng.randint(60, 160)
        else:
            py = min(H - 30, max(30, py + rng.choice([-1, 1]) * rng.randint(50, 130)))
        pts.append((min(px, W - 30), py))
    d.line(pts, fill=route, width=40, joint="curve")  # ink route on rosa (cream would vanish on white)
    for p in pts[1::2]:
        d.ellipse([p[0] - 30, p[1] - 30, p[0] + 30, p[1] + 30], fill=GOLD, outline=INK, width=9)
    img = img.filter(ImageFilter.GaussianBlur(0.8))
    dest = Path(__file__).resolve().parents[1] / "public" / "photos" / f"{name}.webp"
    img.save(dest, "WEBP", quality=84)
    print(dest, img.size)


for name, colors in VARIANTS.items():
    make(name, *colors)
