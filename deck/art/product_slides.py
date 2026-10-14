"""Generate the four product slides (dark editorial template) for the ecosystem deck."""
import json, os, sys
ROOT = os.path.join(os.path.dirname(__file__), "..")
TX = "https://explore.testnet.tempo.xyz/tx/"
M = "'DM Mono', 'Courier New', monospace"
assets = json.load(open(os.path.join(ROOT, "assets.json")))

P = [
 dict(id="j1-mint", num="04", name="Mercado Mint", tint="#22B08C", base="#0E7C66", art="product-mint.webp",
  purpose="Institutions mint xMXN.", who="Institutions and sophisticated holders with collateral that should be working.",
  proofs=[("8,600", "xMXN minted against 200 staked OUSD at 250%", "mint tx", TX+"0x38c8f545a41d9083e3580854fab635ce07e8a66aeefdfb53ff75cf95b3a37935"),
          ("200%", "minimum mint ratio for the demo tokenized T-bill", "tTBILL mint tx", TX+"0x2deb7284b2a176eca8b49cf2b4585fb2fe4643b613520429cfea7aa9dac8d480")],
  status=("#FFB547", "v2 live on testnet · sOUSD and tTBILL are demo tokens, admin-set yield and price"),
  notes="~10s. Mercado Mint is for institutions and sophisticated holders: lock collateral, mint xMXN, keep the collateral's own yield. On the v2 journey on Moderato, 200 OUSD was staked into demo sOUSD and 8,600 xMXN minted against it at 250%; a separate position used the demo tokenized T-bill, which needs at least 200% to mint and liquidates below 170%. Over-mint and over-withdraw simulations revert, and only the vault and exchange can issue. sOUSD and tTBILL are demo tokens with admin-set yield and prices: no real T-bill backing, no real yield. Repaying burns the xMXN."),
 dict(id="j2-send", num="05", name="Mercado Remesas", tint="#F08C00", base="#F08C00", art="product-remesas.webp",
  purpose="Send money home in one transaction.", who="A sender in the US paying family in Mexico, plus Tiempo Aire and bills for them.",
  proofs=[("997.8", "xMXN minted straight to the family for 50 OUSD, one tx", "remittance tx", TX+"0x88234960716451e0fdb4837dd5242b153fb9b10fbb0e1ba141916c77bc0419da"),
          ("402", "bill paid in xMXN over HTTP 402, top-up simulated", "payment tx", TX+"0xb956c7998e1bd7e4ca20af26fa5bcfcabca069ac122209746480a5de5fed8077")],
  status=("#00FF00", "v2 live on testnet · on-chain delivery only, no cash-out · airtime fulfillment simulated"),
  notes="~10s. Mercado Remesas is mobile-first, for a sender in the US paying family in Mexico. On the v2 journey, 50 testnet OUSD went into the vault's exchange and 997.8 xMXN was minted straight to the recipient in one transaction, with slippage and size limits enforced. The same app pays Tiempo Aire and services for the family through HTTP 402; the payment is real testnet xMXN, the Telcel top-up is SIMULATED. Delivery is on-chain only: there's no SPEI or bank cash-out in this prototype. The app shows it inside an Android phone."),
 dict(id="p-global", num="06", name="Mercado Global", tint="#5B82FF", base="#1E4FD6", art="product-global.webp",
  purpose="Move MXN and USD across borders.", who="Businesses and fintech partners paying suppliers and settling MXN ⇄ USD.",
  proofs=[("9.98", "OUSD redeemed for 200 xMXN, burned in the exchange", "redeem tx", TX+"0x4b1af6f4bbdd9c95646f6908caaf7f77ef26fc3d7e6721c5058d8c1bf2cdc7de"),
          ("0.50", "xMXN paid over 402 for a signed indicative quote", "paid quote tx", TX+"0x77feed29cd83ee9b269df19f1919286449d55a76531dd054bc5c92a80eb073c8")],
  status=("#00FF00", "v2 live on testnet · quotes are indicative, 30s expiry, minimum received shown"),
  notes="~10s. Mercado Global is B2B cross-border: MXN to USD and back through the vault's exchange, priced off the oracle with a size-dependent impact and a fee. On the v2 journey, 200 xMXN was redeemed for 9.98 OUSD and burned; redemptions are bounded by what the exchange issued and by a rolling daily bucket. Partners get a signed indicative quote (30-second expiry, minimum received) through an API they pay for over HTTP 402: the payment buys the quote response, not the supplier payment and not a guaranteed fill. Never call it a firm quote. The FX rate is an admin-relayed reference rate on testnet, not a decentralized oracle."),
 dict(id="j3-advance", num="07", name="Mercado Crédito", tint="#FF3D9E", base="#E4007C", art="product-credito.webp",
  purpose="Credit for the gig economy.", who="Gig drivers who need small advances, the lenders who fund them, and bots that buy scores.",
  proofs=[("500", "xMXN borrowed from pool v2 on a signed attestation", "borrow tx", TX+"0xff722d0c3b2c94509ce2174bdc7f494a31cf0604c09c9063159eeb2811c35703"),
          ("510", "xMXN repaid to lenders, realized fees 0 → 10", "repay tx", TX+"0xcca5832d15f85f026ec7307c5911177488d840943118e470338a127e3308711b")],
  status=("#FFB547", "Demo Uber Data · illustrative score, not a credit model · repayment is manual"),
  notes="~12s. Mercado Crédito has three sides. Drivers: Demo Uber Data (synthetic) gives an illustrative score and a credit line of min(15% of median weekly net, 1,500 MXN); the server signs a 15-minute EIP-712 attestation bound to the wallet, pool, chain and nonce, and the pool lends with a 2% fee. Lenders: they fund the pool separately from the vault, can't withdraw lent cash, and earn realized fees only when drivers repay; repayments go back to the pool, not burned. Underwriting API: bots pay per report over HTTP 402 with no API key. On the v2 journey, a driver borrowed 500 xMXN and repaid 510, and realized fees went from 0 to 10. Repayment is manual; nothing is deducted from Uber payouts."),
]

def slide(p):
    art = assets.get(p["art"], "ART_" + p["art"])
    pr = ""
    for i, (big, cap, lk, url) in enumerate(p["proofs"]):
        left = 128 + i * 480
        pr += (f'<div data-build-in="rise {i+3}" style="position:absolute;left:{left}px;top:600px;width:440px;display:flex;flex-direction:column;gap:8px;'
               + ("" if i == 0 else "padding:0 0 0 32px;border-left:1px solid rgba(255,255,255,0.12);") + '">'
               f'<p style="font-size:120px;font-weight:500;line-height:1;letter-spacing:-5px;color:{p["tint"]}">{big}</p>'
               f'<p style="font-family:{M};font-size:24px;line-height:1.4;color:#999999">{cap}</p>'
               f'<p style="font-family:{M};font-size:24px;color:#F2F0EA"><a href="{url}">{lk} ↗</a></p></div>\n')
    dot, st = p["status"]
    return f'''<section id="{p["id"]}" data-transition="fade" style="background:#0D0D0D;color:#F2F0EA;font-family:'Instrument Sans', Arial, sans-serif;padding:128px 128px 160px">
<div style="position:absolute;left:0;top:0;width:1920px;height:10px;background:{p["base"]}"></div>
<p style="position:absolute;left:128px;top:128px;width:900px;font-family:{M};font-size:24px;color:{p["tint"]}">{p["num"]} — {p["name"]}</p>
<h2 data-build-in="rise 1" style="position:absolute;left:128px;top:190px;width:1600px;font-size:96px;font-weight:500;line-height:1.05;letter-spacing:-4px;color:{p["tint"]}">{p["name"]}</h2>
<h2 data-build-in="rise 2" style="position:absolute;left:128px;top:292px;width:1600px;font-size:96px;font-weight:500;line-height:1.05;letter-spacing:-4px;color:#999999">{p["purpose"]}</h2>
<hr style="position:absolute;left:128px;top:440px;width:1664px;border-top:1px solid rgba(255,255,255,0.12)">
<p style="position:absolute;left:128px;top:470px;width:960px;font-family:{M};font-size:24px;color:#999999">for</p>
<p style="position:absolute;left:128px;top:506px;width:960px;font-size:32px;font-weight:500;line-height:1.3;color:#F2F0EA">{p["who"]}</p>
{pr}<img data-build-in="fade 5" src="{art}" alt="" style="position:absolute;left:1152px;top:470px;width:640px;height:404px;object-fit:cover;border:1px solid rgba(255,255,255,0.12)">
<div style="position:absolute;left:128px;top:900px;width:12px;height:12px;border-radius:50%;background:{dot};box-shadow:0 0 10px {dot}"></div>
<p style="position:absolute;left:152px;top:886px;width:1640px;font-family:{M};font-size:24px;color:#999999">{st}</p>
<p style="position:absolute;left:128px;bottom:64px;width:1200px;font-family:{M};font-size:24px;color:#8A8A8A">Mercado · testnet prototype on Tempo Moderato</p>
<p style="position:absolute;right:128px;bottom:64px;width:120px;font-family:{M};font-size:24px;text-align:right;color:#8A8A8A">{p["num"]}</p>
<aside>{p["notes"]}</aside>
</section>
'''

if __name__ == "__main__":
    for p in P:
        if p["id"] == "j3-advance" and "--keep-credito" in sys.argv:
            continue
        open(os.path.join(ROOT, "project", "slides", p["id"] + ".html"), "w").write(slide(p))
        print(p["id"], "ok", "art url" if p["art"] in assets else "ART PLACEHOLDER")
