"""Deck v8 (crew/DECK-V8.md): a plug-and-play financial ecosystem, Mexico first.

Main flow (9): cover, ecosystem, Mint, Remesas, Global, Crédito, Card, Invest, close.
Appendix (4): spend video, architecture (permissions graph), risk (FX gauge), judge Q&A.
Run: python3 deck/art/build_v8.py   (prints any asset still missing from deck/assets.json)
"""
import json
import os
import re

from PIL import Image

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "..")
SLIDES = os.path.join(ROOT, "project", "slides")
assets = json.load(open(os.path.join(ROOT, "assets.json")))
ICONS = json.load(open(os.path.join(HERE, "icons.json")))
MISSING = []

I = "font-family:'Inter Tight', Arial, sans-serif"
A = "font-family:'Anton', 'Arial Narrow', sans-serif"
META = "text-transform:uppercase;letter-spacing:3px;font-weight:600"
FRAME = "border-radius:16px;border:1px solid rgba(255,255,255,0.14);box-shadow:0 24px 64px rgba(0,0,0,0.55);background:#0A0A0A"
INK = "#0A0A0A"


def src(name):
    if name in assets:
        return assets[name]
    MISSING.append(name)
    return "PENDING-" + name


def size(name):
    for d in ("v8", "v7", ""):
        p = os.path.join(ROOT, "assets", d, name)
        if os.path.exists(p):
            return Image.open(p).size
    raise FileNotFoundError(name)


def icon(name, color, px=40):
    return (f'<svg width="{px}" height="{px}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="1.75" '
            f'stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</svg>')


def section(id_, body, notes, pad="128px 128px 160px"):
    return (f'<section id="{id_}" data-transition="fade" style="background:{INK};color:#FFFFFF;{I};padding:{pad}">\n'
            f'{body}<aside>{notes}</aside>\n</section>\n')


def footer(n):
    return (f'<p style="position:absolute;left:128px;bottom:64px;width:1200px;{I};font-size:24px;color:#8A8A8A;{META}">Mercado</p>\n'
            f'<p style="position:absolute;right:128px;bottom:64px;width:120px;{I};font-size:24px;text-align:right;color:#8A8A8A;{META}">{n}</p>\n')


def meta(text, color="#B3B3B3", mark=None, width=1200):
    sq = f'<span style="color:{mark}">■</span>' if mark else "■"
    return f'<p style="position:absolute;left:128px;top:128px;width:{width}px;{I};font-size:24px;color:{color};{META}">{sq} {text}</p>\n'


def write(id_, html):
    open(os.path.join(SLIDES, id_ + ".html"), "w").write(html)
    print("wrote", id_)


# ---------------------------------------------------------------- 01 cover
def cover():
    w, h = size("cover-title.png")
    TW = 1696
    TH = round(TW * h / w)
    body = (
        f'<p style="position:absolute;left:128px;top:128px;width:1100px;{I};font-size:24px;color:#B3B3B3;{META}">Mexico first · built on Tempo</p>\n'
        f'<img data-build-in="rise 1" src="{src("cover-title.png")}" alt="MERCADO" style="position:absolute;left:112px;top:196px;width:{TW}px;height:{TH}px;object-fit:contain">\n'
        f'<hr style="position:absolute;left:128px;top:{196 + TH + 36}px;width:1664px;border-top:1px solid rgba(255,255,255,0.18)">\n'
        f'<h2 data-build-in="rise 2" style="position:absolute;left:128px;top:{196 + TH + 60}px;width:1664px;{A};font-size:88px;font-weight:400;line-height:0.95;letter-spacing:-1px;text-transform:uppercase;color:#FFFFFF">A plug-and-play financial ecosystem.</h2>\n'
        f'<p data-build-in="rise 3" style="position:absolute;left:128px;top:{196 + TH + 170}px;width:1500px;font-size:34px;font-weight:500;line-height:1.35;color:#C9C9C9">'
        f'Emerging economies run on cash, remittance fees and payday loans. Mercado plugs a full financial system into any local currency.</p>\n'
    )
    notes = ("Mercado is a plug-and-play financial ecosystem. Emerging economies run on cash, remittance fees and payday loans; "
             "we plug a full financial system into any local currency.")
    write("cover", section("cover", body, notes, pad="128px"))


# ---------------------------------------------------------------- 02 ecosystem
MODS = [
    ("Mint", "#8DBF9E", "issues it", "landmark"),
    ("Remesas", "#E2603F", "sends it home", "send"),
    ("Global", "#6F8BF0", "pays suppliers", "globe"),
    ("Crédito", "#E36A97", "lends it", "hand-coins"),
    ("Card", "#F2E6C9", "spends it", "credit-card"),
    ("Invest", "#E5A823", "saves it", "piggy-bank"),
]


def ecosystem():
    cx, cy = 960, 610
    BW, BH = 380, 132
    ys = [380, 544, 708]
    lx, rx = 200, 1920 - 200 - BW
    blocks, lines = "", ""
    for i, (name, col, verb, ic) in enumerate(MODS):
        left = i < 3
        x = lx if left else rx
        y = ys[i % 3]
        blocks += (
            f'<div data-build-in="rise {3 + i}" style="position:absolute;left:{x}px;top:{y}px;width:{BW}px;height:{BH}px;'
            f'border-radius:16px;border:1px solid {col};background:#121212;display:flex;align-items:center;gap:22px;padding:0 28px">'
            f'{icon(ic, col, 44)}<div style="display:flex;flex-direction:column;gap:4px">'
            f'<p style="{A};font-size:50px;font-weight:400;line-height:1;text-transform:uppercase;color:{col}">{name}</p>'
            f'<p style="font-size:24px;font-weight:500;color:#C9C9C9">{verb}</p></div></div>\n'
        )
        ex = x + BW if left else x
        ey = y + BH // 2
        tx = cx - 170 if left else cx + 170
        mx = (ex + tx) / 2
        lines += (f'<path d="M{ex} {ey} C {mx} {ey}, {mx} {cy}, {tx} {cy}" stroke="{col}" stroke-width="3" fill="none" stroke-opacity="0.85"/>'
                  f'<circle cx="{ex + (10 if left else -10)}" cy="{ey}" r="7" fill="{col}"/>')
    svg = f'<svg style="position:absolute;left:0;top:0" width="1920" height="1080" viewBox="0 0 1920 1080">{lines}</svg>\n'
    core = (
        f'<div data-build-in="rise 2" style="position:absolute;left:{cx - 170}px;top:{cy - 100}px;width:340px;height:200px;border-radius:20px;'
        f'border:2px solid #FFFFFF;background:{INK};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">'
        f'<p style="{A};font-size:92px;font-weight:400;line-height:1;color:#FFFFFF">xMXN</p>'
        f'<p style="font-size:24px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#B3B3B3">local stablecoin</p></div>\n'
    )
    swap = (
        f'<div data-build-in="fade 9" style="position:absolute;left:{cx - 420}px;top:880px;width:840px;display:flex;justify-content:center;align-items:baseline;gap:18px">'
        f'<span style="font-size:22px;{META};color:#8A8A8A">Swap the currency</span>'
        f'<span style="font-size:34px;font-weight:600;color:#FFFFFF">xMXN</span><span style="font-size:30px;color:#8A8A8A">→</span>'
        f'<span style="font-size:34px;font-weight:600;color:#C9C9C9">xCOP · xBRL · xNGN …</span></div>\n'
    )
    body = (
        meta("02 · the ecosystem")
        + f'<h2 data-build-in="rise 1" style="position:absolute;left:128px;top:176px;width:1664px;{A};font-size:88px;font-weight:400;line-height:0.95;letter-spacing:-1px;text-transform:uppercase;color:#FFFFFF">One currency. Six plug-in modules.</h2>\n'
        + svg + core + blocks + swap + footer("02")
    )
    notes = ("At the center is one local stablecoin, xMXN. Six products share one token ledger on Tempo, "
             "with sponsored fees and inspectable transfers; local partners connect each market.")
    write("ecosystem", section("ecosystem", body, notes))


# ---------------------------------------------------------------- 03-08 products
PRODUCTS = [
    dict(id="mint", num="03", name="Mint", col="#8DBF9E", line="Lock collateral. Issue xMXN. Repay to unlock.",
         steps=[("lock", "Lock collateral"), ("coins", "Mint xMXN"), ("lock-open", "Repay to unlock")],
         local="currency feed", shot=("panel", "act-mint.png"),
         alt="Mercado Mint: the Deposit-and-mint form, collateral in, xMXN to mint, the ratio after, before pressing Deposit and mint",
         notes="Mint creates the currency: institutions lock collateral such as OUSD, a dollar token, and issue xMXN; repaying unlocks it. The exchange is the second issuer."),
    dict(id="remesas", num="04", name="Remesas", col="#E2603F", line="Send dollars. The family receives pesos in their wallet.",
         steps=[("user-round", "Choose recipient"), ("receipt-text", "See the quote"), ("send", "Send")],
         local="payout partner", shot=("phone", "act-remesas.png"),
         alt="Mercado Remesas: the review sheet before sending US$500 to Mamá in Guadalajara, with the rate and the pesos she receives",
         notes="Remesas sends money home: dollars go in, and the family receives xMXN in its wallet in seconds; five hundred dollars quoted about nine thousand two hundred fifty pesos."),
    dict(id="global", num="05", name="Global", col="#6F8BF0", line="Pay suppliers in pesos, with a guaranteed minimum.",
         steps=[("store", "Enter supplier"), ("shield-check", "Check the minimum"), ("banknote", "Pay")],
         local="business KYC", shot=("panel", "act-global.png"),
         alt="Mercado Global: pay 1,000 OUSD to a supplier, with the quoted pesos and the minimum enforced on-chain, before pressing Pay",
         notes="Global pays suppliers in xMXN: the payment either delivers at least the quoted minimum or reverts. Partners can also buy a signed quote through HTTP 402."),
    dict(id="credito", num="06", name="Crédito", col="#E36A97", line="Working-capital advances based on earnings history.",
         steps=[("link", "Connect earnings"), ("gauge", "Check your limit"), ("hand-coins", "Draw xMXN")],
         local="income-data integration", shot=("phone", "act-credito.png"),
         alt="Mercado Crédito: the advance sheet with the amount slider, a flat 2% fee and the total to repay, before pressing Recibir",
         notes="Crédito turns earnings history into a credit line. Separate lender capital funds each advance, with a flat two percent fee."),
    dict(id="card", num="07", name="Card", col="#F2E6C9", line="Approve each purchase on your phone.",
         steps=[("store", "Shop requests"), ("smartphone", "You approve the amount"), ("receipt", "Paid, with receipt")],
         local="merchant integration", shot=("video", "card-flow.webm", "card-flow-poster.png"),
         alt="Recorded on-chain flow: a frozen card declines Tienda Doña Mary's MX$150 charge, the card is unfrozen, the holder approves and it is paid",
         notes="Card spends it: the shop requests a payment, the customer signs for that exact amount and merchant, and both get an on-chain receipt. This is the recorded flow."),
    dict(id="invest", num="08", name="Invest", col="#E5A823", line="Save in dollars or pesos. Buy stocks.",
         steps=[("layers", "Choose asset"), ("arrow-down-to-line", "Deposit or buy"), ("trending-up", "Track value")],
         local="local-currency vault", shot=("phone", "act-invest.png"),
         alt="Mercado Invest: the deposit sheet with 100 OUSD into dollar savings, before pressing Depositar",
         notes="Invest saves and invests: the dollar and peso vaults accrue from a funded reserve, and the stocks index has its own price exposure."),
]

# one action region for all six (review #7): x 1152, y 184, 640 x 760; actions bottom-aligned
ZX, ZY, ZW, ZH = 1152, 184, 640, 760
PHONE_W = 490


def product(p):
    col = p["col"]
    steps = ""
    for i, (ic, label) in enumerate(p["steps"]):
        x = 128 + i * 316
        steps += (
            f'<div data-build-in="rise {3 + i}" style="position:absolute;left:{x}px;top:600px;width:270px;display:flex;flex-direction:column;gap:18px">'
            f'<div style="width:88px;height:88px;border-radius:50%;border:2px solid {col};display:flex;align-items:center;justify-content:center">{icon(ic, col, 42)}</div>'
            f'<p style="font-size:20px;{META};color:#8A8A8A">0{i + 1}</p>'
            f'<p style="font-size:30px;font-weight:600;line-height:1.2;color:#FFFFFF">{label}</p></div>\n'
        )
        if i < 2:
            steps += (f'<svg style="position:absolute;left:{x + 266}px;top:634px" width="44" height="20" viewBox="0 0 44 20">'
                      f'<path d="M2 10 H38 M30 3 L38 10 L30 17" stroke="#5A5A5A" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>\n')
    shot = p["shot"]
    kind, name = shot[0], shot[1]
    bottom = ZY + ZH
    if kind == "phone":
        w, h = size(name)
        dw = PHONE_W; dh = round(h * dw / w)
        vis = (f'<img data-build-in="fade 6" src="{src(name)}" alt="{p["alt"]}" '
               f'style="position:absolute;left:{ZX + (ZW - dw) // 2}px;top:{bottom - dh}px;width:{dw}px;height:{dh}px;object-fit:contain">\n')
    elif kind == "video":
        w, h = size(shot[2])
        dh = 692; dw = round(w * dh / h)
        x = ZX + (ZW - dw) // 2; y = bottom - dh
        vis = (f'<p style="position:absolute;left:{x}px;top:{y - 44}px;width:{dw}px;{I};font-size:20px;{META};color:#8A8A8A">Recorded on-chain flow</p>\n'
               f'<img data-build-in="fade 6" src="{src(shot[2])}" data-video="{src(name)}" alt="{p["alt"]}" '
               f'style="position:absolute;left:{x}px;top:{y}px;width:{dw}px;height:{dh}px;object-fit:contain;border-radius:24px">\n')
    else:
        w, h = size(name)
        s = min(ZW / w, ZH / h)
        dw, dh = round(w * s), round(h * s)
        vis = (f'<img data-build-in="fade 6" src="{src(name)}" alt="{p["alt"]}" '
               f'style="position:absolute;left:{ZX + (ZW - dw) // 2}px;top:{bottom - dh}px;width:{dw}px;height:{dh}px;object-fit:contain;{FRAME}">\n')
    body = (
        f'<div style="position:absolute;left:0;top:0;width:1920px;height:10px;background:{col}"></div>\n'
        + meta(f'{p["num"]} · {p["name"]}', mark=col, width=900)
        + f'<h2 data-build-in="rise 1" style="position:absolute;left:122px;top:218px;width:980px;{A};font-size:176px;font-weight:400;line-height:0.9;letter-spacing:-2px;text-transform:uppercase;color:{col}">{p["name"]}</h2>\n'
        + f'<p data-build-in="rise 2" style="position:absolute;left:128px;top:416px;width:940px;font-size:46px;font-weight:500;line-height:1.22;color:#FFFFFF">{p["line"]}</p>\n'
        + steps
        + f'<p data-build-in="fade 6" style="position:absolute;left:128px;top:892px;width:960px;font-size:24px;{META};color:#8A8A8A">Local piece · <span style="color:{col}">{p["local"]}</span></p>\n'
        + vis + footer(p["num"])
    )
    write(p["id"], section(p["id"], body, p["notes"]))


# ---------------------------------------------------------------- 09 close
def close():
    def col(title, color, items):
        rows = "".join(f'<p style="font-size:32px;font-weight:600;line-height:1.2;padding:14px 0;border-top:1px solid rgba(255,255,255,0.14);color:#FFFFFF">{t}</p>' for t in items)
        return (f'<div style="display:flex;flex-direction:column"><p style="font-size:24px;{META};color:{color};padding-bottom:14px">{title}</p>{rows}</div>')
    reuse = col("Reuse", "#8DBF9E", ["Issuance", "Exchange", "Credit", "Spending", "Savings"])
    local = col("Localize", "#E5A823", ["Currency + rate feed", "Funding", "Risk rules", "Licensed partners"])
    body = (
        meta("09 · plug and play", width=900)
        + f'<h2 data-build-in="rise 1" style="position:absolute;left:128px;top:176px;width:1664px;{A};font-size:80px;font-weight:400;line-height:0.98;letter-spacing:-1px;text-transform:uppercase;color:#FFFFFF">'
          f'Mexico is the template.<br><span style="color:#E5A823">Any developing economy is next.</span></h2>\n'
        + f'<div data-build-in="rise 2" style="position:absolute;left:128px;top:372px;width:860px;display:grid;grid-template-columns:1fr 1fr;column-gap:64px">{reuse}{local}</div>\n'
        + f'<p data-build-in="rise 3" style="position:absolute;left:128px;top:800px;width:860px;{A};font-size:48px;font-weight:400;line-height:1;text-transform:uppercase;color:#FFFFFF">Reuse the core. Integrate each market.</p>\n'
        + f'<p style="position:absolute;left:1088px;top:372px;width:704px;font-size:24px;{META};color:#8A8A8A">The ask</p>\n'
        + f'<p data-build-in="rise 4" style="position:absolute;left:1088px;top:418px;width:704px;font-size:48px;font-weight:600;line-height:1.3;color:#E5A823">'
          f'Introduce us to<br>a Mexico corridor operator,<br>a driver platform<br>and a merchant partner.</p>\n'
        + f'<p data-build-in="rise 5" style="position:absolute;left:1088px;top:900px;width:704px;font-size:28px;font-weight:500;color:#B3B3B3">Built and running end-to-end on Tempo testnet.</p>\n'
    )
    notes = ("Mexico is the template. We reuse the core and integrate each market. "
             "Introduce us to a Mexico corridor operator, a driver platform and a merchant partner.")
    write("close", section("close", body, notes, pad="128px"))


# ---------------------------------------------------------------- appendix
def appendix_architecture():
    w, h = size("panel-contracts-verified.png")
    dw = 1664; dh = round(dw * h / w)
    body = (
        meta("A2 · appendix: architecture")
        + f'<h2 style="position:absolute;left:128px;top:176px;width:1664px;{A};font-size:88px;font-weight:400;line-height:0.95;letter-spacing:-1px;text-transform:uppercase;color:#FFFFFF">Two issuers, one peso token.</h2>\n'
        + f'<p style="position:absolute;left:128px;top:290px;width:1664px;font-size:34px;font-weight:500;color:#C9C9C9">Who can mint, who sets prices, and what every product uses.</p>\n'
        + f'<p style="position:absolute;left:128px;top:356px;width:1664px;{I};font-size:22px;{META};color:#8A8A8A">Issuance graph · snapshot 14 Oct 2026</p>\n'
        + f'<img src="{src("panel-contracts-verified.png")}" alt="Mercado Contracts permissions graph: owner key and factory, the vault and the exchange that mint xMXN, the FX oracle, and Card, Crédito and Invest using xMXN; 17 of 17 source matches on Sourcify" '
          f'style="position:absolute;left:128px;top:400px;width:{dw}px;height:{dh}px;object-fit:contain;{FRAME}">\n'
        + footer("A2")
    )
    notes = re.search(r"<aside>(.*?)</aside>", open(os.path.join(SLIDES, "architecture.html")).read(), re.S).group(1)
    extra = " The graph is a 14 October snapshot; its source matches on Sourcify are 17 of 17, which is source verification, not an audit. The FX feed also values vault collateral, and owner controls reach every parameter listed here."
    if "not an audit" not in notes:
        notes += extra
    write("architecture", section("architecture", body, notes))


def appendix_risk():
    def colm(title, color, line, sub):
        return (f'<div style="display:flex;flex-direction:column;gap:18px;padding-top:28px;border-top:2px solid {color}">'
                f'<p style="{A};font-size:72px;font-weight:400;line-height:1;text-transform:uppercase;color:{color}">{title}</p>'
                f'<p style="font-size:40px;font-weight:500;line-height:1.25;color:#FFFFFF">{line}</p>'
                f'<p style="font-size:26px;line-height:1.4;color:#B3B3B3">{sub}</p></div>')
    body = (
        f'<div style="position:absolute;left:0;top:0;width:1920px;height:10px;background:#8DBF9E"></div>\n'
        + meta("A3 · appendix: risk", mark="#8DBF9E")
        + f'<h2 style="position:absolute;left:128px;top:176px;width:1664px;{A};font-size:88px;font-weight:400;line-height:0.95;letter-spacing:-1px;text-transform:uppercase;color:#FFFFFF">Two balance sheets. Different failure modes.</h2>\n'
        + f'<div style="position:absolute;left:128px;top:360px;width:1664px;display:grid;grid-template-columns:1fr 1fr;column-gap:96px">'
        + colm("Mint", "#8DBF9E", "Positions liquidate at their own collateral thresholds.",
               "Each collateral has its own mint and liquidation ratio, penalty and debt ceiling.")
        + colm("Exchange", "#6F8BF0", "Redemptions use its reserve, with NAV haircuts and rate limits.",
               "Minting stops below 100% coverage; redemptions refill over 24 hours.")
        + '</div>\n'
        + f'<p style="position:absolute;left:128px;top:860px;width:1664px;{I};font-size:22px;{META};color:#8A8A8A">Snapshot 14 Oct 2026 · exchange coverage 259% · aggregate collateral backing 280%</p>\n'
        + footer("A3")
    )
    notes = ("Two separate balance sheets fail differently. In Mint, each position is liquidated at its own collateral's threshold; "
             "the 280% aggregate backing is a reference, not a liquidation trigger. The exchange redeems only from its own OUSD reserve, "
             "at the lower of oracle value and NAV, through a leaky-bucket rate limit, and stops minting below 100% coverage. "
             "Owner-controlled prices and settings remain part of the trust model.")
    write("risk", section("risk", body, notes))


def appendix_spend_video():
    p = os.path.join(SLIDES, "spend-video.html")
    s = open(p).read()
    s = s.replace("An advance on what he has earned, spent at the corner store.", "An earnings-informed advance, spent at a Mercado merchant.")
    s = s.replace(" A separate HTTP 402 call shows software paying for an API response.", "")
    open(p, "w").write(s)
    print("updated spend-video")


def appendix_judge_qa():
    pairs = [("Who adopts it?", "Why six modules?"), ("What travels?", "What changes locally?"),
             ("Who supplies capital?", "Who bears losses?"), ("What works today?", "What needs a partner?")]
    cells = "".join(
        f'<div style="display:flex;gap:24px;align-items:baseline;padding:22px 0;border-top:1px solid rgba(255,255,255,0.14)">'
        f'<p style="width:48px;font-size:24px;color:#E5A823">0{i + 1}</p>'
        f'<p style="flex:1;font-size:38px;font-weight:600;line-height:1.25;color:#FFFFFF">{a}<br><span style="color:#B3B3B3">{b}</span></p></div>'
        for i, (a, b) in enumerate(pairs))
    body = (
        f'<img src="{src("glitch-strip-b.png") if "glitch-strip-b.png" in assets else "/_blob/43f886d7093f469dc1d8680cd904ef9d"}" alt="" style="position:absolute;left:0;top:0;width:1920px;height:56px;object-fit:cover">\n'
        + meta("A4 · appendix: judge Q&amp;A")
        + f'<h2 style="position:absolute;left:128px;top:176px;width:1664px;{A};font-size:88px;font-weight:400;line-height:0.95;letter-spacing:-1px;text-transform:uppercase;color:#FFFFFF">What is built. What the pilot must prove.</h2>\n'
        + f'<p style="position:absolute;left:128px;top:290px;width:1664px;font-size:30px;font-weight:500;color:#B3B3B3">Mexico first · reusable core · local integrations.</p>\n'
        + f'<div style="position:absolute;left:128px;top:380px;width:1664px;display:grid;grid-template-columns:1fr 1fr;column-gap:64px">{cells}</div>\n'
        + footer("A4")
    )
    old = re.search(r"<aside>(.*?)</aside>", open(os.path.join(SLIDES, "judge-qa.html")).read(), re.S).group(1)
    if "Technical follow-ups, indexed: " in old:
        tech = old.split("Technical follow-ups, indexed: ", 1)[1]
    else:
        tech = old.split("01: ", 1)[1] if "01: " in old else old
        tech = "T1: " + re.sub(r"\b0([2-8]): ", r"T\1: ", tech)
    tech = tech.replace("Contracts pass 141 tests in this review plus source verification and a bounded independent review.",
                        "The last recorded contract suite passed 141 tests, plus source verification and a bounded independent review.")
    opening = ("Appendix for Q&amp;A. Open with these four answers. "
               "01 Buyer: our proposed first adopter is a local fintech or corridor operator; this deck demonstrates the product, it does not establish customer demand. "
               "Six modules because issuance, exchange and consumer flows share one settlement layer, and a pilot must prove that integrating them costs less than assembling separate providers. "
               "02 What travels: the contracts and app modules; locally we change the currency and rate feed, funding, risk rules and licensed partners. "
               "03 Capital: vault collateral, exchange reserves and lender funds are separate; pilot partners must establish funding and sustainable fees, and subsidized testnet yield is not revenue. Losses fall on the account that funded the position. "
               "04 Readiness: on-chain product flows run today; fiat payout, real income access, production assets and operating arrangements still need partners. "
               "Technical follow-ups, indexed: ")
    write("judge-qa", section("judge-qa", body, opening + tech))


def appendix_relabel(id_, old_meta, new_meta, old_num, new_num):
    p = os.path.join(SLIDES, id_ + ".html")
    s = open(p).read()
    s = s.replace(old_meta, new_meta).replace(f'font-weight:600">{old_num}</p>', f'font-weight:600">{new_num}</p>')
    open(p, "w").write(s)
    print("relabelled", id_)


ORDER = ["cover", "ecosystem", "mint", "remesas", "global", "credito", "card", "invest", "close",
         "spend-video", "architecture", "risk", "judge-qa"]

if __name__ == "__main__":
    cover()
    ecosystem()
    for p in PRODUCTS:
        product(p)
    close()
    appendix_architecture()
    appendix_risk()
    appendix_relabel("spend-video", "■ 04 · the demo", "■ A1 · appendix: the live proof", "04", "A1")
    appendix_spend_video()
    appendix_judge_qa()
    dj = json.load(open(os.path.join(ROOT, "project", "deck.json")))
    dj["order"] = ORDER
    dj["sections"] = {
        "main": {"description": "A plug-and-play financial ecosystem: the ecosystem, the six products, and the ask", "start": "cover"},
        "appendix": {"description": "Appendix for Q&A: the live spend video, architecture, risk, judge questions", "start": "spend-video"},
    }
    dj["title"] = "Mercado: a plug-and-play financial ecosystem"
    open(os.path.join(ROOT, "project", "deck.json"), "w").write(json.dumps(dj, ensure_ascii=False))
    words = 0
    for id_ in ORDER[:9]:
        t = re.search(r"<aside>(.*?)</aside>", open(os.path.join(SLIDES, id_ + ".html")).read(), re.S).group(1)
        n = len(t.split()); words += n
        print(f"  {id_}: {n} spoken words")
    print("main-flow spoken words:", words)
    print("missing assets (need upload):", sorted(set(MISSING)) or "none")
