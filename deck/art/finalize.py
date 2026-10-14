"""Rebuild the templated slides and wire the enlarged risk crop's URL. Run after assets.json updates."""
import json, os, re, subprocess, sys
ROOT = os.path.join(os.path.dirname(__file__), "..")
a = json.load(open(os.path.join(ROOT, "assets.json")))
url = a.get("crop-mint-risk.png")
if not url:
    sys.exit("crop-mint-risk.png not uploaded yet")
subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "build_slides.py")], check=True, stdout=subprocess.DEVNULL)
p = os.path.join(ROOT, "project", "slides", "compounds.html")
s = open(p).read()
s = re.sub(r'src="(CROPURL|/_blob/[0-9a-f]+)" alt="Mercado Mint risk view', f'src="{url}" alt="Mercado Mint risk view', s)
open(p, "w").write(s)
print("compounds risk crop ->", url)
