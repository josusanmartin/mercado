"""Apply josu's design principles (crew/PRINCIPLES.md) to a slide's HTML.

Display: Anton, uppercase (unless the text holds mixed-case token names).
Everything else: Inter Tight. Meta labels: small uppercase with tracking.
Palette: ink canvas, white type, cultural accents (light tints on dark).
Usage: python3 deck/art/principles.py deck/project/slides/*.html
"""
import re
import sys

INTER = "font-family:'Inter Tight', Arial, sans-serif"
ANTON = "font-family:'Anton', 'Arial Narrow', sans-serif"
TOKENS = re.compile(r"xMXN|sOUSD|tTBILL|OUSD|MXN/USD|USD/MXN")
COLORS = {
    "#0D0D0D": "#0A0A0A", "#F2F0EA": "#FFFFFF",
    "#FFB547": "#E5A823", "rgba(255,181,71": "rgba(229,168,35", "rgba(255, 181, 71": "rgba(229,168,35",
    "#00A68A": "#8DBF9E", "#FF8A1F": "#E2603F", "#5C8BFF": "#6F8BF0", "#2F6BFF": "#6F8BF0",
    "#F2357D": "#E36A97", "#7C5CFF": "#F2E6C9", "#9B82FF": "#F2E6C9", "#F2B807": "#E5A823",
}
META = "text-transform:uppercase;letter-spacing:3px;font-weight:600"


def _split_embeds(s):
    parts = re.split(r"(<x-embed.*?</x-embed>)", s, flags=re.S)
    return parts


def _display(m):
    tag, attrs, style, text = m.group(1), m.group(2) or "", m.group(3), m.group(4)
    big = re.search(r"font-size:(\d+)px;font-weight:500;line-height:[\d.]+;letter-spacing:-[\d.]+px", style)
    if not big or int(big.group(1)) < 72:
        return m.group(0)
    size = int(big.group(1))
    plain = re.sub(r"<[^>]+>", "", text)
    upper = "" if TOKENS.search(plain) else ";text-transform:uppercase"
    style = style.replace(big.group(0), f"{ANTON};font-size:{size}px;font-weight:400;line-height:0.95;letter-spacing:-1px{upper}")
    return f"<{tag}{attrs} style=\"{style}\">{text}</{tag}>"


def _meta(m):
    style, text = m.group(1), m.group(2)
    if "text-transform:uppercase" in style:
        return m.group(0)
    style = style.replace("color:#999999", "color:#B3B3B3")
    t = re.sub(r"^(\d\d|A\d) — ", r"■ \1 · ", text)
    if TOKENS.search(re.sub(r"<[^>]+>", "", t)):
        return f'<p style="{style};letter-spacing:1px;font-weight:600">{t}</p>'
    return f'<p style="{style};{META}">{t}</p>'


def apply(s):
    out = []
    for part in _split_embeds(s):
        if part.startswith("<x-embed"):
            for a, b in COLORS.items():
                part = part.replace(a, b)
            out.append(part)
            continue
        for a, b in COLORS.items():
            part = part.replace(a, b)
        part = part.replace("font-family:'Instrument Sans', Arial, sans-serif", INTER)
        part = part.replace("font-family:'DM Mono', 'Courier New', monospace", INTER)
        part = part.replace("'DM Mono', 'Courier New', monospace", "'Inter Tight', Arial, sans-serif")
        part = re.sub(r'<(h1|h2|p)((?: data-[a-z-]+="[^"]*")*) style="([^"]*)">(.*?)</\1>', _display, part, flags=re.S)
        # meta: top labels (top:128px) and footer row (bottom:64px)
        part = re.sub(r'<p style="(position:absolute;(?:left|right):\d+px;(?:top:128px|bottom:64px);[^"]*)">(.*?)</p>', _meta, part, flags=re.S)
        part = part.replace(">Mercado · testnet prototype on Tempo Moderato</p>", ">Mercado · built on Tempo</p>")
        out.append(part)
    return "".join(out)


if __name__ == "__main__":
    for f in sys.argv[1:]:
        s = open(f).read()
        n = apply(s)
        if n != s:
            open(f, "w").write(n)
            print("styled", f)
