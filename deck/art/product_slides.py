"""Generate the four product slides (dark editorial template) for the ecosystem deck."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from principles import apply as principles
ROOT = os.path.join(os.path.dirname(__file__), "..")
TX = "https://explore.testnet.tempo.xyz/tx/"
M = "'DM Mono', 'Courier New', monospace"
assets = json.load(open(os.path.join(ROOT, "assets.json")))

P = [
 dict(id="j1-mint", num="04", name="Mercado Mint", tint="#00A68A", base="#00A68A", art="product-mint-v4.webp",
  purpose="Institutions mint xMXN.", who="Institutions and sophisticated holders with collateral that should be working.",
  proofs=[("48.99M", "pesos an institution can mint against US$4M of collateral, at the 150% line", None, None),
          ("200%", "recommended ratio: MX$36.74M on the same US$4M", None, None)],
  status=None,
  notes="~10s. Mercado Mint is for institutions and sophisticated holders: lock collateral (dollars, staked dollars, and tokenized assets) and mint pesos, xMXN, while the collateral keeps its own yield. The math is the product's own: US$4M of collateral at today's 18.37 is worth MX$73.48M; at the 150% minimum ratio that mints up to MX$48.99M, or MX$36.74M at the recommended 200%. Each collateral has its own mint line, liquidation line and debt ceiling. Q&A context: running on Tempo's testnet today; collateral assets there are test assets."),
 dict(id="j2-send", num="05", name="Mercado Remesas", tint="#FF8A1F", base="#FF8A1F", art="product-remesas-v4.webp",
  purpose="Send money home in one transaction.", who="A sender in the US paying family in Mexico, plus Tiempo Aire and bills for them.",
  proofs=[("9,149.04", "pesos the family receives for US$500, in one transaction", None, None),
          ("0.40%", "all-in cost versus the market rate, fee included", None, None)],
  status=None,
  notes="~10s. Mercado Remesas: dollars in the US become pesos in Mexico in one transaction. A real quote from the product right now: US$500 delivers MX$9,149.04 to the family, about 0.40% all-in versus the market rate, fee included. The same app tops up the family's phone and pays their bills. Q&A context: on Tempo testnet today; delivery is on-chain to the family's wallet (no bank cash-out yet), and bill fulfillment is simulated until a provider is contracted."),
 dict(id="p-global", num="06", name="Mercado Global", tint="#5C8BFF", base="#2F6BFF", art="product-global-v4.webp",
  purpose="Move MXN and USD across borders.", who="Businesses and fintech partners paying suppliers and settling MXN ⇄ USD.",
  proofs=[("176,294.94", "pesos to a supplier for US$10,000, quoted in real time", None, None),
          ("30 s", "signed indicative quote, minimum received shown up front", None, None)],
  status=None,
  notes="~10s. Mercado Global is cross-border for businesses: pay a Mexican supplier in pesos from dollars, or bring pesos back. A real quote right now: US$10,000 pays a supplier MX$176,294.94. At that size, price impact is part of the cost, and the quote shows it; one swap is capped at US$10,000. Partners get a signed indicative quote valid for 30 seconds with the minimum received, through an API they pay for per call. Never call it a firm quote. Q&A context: Tempo testnet today; the FX rate is relayed from Coinbase by our operator."),
 dict(id="j3-advance", num="07", name="Mercado Crédito", tint="#F2357D", base="#F2357D", art="product-credito-v4.webp",
  purpose="Credit for the gig economy.", who="Gig drivers who need small advances, the lenders who fund them, and bots that buy scores.",
  proofs=[("1,500", "pesos advanced against a driver's earnings line", None, None),
          ("2%", "flat fee, repaid by the driver as they earn", None, None)],
  status=None,
  notes="~12s. Mercado Crédito: a driver connects their earnings and draws an advance against them; lenders fund the pool. The product's configured limits: up to MX$1,500 per driver, a 2% flat fee, and the pool lends at most 80% of what lenders supplied. The driver repays as they earn. Q&A context: the score is an illustrative rule on demo earnings data, not a validated credit model; repayment is manual today; Tempo testnet."),
 dict(id="p-card", num="08", name="Mercado Card", tint="#9B82FF", base="#7C5CFF", art="product-card-v4.webp",
  purpose="Spend xMXN at a shop.", who="Anyone holding xMXN who wants to pay at a counter: the family in Mexico, a driver, a merchant's customers.",
  proofs=[("450", "pesos paid with a tap at the corner store", None, None),
          ("1,000", "pesos daily limit, resets at midnight CDMX; freeze any time", None, None)],
  video=("hero-spend-final.mp4", "hero-spend-final-paid.png"),
  status=None,
  notes="~8s. Mercado Card: spend pesos with a tap at the corner store. MX$450 at the tienda; a daily limit that resets at midnight CDMX; freeze it any time. The video is one person, end to end: Javier draws an advance, his frozen card is declined, he unfreezes it, and the tap pays exactly once, with receipts on the shop terminal and his phone. Q&A context: Tempo testnet today; the card network and number are simulated (works only at Mercado merchants)."),
 dict(id="p-invest", num="09", name="Mercado Invest", tint="#F2B807", base="#F2B807", art="product-invest-v4.webp",
  purpose="Save in pesos, dollars or T-bills.", who="Savers in Mexico, and institutions holding xMXN or dollars that should be working.",
  proofs=[("0.0998", "demo T-bill bought for 10 OUSD on the InvestDesk", "T-bill buy tx", TX+"0x3b5ec7b7f73be6a4558139904f797ebce34b3f0bf6c344e979f294c46ac54879"),
          ("200", "OUSD staked into sOUSD: dollar savings, demo-funded yield", "stake tx", TX+"0xd64599b71806f40156bfc3c1626392a0ea48107c3678078cd6737b9ba88f55bc")],
  status=None,
  notes="~8s. Mercado Invest is the savings product, with three ways to grow money. Peso savings: deposit xMXN into the real Crédito lending pool; the return is the driver fees actually realized, so far 20 xMXN in pool v2, historical and variable, never guaranteed, and only idle cash is withdrawable. Dollar savings: stake OUSD into sOUSD, the real ERC-4626 on v2, whose accrual comes from a demo yield reserve the admin funds on testnet. T-bills: buy and sell the demo tokenized T-bill through a new InvestDesk at the admin feed price plus a spread, then use it as Mint collateral; all three are live on v2 and were verified in the browser: 10 xMXN supplied to the pool, 10 OUSD into sOUSD (demo APR 5%), and 10 OUSD buying 0.09975 tTBILL on the desk at the $100 admin price plus spread. The tTBILL is a demo, not a security; its issuance is gated (no faucet), and the desk only buys back what it sold to you. Never say guaranteed returns."),
]

def slide(p):
    prod = p["art"].replace("product-", "").replace("-v4.webp", "")
    key = next((k for k in (f"screen-{prod}-v6.png", f"screen-{prod}-v5.png", f"screen-{prod}-v3.png", f"screen-{prod}-v2live2.png", f"screen-{prod}-v2live.png", f"screen-{prod}-v4.png") if k in assets), None)
    vis = p.get("visual")  # ("phone"|"panel", asset key, caption)
    vattr = ""
    if vis and vis[1] in assets:
        kind, src, cap = vis[0], assets[vis[1]], vis[2]
    else:
        kind, src, cap = "panel", (assets[key] if key else assets.get(p["art"], "")), p.get("vcap", "")
    vid = p.get("video")
    if vid and vid[0] in assets and vid[1] in assets:
        kind, src, vattr = "panel", assets[vid[1]], f' data-video="{assets[vid[0]]}"'
        cap = p.get("vcap", "")
    alt = p.get("alt", p["name"] + " in the Mercado app")
    head = p.get("headline", p["purpose"])
    sub = p.get("subline", p["who"])
    big = p.get("number", p["proofs"][0][0] if p["proofs"] else "")
    bigcap = p.get("numcap", p["proofs"][0][1] if p["proofs"] else "")
    bsize = 160 if len(big) <= 6 else (128 if len(big) <= 9 else 104)
    if kind == "phone":
        visual = (f'<img data-build-in="fade 4" src="{src}" alt="{alt}" style="position:absolute;left:1240px;top:220px;width:552px;height:620px;object-fit:contain">\n')
        capy = 856
    else:
        visual = (f'<img data-build-in="fade 4" src="{src}"{vattr} alt="{alt}" style="position:absolute;left:1112px;top:300px;width:680px;height:430px;object-fit:{"contain" if vattr else "cover"};object-position:top;border-radius:16px;border:1px solid rgba(255,255,255,0.14);box-shadow:0 24px 64px rgba(0,0,0,0.55);background:#111111">\n')
        capy = 754
    capline = (f'<p style="position:absolute;left:1112px;top:{capy}px;width:680px;font-family:{M};font-size:24px;color:#8A8A8A;text-transform:uppercase;letter-spacing:3px;font-weight:600">{cap}</p>\n') if cap else ""
    return f'''<section id="{p["id"]}" data-transition="fade" style="background:#0D0D0D;color:#F2F0EA;font-family:'Instrument Sans', Arial, sans-serif;padding:128px 128px 160px">
<div style="position:absolute;left:0;top:0;width:1920px;height:10px;background:{p["base"]}"></div>
<p style="position:absolute;left:128px;top:128px;width:900px;font-family:{M};font-size:24px;color:#999999"><span style="color:{p["tint"]}">■</span> {p["num"]} · {p["name"]}</p>
<div style="position:absolute;left:128px;top:200px;width:920px;display:flex;flex-direction:column;gap:28px">
<h2 data-build-in="rise 1" style="font-size:88px;font-weight:500;line-height:1.05;letter-spacing:-4px;color:#F2F0EA">{head}</h2>
<p data-build-in="rise 2" style="font-size:36px;font-weight:500;line-height:1.3;color:#C9C9C9">{sub}</p>
</div>
<div data-build-in="rise 3" style="position:absolute;left:128px;top:640px;width:920px;display:flex;flex-direction:column;gap:8px">
<p style="font-size:{bsize}px;font-weight:500;line-height:1;letter-spacing:-5px;color:{p["tint"]}">{big}</p>
<p style="font-family:{M};font-size:24px;color:#999999">{bigcap}</p>
</div>
{visual}{capline}<p style="position:absolute;left:128px;bottom:64px;width:1200px;font-family:{M};font-size:24px;color:#8A8A8A">Mercado · built on Tempo</p>
<p style="position:absolute;right:128px;bottom:64px;width:120px;font-family:{M};font-size:24px;text-align:right;color:#8A8A8A">{p["num"]}</p>
<aside>{p["notes"]}</aside>
</section>
'''

if __name__ == "__main__":
    for p in P:
        if p["id"] == "j3-advance" and "--keep-credito" in sys.argv:
            continue
        if p["id"] == "p-invest":
            continue
        open(os.path.join(ROOT, "project", "slides", p["id"] + ".html"), "w").write(principles(slide(p)))
        print(p["id"], "ok", "art url" if p["art"] in assets else "ART PLACEHOLDER")
