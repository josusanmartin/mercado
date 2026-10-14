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
    notes = ("At the center is one local stablecoin, xMXN. Six modules plug into it. "
             "Swap the currency and the same modules serve Colombia, Brazil or Nigeria.")
    write("ecosystem", section("ecosystem", body, notes))


# ---------------------------------------------------------------- 03-08 products
PRODUCTS = [
    dict(id="mint", num="03", name="Mint", col="#8DBF9E", line="Lock collateral. Issue the local stablecoin against it.",
         steps=[("lock", "Lock collateral"), ("coins", "Mint xMXN"), ("lock-open", "Repay to unlock")],
         local="the currency oracle", shot=("panel", "act-mint.png"),
         alt="Mercado Mint: deposit 1,000 OUSD of collateral and mint 7,459 xMXN at a 250% ratio, before pressing Deposit and mint",
         notes="Mint creates the currency: institutions lock collateral, including yield-bearing assets, and issue pesos against it. Repaying unlocks the collateral."),
    dict(id="remesas", num="04", name="Remesas", col="#E2603F", line="Send dollars home. The family gets pesos in seconds.",
         steps=[("dollar-sign", "Dollars in"), ("arrow-left-right", "Exchange mints pesos"), ("house", "Family gets pesos")],
         local="a licensed payout partner", shot=("phone", "act-remesas.png"),
         alt="Mercado Remesas: the review sheet before sending US$500 to Mamá in Guadalajara, with the rate and the pesos she receives",
         notes="Remesas sends money home: five hundred dollars becomes about nine thousand two hundred fifty pesos in the family's wallet, in seconds, with the rate shown first."),
    dict(id="global", num="05", name="Global", col="#6F8BF0", line="Pay suppliers abroad in their own currency.",
         steps=[("banknote", "Enter dollars"), ("receipt-text", "Live quote, fee shown"), ("store", "Supplier gets pesos")],
         local="a business KYC partner", shot=("panel", "act-global.png"),
         alt="Mercado Global: pay 1,000 OUSD, the supplier receives the quoted pesos, before pressing Pay",
         notes="Global pays suppliers: a business enters dollars, sees a live quote with the fee, and the supplier receives pesos."),
    dict(id="credito", num="06", name="Crédito", col="#E36A97", line="Advances on what gig workers already earned.",
         steps=[("link", "Connect earnings"), ("gauge", "Get a score"), ("hand-coins", "Draw an advance")],
         local="an income-data integration", shot=("phone", "act-credito.png"),
         alt="Mercado Crédito: the advance sheet with the amount slider, a flat 2% fee and the total to repay, before pressing Recibir",
         notes="Crédito advances what gig workers already earned: connect earnings, get a score, draw from lender capital for a flat two percent fee."),
    dict(id="card", num="07", name="Card", col="#F2E6C9", line="Tap to pay. Approve the exact amount on your phone.",
         steps=[("store", "Shop requests"), ("smartphone", "You approve"), ("receipt", "Paid, with receipt")],
         local="a merchant acquiring partner", shot=("phone", "act-card.png"),
         alt="Mercado Card: Tienda Doña Mary asks for MX$450, with Rechazar and Aprobar, before approving",
         notes="Card spends it: the shop requests, the customer approves that exact amount on the phone, and both get a receipt."),
    dict(id="invest", num="08", name="Invest", col="#E5A823", line="Save in dollars, pesos or stocks, earning every second.",
         steps=[("layers", "Pick a vault"), ("arrow-down-to-line", "Deposit"), ("trending-up", "Earn every second")],
         local="the local-currency vault", shot=("phone", "act-invest.png"),
         alt="Mercado Invest: the deposit sheet with 100 OUSD into dollar savings, before pressing Depositar",
         notes="Invest saves it: dollars at five percent, pesos at eight, or a stocks index, accruing every second."),
]


def product(p):
    col = p["col"]
    steps = ""
    for i, (ic, label) in enumerate(p["steps"]):
        x = 128 + i * 316
        steps += (
            f'<div data-build-in="rise {3 + i}" style="position:absolute;left:{x}px;top:614px;width:260px;display:flex;flex-direction:column;gap:18px">'
            f'<div style="width:88px;height:88px;border-radius:50%;border:2px solid {col};display:flex;align-items:center;justify-content:center">{icon(ic, col, 42)}</div>'
            f'<p style="font-size:20px;{META};color:#8A8A8A">0{i + 1}</p>'
            f'<p style="font-size:32px;font-weight:600;line-height:1.2;color:#FFFFFF">{label}</p></div>\n'
        )
        if i < 2:
            ax = x + 260 + 6
            steps += (f'<svg style="position:absolute;left:{ax}px;top:648px" width="44" height="20" viewBox="0 0 44 20">'
                      f'<path d="M2 10 H38 M30 3 L38 10 L30 17" stroke="#5A5A5A" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>\n')
    kind, name = p["shot"]
    w, h = size(name)
    ZX, ZY, ZW, ZH = 1150, 150, 642, 830
    if kind == "phone":
        s = min(560 / w, 820 / h)
        dw, dh = round(w * s), round(h * s)
        vis = (f'<img data-build-in="fade 6" src="{src(name)}" alt="{p["alt"]}" '
               f'style="position:absolute;left:{ZX + (ZW - dw) // 2}px;top:{ZY + (ZH - dh) // 2}px;width:{dw}px;height:{dh}px;object-fit:contain">\n')
    else:
        s = min(ZW / w, 760 / h)
        dw, dh = round(w * s), round(h * s)
        vis = (f'<img data-build-in="fade 6" src="{src(name)}" alt="{p["alt"]}" '
               f'style="position:absolute;left:{ZX + (ZW - dw) // 2}px;top:{ZY + (ZH - dh) // 2}px;width:{dw}px;height:{dh}px;object-fit:contain;{FRAME}">\n')
    body = (
        f'<div style="position:absolute;left:0;top:0;width:1920px;height:10px;background:{col}"></div>\n'
        + meta(f'{p["num"]} · {p["name"]}', mark=col, width=900)
        + f'<h2 data-build-in="rise 1" style="position:absolute;left:120px;top:214px;width:980px;{A};font-size:200px;font-weight:400;line-height:0.9;letter-spacing:-2px;text-transform:uppercase;color:{col}">{p["name"]}</h2>\n'
        + f'<p data-build-in="rise 2" style="position:absolute;left:128px;top:432px;width:940px;font-size:46px;font-weight:500;line-height:1.22;color:#FFFFFF">{p["line"]}</p>\n'
        + steps
        + f'<p data-build-in="fade 6" style="position:absolute;left:128px;top:892px;width:960px;font-size:24px;{META};color:#8A8A8A">Local piece · <span style="color:{col}">{p["local"]}</span></p>\n'
        + vis + footer(p["num"])
    )
    write(p["id"], section(p["id"], body, p["notes"]))


# ---------------------------------------------------------------- 09 close
def close():
    items = ["Currency oracle", "Local stablecoin", "Payout & KYC partners", "Income-data integrations"]
    grid = "".join(
        f'<div style="display:flex;align-items:center;gap:14px;padding:16px 0;border-top:1px solid rgba(255,255,255,0.14)">'
        f'<span style="width:12px;height:12px;border-radius:50%;background:{c}"></span>'
        f'<span style="font-size:30px;font-weight:600;color:#FFFFFF">{t}</span></div>'
        for t, c in zip(items, ["#8DBF9E", "#E2603F", "#6F8BF0", "#E36A97"]))
    body = (
        f'<img src="{src("art-tile.png")}" alt="" style="position:absolute;left:1060px;top:0;width:860px;height:1080px;object-fit:cover">\n'
        f'<div style="position:absolute;left:1060px;top:0;width:360px;height:1080px;background:linear-gradient(90deg, {INK} 0%, rgba(10,10,10,0) 100%)"></div>\n'
        + meta("09 · plug and play", width=900)
        + f'<h2 data-build-in="rise 1" style="position:absolute;left:128px;top:180px;width:900px;{A};font-size:64px;font-weight:400;line-height:0.98;letter-spacing:-1px;text-transform:uppercase;color:#FFFFFF">'
          f'Mexico is the template.<br><span style="color:#E5A823">Any developing economy is next.</span></h2>\n'
        + f'<p style="position:absolute;left:128px;top:380px;width:900px;font-size:22px;{META};color:#8A8A8A">What changes per country</p>\n'
        + f'<div data-build-in="rise 2" style="position:absolute;left:128px;top:418px;width:860px;display:grid;grid-template-columns:1fr 1fr;column-gap:40px">{grid}</div>\n'
        + f'<p data-build-in="rise 3" style="position:absolute;left:128px;top:590px;width:900px;font-size:34px;font-weight:500;color:#C9C9C9">Everything else ships as is.</p>\n'
        + f'<p style="position:absolute;left:128px;top:690px;width:900px;font-size:22px;{META};color:#8A8A8A">The ask</p>\n'
        + f'<p data-build-in="rise 4" style="position:absolute;left:128px;top:728px;width:900px;{A};font-size:56px;font-weight:400;line-height:1.02;text-transform:uppercase;color:#E5A823">One corridor. One driver platform. One merchant pilot.</p>\n'
        + f'<p data-build-in="rise 5" style="position:absolute;left:128px;top:900px;width:900px;font-size:28px;font-weight:500;color:#B3B3B3">Built and running end-to-end on Tempo testnet.</p>\n'
    )
    notes = ("Mexico is the template. Per country we swap the oracle, the stablecoin, the payout and KYC partners and income data; "
             "the rest ships as is. Our ask: one corridor, one driver platform, one merchant pilot.")
    write("close", section("close", body, notes, pad="128px"))


# ---------------------------------------------------------------- appendix
def appendix_architecture():
    w, h = size("panel-contracts-verified.png")
    dw = 1664; dh = round(dw * h / w)
    body = (
        meta("A2 · appendix: architecture")
        + f'<h2 style="position:absolute;left:128px;top:176px;width:1664px;{A};font-size:88px;font-weight:400;line-height:0.95;letter-spacing:-1px;text-transform:uppercase;color:#FFFFFF">Two issuers, one peso token.</h2>\n'
        + f'<p style="position:absolute;left:128px;top:290px;width:1664px;font-size:34px;font-weight:500;color:#C9C9C9">Who can mint, who sets prices, and what every product uses.</p>\n'
        + f'<img src="{src("panel-contracts-verified.png")}" alt="Mercado Contracts permissions graph: owner key and factory, the vault and the exchange that mint xMXN, the FX oracle, and Card, Crédito and Invest using xMXN; verified 17 of 17 on Sourcify" '
          f'style="position:absolute;left:128px;top:380px;width:{dw}px;height:{dh}px;object-fit:contain;{FRAME}">\n'
        + footer("A2")
    )
    old = open(os.path.join(SLIDES, "architecture.html")).read()
    notes = re.search(r"<aside>(.*?)</aside>", old, re.S).group(1)
    write("architecture", section("architecture", body, notes))


def appendix_risk():
    w, h = size("panel-mint-risk.png")
    dw = 1664; dh = round(dw * h / w)
    body = (
        f'<div style="position:absolute;left:0;top:0;width:1920px;height:10px;background:#8DBF9E"></div>\n'
        + meta("A3 · appendix: risk", mark="#8DBF9E")
        + f'<h2 style="position:absolute;left:128px;top:176px;width:1664px;{A};font-size:88px;font-weight:400;line-height:0.95;letter-spacing:-1px;text-transform:uppercase;color:#FFFFFF">Check the backing before you borrow.</h2>\n'
        + f'<p style="position:absolute;left:128px;top:290px;width:1664px;font-size:34px;font-weight:500;color:#C9C9C9">A stronger peso leaves less room to borrow safely.</p>\n'
        + f'<img src="{src("panel-mint-risk.png")}" alt="Mercado Mint risk: exchange coverage and system backing, and a USD/MXN gauge from today down to the 135% line and the exchange 100% point" '
          f'style="position:absolute;left:128px;top:400px;width:{dw}px;height:{dh}px;object-fit:contain">\n'
        + footer("A3")
    )
    old = open(os.path.join(SLIDES, "risk.html")).read()
    notes = re.search(r"<aside>(.*?)</aside>", old, re.S).group(1)
    write("risk", section("risk", body, notes))


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
    appendix_relabel("judge-qa", "■ A12 · appendix: judge Q&amp;A", "■ A4 · appendix: judge Q&amp;A", "A12", "A4")
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
