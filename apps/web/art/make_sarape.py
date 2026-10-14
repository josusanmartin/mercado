"""Generate Mercado's own sarape-inspired woven texture (no third-party imagery).
Used inside the Home hero type (CSS background-clip:text). Seeded and reproducible:
  python3 apps/web/art/make_sarape.py  ->  apps/web/public/photos/sarape.webp
"""
import random
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

W, H = 2400, 900
PALETTE = {  # PRINCIPLES.md cultural palette + product accents
    "jade": (31, 61, 43), "terracotta": (226, 96, 63), "cream": (242, 230, 201), "ink": (10, 10, 10),
    "gold": (229, 168, 35), "rosa": (217, 58, 122), "cobalt": (36, 72, 200),
}
rng = random.Random(1812)
img = np.zeros((H, W, 3), dtype=np.float32)
y = 0
seq = ["jade", "terracotta", "gold", "rosa", "ink", "cobalt", "terracotta", "jade", "ink"]  # no wide cream: it vanishes inside type on white
while y < H:
    name = seq[rng.randrange(len(seq))]
    band = rng.choice([10, 14, 22, 36, 60, 90])
    img[y : y + band] = PALETTE[name]
    # thin contrasting pinstripes inside wide bands, like a woven sarape
    if band >= 36:
        stripe = PALETTE[rng.choice(["cream", "ink", "gold"])]
        for k in (band // 3, 2 * band // 3):
            img[y + k : y + k + 3] = stripe
    y += band
# woven texture: per-column thread variation + fine grain
cols = np.array([rng.uniform(0.9, 1.06) for _ in range(W)], dtype=np.float32)[None, :, None]
grain = np.random.default_rng(1812).normal(1.0, 0.035, (H, W, 1)).astype(np.float32)
weave = (1 + 0.04 * np.sin(np.arange(W) / 2.0))[None, :, None].astype(np.float32)
img = np.clip(img * cols * grain * weave, 0, 255).astype(np.uint8)
out = Image.fromarray(img).filter(ImageFilter.GaussianBlur(0.6))
dest = Path(__file__).resolve().parents[1] / "public" / "photos" / "sarape.webp"
out.save(dest, "WEBP", quality=82)
print(dest, out.size)
