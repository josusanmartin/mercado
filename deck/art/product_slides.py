"""Generate the four product slides (dark editorial template) for the ecosystem deck."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from principles import apply as principles
ROOT = os.path.join(os.path.dirname(__file__), "..")
TX = "https://explore.testnet.tempo.xyz/tx/"
M = "'DM Mono', 'Courier New', monospace"
assets = json.load(open(os.path.join(ROOT, "assets.json")))

P = [
 dict(id="j1-mint", headline='Deposit collateral. Issue pesos.', subline='Keep earning on assets that pay yield.', number=None, num="04", name="Mercado Mint", tint="#00A68A", base="#00A68A", art="product-mint-v4.webp",
  purpose="Institutions mint xMXN.", who="Institutions and sophisticated holders with collateral that should be working.",
  proofs=[("48.99M", "pesos an institution can mint against US$4M of collateral, at the 150% line", None, None),
          ("200%", "recommended ratio: MX$36.74M on the same US$4M", None, None)],
  status=None,
  notes="Institutions keep eligible collateral in a vault and borrow newly issued pesos against it; yield-bearing collateral can keep accruing while deposited. This is secured debt, and a position can be liquidated if its backing falls too far."),
 dict(id="j2-send", headline='Send money home.', subline='Your family receives pesos straight into their wallet.', number='9,149 pesos received.', num="05", name="Mercado Remesas", tint="#FF8A1F", base="#FF8A1F", art="product-remesas-v4.webp",
  purpose="Send money home in one transaction.", who="A sender in the US paying family in Mexico, plus Tiempo Aire and bills for them.",
  proofs=[("9,149.04", "pesos the family receives for US$500, in one transaction", None, None),
          ("0.40%", "all-in cost versus the market rate, fee included", None, None)],
  status=None,
  notes="Sending five hundred dollars quotes about nine thousand one hundred forty-nine pesos after the exchange fee and size impact. This is wallet delivery, not bank cashout; the exact amount is quoted before sending."),
 dict(id="p-global", headline='Pay your supplier in pesos.', subline='Send dollars. Deliver pesos straight to their wallet.', number='176,297 pesos delivered.', num="06", name="Mercado Global", tint="#5C8BFF", base="#2F6BFF", art="product-global-v4.webp",
  purpose="Move MXN and USD across borders.", who="Businesses and fintech partners paying suppliers and settling MXN ⇄ USD.",
  proofs=[("176,294.94", "pesos to a supplier for US$10,000, quoted in real time", None, None),
          ("30 s", "signed indicative quote, minimum received shown up front", None, None)],
  status=None,
  notes="Ten thousand dollars quotes about one hundred seventy-six thousand two hundred ninety-seven pesos in the current example. Buying a signed quote pays for an API response; moving the supplier's money is a separate action."),
 dict(id="j3-advance", headline='Get an advance on what you’ve earned.', subline='Use your earnings history to request an advance.', number='Up to 1,500 pesos.', num="07", name="Mercado Crédito", tint="#F2357D", base="#F2357D", art="product-credito-v4.webp",
  purpose="Credit for the gig economy.", who="Gig drivers who need small advances, the lenders who fund them, and bots that buy scores.",
  proofs=[("1,500", "pesos advanced against a driver's earnings line", None, None),
          ("2%", "flat fee, repaid by the driver as they earn", None, None)],
  status=None,
  notes="Drivers share earnings data, receive an offer, and draw from lender capital within their available limit. Our demonstrated earnings are simulated, the loan is unsecured, and repayment is manual with the fee shown before borrowing."),
 dict(id="p-card", headline='Tap to pay at the corner store.', subline='Approve the amount. See the receipt.', number=None, num="08", name="Mercado Card", tint="#9B82FF", base="#7C5CFF", art="product-card-v4.webp",
  purpose="Spend xMXN at a shop.", who="Anyone holding xMXN who wants to pay at a counter: the family in Mexico, a driver, a merchant's customers.",
  proofs=[("450", "pesos paid with a tap at the corner store", None, None),
          ("1,000", "pesos daily limit, resets at midnight CDMX; freeze any time", None, None)],
  video=("hero-spend-final.mp4", "hero-spend-final-paid.png"),
  status=None,
  notes="The same driver approves the shop and amount, and the payment moves pesos already in that wallet. A frozen card rejects the charge; this is a Mercado merchant payment flow, not an issued Visa or Mastercard."),
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
    big = p.get("number")
    bsize = 96 if big and len(big) <= 16 else 80
    numblock = (f'<p data-build-in="rise 3" style="position:absolute;left:128px;top:700px;width:920px;font-size:{bsize}px;font-weight:500;line-height:1;letter-spacing:-5px;color:{p["tint"]}">{big}</p>\n') if big else ""
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
{numblock}{visual}{capline}<p style="position:absolute;left:128px;bottom:64px;width:1200px;font-family:{M};font-size:24px;color:#8A8A8A">Mercado</p>
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
