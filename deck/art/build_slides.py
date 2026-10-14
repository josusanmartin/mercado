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
    "p-global": [("panel", "panel-global-quote.png")],
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

if __name__ == "__main__":
    out = os.path.join(ps.ROOT, "project", "slides")
    for p in ps.P:
        if p["id"] == "p-invest":
            continue
        p = dict(p, visuals=VISUALS.get(p["id"], []))
        p.pop("video", None)
        open(os.path.join(out, p["id"] + ".html"), "w").write(principles(ps.slide(p)))
        print(p["id"], [v[1] for v in p["visuals"]])
    for p in EXTRA:
        open(os.path.join(out, p["id"] + ".html"), "w").write(principles(ps.slide(p)))
        print(p["id"], [v[1] for v in p["visuals"]])
