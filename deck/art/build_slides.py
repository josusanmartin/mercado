"""Build the templated slides (products + Invest, bills, risk) with the v7 visuals.

Run: python3 deck/art/build_slides.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import product_slides as ps  # noqa: E402
from principles import apply as principles  # noqa: E402

VISUALS = {
    "j1-mint": [("strip", "panel-mint-risk.png")],
    "j2-send": [("phone", "phone-remesas-home.png"), ("phone", "phone-remesas-quote.png")],
    "p-global": [("panel", "panel-global-pay.png")],
    "j3-advance": [("phone", "phone-credito-inicio.png"), ("phone", "phone-credito-adelanto.png")],
    "p-card": [("phone", "phone-card-approve.png"), ("video", "hero-spend-final.mp4", "hero-spend-final-paid.png")],
}

BASE = dict(proofs=[], purpose="", who="", art="none.webp")
EXTRA = [
    dict(BASE, id="p-invest", num="09", name="Mercado Invest", tint="#E5A823", base="#E5A823",
         headline="Save in dollars, pesos, or stocks.", subline="Choose where to put your money to work.",
         number="Five percent a year in dollars.", visuals=[("phone", "phone-invest.png")],
         notes="The dollar vault is configured at five percent a year and the peso vault at eight percent, paid only while their funded demo reserves last. The stocks option is Mercado's equity-index token with an owner-set price and no underlying equities; it does not earn either savings rate."),
    dict(BASE, id="j4-bills", num="10", name="Bills and paid requests", tint="#E2603F", base="#E2603F",
         headline="Request it. Pay for it. Get a receipt.", subline="The same payment flow serves people and software.",
         number=None, visuals=[("panel", "panel-developers-402.png")],
         notes="A bill or API request asks for payment, the client pays, and the response includes settlement evidence through MPP. The bill fulfillment is simulated; the payment settles, and an interrupted order can be checked with its original key."),
    dict(BASE, id="risk", num="12", name="Risk", tint="#8DBF9E", base="#8DBF9E",
         headline="Check the backing before you borrow.", subline="A stronger peso leaves less room to borrow safely.",
         number=None, visuals=[("strip", "panel-mint-risk.png")],
         notes="Peso debt gets harder to cover when the peso strengthens against dollar-valued collateral, so the app shows the effect on backing and individual positions. Positions can be liquidated and exchange redemptions can be restricted or take a haircut; owner-controlled prices and settings remain part of the trust model."),
]

# CR-03: the product slides live in the appendix (A1-A8); proof is A14.
NUMS = {"j1-mint": "A1", "j2-send": "A2", "p-global": "A3", "j3-advance": "A4", "p-card": "A5",
        "p-invest": "A6", "j4-bills": "A7", "risk": "A8"}

if __name__ == "__main__":
    out = os.path.join(ps.ROOT, "project", "slides")
    for p in ps.P:
        if p["id"] == "p-invest":
            continue
        p = dict(p, visuals=VISUALS.get(p["id"], []), num=NUMS[p["id"]])
        p.pop("video", None)
        open(os.path.join(out, p["id"] + ".html"), "w").write(principles(ps.slide(p)))
        print(p["id"], [v[1] for v in p["visuals"]])
    for p in EXTRA:
        p = dict(p, num=NUMS[p["id"]])
        open(os.path.join(out, p["id"] + ".html"), "w").write(principles(ps.slide(p)))
        print(p["id"], [v[1] for v in p["visuals"]])


def build_proof():
    from PIL import Image
    a = ps.assets
    I = "font-family:'Inter Tight', Arial, sans-serif"
    A = "font-family:'Anton', 'Arial Narrow', sans-serif"
    META = "text-transform:uppercase;letter-spacing:3px;font-weight:600"
    FRAME = "border-radius:16px;border:1px solid rgba(255,255,255,0.14);box-shadow:0 24px 64px rgba(0,0,0,0.55);background:#0A0A0A"
    v7 = os.path.join(ps.ROOT, "assets", "v7")
    dw, dh = Image.open(os.path.join(v7, "panel-developers-402.png")).size
    cw, ch = Image.open(os.path.join(v7, "panel-contracts-verified.png")).size
    # v6: the permissions graph (wide) on the left, the 402 FlowPath panel on the right
    CW = 1060; CH = round(CW * ch / cw)
    DW = 552; DH = round(DW * dh / dw)
    s = f'''<section id="proof" data-transition="fade" style="background:#0A0A0A;color:#FFFFFF;{I};padding:128px 128px 160px">
<p style="position:absolute;left:128px;top:128px;width:900px;{I};font-size:24px;color:#B3B3B3;{META}">■ A14 · appendix: proof</p>
<h2 data-build-in="rise 1" style="position:absolute;left:128px;top:180px;width:1100px;{A};font-size:96px;font-weight:400;line-height:0.95;letter-spacing:-1px;text-transform:uppercase;color:#FFFFFF">Follow the money.<br><span style="color:#E5A823">Check the receipt.</span></h2>
<p data-build-in="rise 2" style="position:absolute;left:128px;top:390px;width:1100px;font-size:36px;font-weight:500;line-height:1.3;color:#C9C9C9">Open the payment trail, contract code, and paid API responses.</p>
<img data-build-in="fade 3" src="{a['panel-contracts-verified.png']}" alt="Mercado Contracts page: the permissions graph (owner key, factory, vault, exchange, FX oracle, xMXN and the products that use it), verified 17 of 17 on Sourcify" style="position:absolute;left:128px;top:520px;width:{CW}px;height:{CH}px;object-fit:contain;{FRAME}">
<img data-build-in="fade 4" src="{a['panel-developers-402.png']}" alt="Mercado Developers page: the HTTP 402 flow, request, 402 challenge for 2.00 xMXN, payment on Tempo, 200 with Payment-Receipt" style="position:absolute;left:{1792 - DW}px;top:520px;width:{DW}px;height:{DH}px;object-fit:contain;{FRAME}">
<p style="position:absolute;left:128px;bottom:64px;width:1200px;{I};font-size:24px;color:#8A8A8A;{META}">Mercado</p>
<p style="position:absolute;right:128px;bottom:64px;width:120px;{I};font-size:24px;text-align:right;color:#8A8A8A;{META}">A14</p>
<aside>Open a demonstrated payment, follow its receipt, and inspect the contract and its admin powers. The paid API trace separately shows the request, payment challenge, and returned response; we are showing inspectable execution, not a production security certification.</aside>
</section>
'''
    open(os.path.join(ps.ROOT, "project", "slides", "proof.html"), "w").write(s)
    print("proof rebuilt")


if __name__ == "__main__":
    build_proof()
