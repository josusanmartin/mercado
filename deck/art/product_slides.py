"""Generate the four product slides (dark editorial template) for the ecosystem deck."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from principles import apply as principles
ROOT = os.path.join(os.path.dirname(__file__), "..")
TX = "https://explore.testnet.tempo.xyz/tx/"
M = "'DM Mono', 'Courier New', monospace"
assets = json.load(open(os.path.join(ROOT, "assets.json")))

P = [
 dict(id="j1-mint", num="05", name="Mercado Mint", tint="#00A68A", base="#00A68A", art="product-mint-v4.webp",
  purpose="Institutions mint xMXN.", who="Institutions and sophisticated holders with collateral that should be working.",
  proofs=[("1,469.93", "xMXN minted against 200 staked OUSD at 250%, USD/MXN 18.37", "mint tx", TX+"0xcff60f04384cf61cc073b504a717d51fa719b9a31bf68a0eb38cbe71ed820166"),
          ("6,124.71", "xMXN minted against 10 demo T-bills at 300%", "tTBILL mint tx", TX+"0xaeaacdf5e0dbddfbfff3f5f29dca4dd63f970915712bc8df2be407c24fbff179")],
  status=("#FFB547", "v2 live on testnet · sOUSD and tTBILL are demo tokens, admin-set yield and price"),
  notes="~10s. Mercado Mint is for institutions and sophisticated holders: lock collateral, mint xMXN, keep the collateral's own yield. On the v2 journey on Moderato, at the real rate (USD/MXN 18.37, admin-relayed from Coinbase), 200 OUSD was staked into demo sOUSD and 1,469.93 xMXN minted against it at 250%; a separate position deposited 10 demo tokenized T-bills (priced at $100 each, about 18,374 xMXN of value) and minted 6,124.71 xMXN at 300%. T-bills need at least 200% to mint and liquidate below 170%. Over-mint and over-withdraw simulations revert, and only the vault and exchange can issue. sOUSD and tTBILL are demo tokens with admin-set yield and prices: no real T-bill backing, no real yield. Repaying burns the xMXN."),
 dict(id="j2-send", num="06", name="Mercado Remesas", tint="#FF8A1F", base="#FF8A1F", art="product-remesas-v4.webp",
  purpose="Send money home in one transaction.", who="A sender in the US paying family in Mexico, plus Tiempo Aire and bills for them.",
  proofs=[("916.69", "xMXN minted straight to the family for 50 OUSD at 18.37, one tx", "remittance tx", TX+"0xabd8478e4955955be052d92016181070650130f0337e88e9df9e485cec8789f2"),
          ("402", "bill paid in xMXN over HTTP 402, top-up simulated", "payment tx", TX+"0x4d08f4097f7a4bf4f05212cc4304585f4603cd0e8c1020a5695f746c31e17fd0")],
  status=("#00FF00", "v2 live on testnet · on-chain delivery only, no cash-out · airtime fulfillment simulated"),
  notes="~10s. Mercado Remesas is mobile-first, for a sender in the US paying family in Mexico. On the v2 journey, 50 testnet OUSD went into the vault's exchange and 916.69 xMXN was minted straight to the recipient in one transaction: the oracle mid of USD/MXN 18.37 (admin-relayed from Coinbase) less a 20 bps fee (1.84 xMXN) and 2 bps of size impact, with slippage and size limits enforced. The same app pays Tiempo Aire and services for the family through HTTP 402; the payment is real testnet xMXN, the Telcel top-up is SIMULATED. Delivery is on-chain only: there's no SPEI or bank cash-out in this prototype. The app shows it inside an Android phone. The screenshot is the live app on v2: the send runs through the Mercado exchange, which mints xMXN to the family. A card top-up ('Agregar dólares con tarjeta': a simulated checkout that delivers real OUSD on-chain) is built but switched off until its security review passes, so don't demo or claim it; the app shows 'Próximamente'."),
 dict(id="p-global", num="07", name="Mercado Global", tint="#5C8BFF", base="#2F6BFF", art="product-global-v4.webp",
  purpose="Move MXN and USD across borders.", who="Businesses and fintech partners paying suppliers and settling MXN ⇄ USD.",
  proofs=[("10.86", "OUSD out for 200 xMXN redeemed and burned, at 18.37", "redeem tx", TX+"0xaf270ccf37d94806ed8f97f791f068029a63a9b5021920a44b344199a615af68"),
          ("0.50", "xMXN paid over 402 for a signed indicative quote", "paid quote tx", TX+"0x77feed29cd83ee9b269df19f1919286449d55a76531dd054bc5c92a80eb073c8")],
  status=("#00FF00", "v2 live on testnet · quotes are indicative, 30s expiry, minimum received shown"),
  notes="~10s. Mercado Global is B2B cross-border: MXN to USD and back through the vault's exchange, priced off the oracle with a size-dependent impact and a fee. On the v2 journey, 200 xMXN was redeemed for 10.86 OUSD at USD/MXN 18.37 and burned, with exchange coverage at 307%; redemptions are bounded by what the exchange issued and by a rolling daily bucket. Partners get a signed indicative quote (30-second expiry, minimum received) through an API they pay for over HTTP 402: the payment buys the quote response, not the supplier payment and not a guaranteed fill. Never call it a firm quote. The screenshot is the live app on v2, showing the exchange reserve and about 300% coverage of the xMXN it issued. The FX rate is real (Coinbase, about 18.37) but admin-relayed on-chain on testnet, not a decentralized oracle."),
 dict(id="j3-advance", num="08", name="Mercado Crédito", tint="#F2357D", base="#F2357D", art="product-credito-v4.webp",
  purpose="Credit for the gig economy.", who="Gig drivers who need small advances, the lenders who fund them, and bots that buy scores.",
  proofs=[("500", "xMXN borrowed from pool v2 on a signed attestation", "borrow tx", TX+"0x96244a9a1c8e792f547bf638f6658ee9a948bfaaecc6c43d80e3c62926339ad8"),
          ("510", "xMXN repaid to lenders, realized fees 10 → 20", "repay tx", TX+"0x08854d60c176840a2e44db11aed6477354f074c2a3470f42b3015b0d9be1669d")],
  status=("#FFB547", "Demo Uber Data · illustrative score, not a credit model · repayment is manual"),
  notes="~12s. Mercado Crédito has three sides. Drivers: Demo Uber Data (synthetic) gives an illustrative score and a credit line of min(15% of median weekly net, 1,500 MXN); the server signs a 15-minute EIP-712 attestation bound to the wallet, pool, chain and nonce, and the pool lends with a 2% fee. Lenders: they fund the pool separately from the vault, can't withdraw lent cash, and earn realized fees only when drivers repay; repayments go back to the pool, not burned. Underwriting API: bots pay per report over HTTP 402 with no API key. On the v2 journey, a driver borrowed 500 xMXN, paid 100 xMXN of Telcel airtime over a real 402, and repaid 510, and realized fees went from 10 to 20. Repayment is manual; nothing is deducted from Uber payouts."),
 dict(id="p-card", num="09", name="Mercado Card", tint="#9B82FF", base="#7C5CFF", art="product-card-v4.webp",
  purpose="Spend xMXN at a shop.", who="Anyone holding xMXN who wants to pay at a counter: the family in Mexico, a driver, a merchant's customers.",
  proofs=[("150", "xMXN paid by tap at a demo shop, after a frozen-card decline", "charge tx", TX+"0x5f97a04d6a6c52f95120c960de67de476f9012bf067f004cf4c1603946887ba5"),
          ("375", "xMXN advance drawn first; Javier owes 382.50", "draw tx", TX+"0x083a2de4b0ac30b74e5e5590dc59afd451b73a612275033ea022461b3711357c")],
  video=("hero-spend-final.mp4", "hero-spend-final-paid.png"),
  status=("#00FF00", "live on v2 testnet · demo card network and number, not Visa or Mastercard"),
  notes="~8s. Mercado Card is the fifth product: spend xMXN at a shop. The design: a holder issues a virtual card with an on-chain daily limit that resets at midnight CDMX and can freeze it; an allowlisted demo merchant terminal charges it, the holder approves with a tap signature, xMXN moves on-chain from holder to merchant, and refunds are real too. Only the card network and the card number are simulated: it's a demo virtual card, not Visa or Mastercard, and it works only at Mercado demo merchants, with no physical card and no ATM. The video (about 40 seconds, all real Tempo transactions) is one person, one peso: Javier connects his demo Uber data, draws a 375 xMXN advance (owing 382.50 with the 2% fee), freezes his Mercado Card, gets declined at 'Tienda Doña Mary' with nothing charged, unfreezes, and the retry pays 150 xMXN exactly once, with receipts on the shop terminal and the phone. Earlier, a 25 xMXN charge was also refunded on-chain; the app's activity list reads the CardCharged and CardRefunded events. The holder's tap signature is mandatory, so an approved merchant alone can't pull funds; the daily limit resets at midnight CDMX. The adversarial review of the charge authorization is still running, so don't call it audited."),
 dict(id="p-invest", num="10", name="Mercado Invest", tint="#F2B807", base="#F2B807", art="product-invest-v4.webp",
  purpose="Save in pesos, dollars or T-bills.", who="Savers in Mexico, and institutions holding xMXN or dollars that should be working.",
  proofs=[("0.0998", "demo T-bill bought for 10 OUSD on the InvestDesk", "T-bill buy tx", TX+"0x3b5ec7b7f73be6a4558139904f797ebce34b3f0bf6c344e979f294c46ac54879"),
          ("200", "OUSD staked into sOUSD: dollar savings, demo-funded yield", "stake tx", TX+"0xd64599b71806f40156bfc3c1626392a0ea48107c3678078cd6737b9ba88f55bc")],
  status=("#00FF00", "all three live on v2 · demo yield and T-bill price, admin-set · returns variable, never guaranteed"),
  notes="~8s. Mercado Invest is the savings product, with three ways to grow money. Peso savings: deposit xMXN into the real Crédito lending pool; the return is the driver fees actually realized, so far 20 xMXN in pool v2, historical and variable, never guaranteed, and only idle cash is withdrawable. Dollar savings: stake OUSD into sOUSD, the real ERC-4626 on v2, whose accrual comes from a demo yield reserve the admin funds on testnet. T-bills: buy and sell the demo tokenized T-bill through a new InvestDesk at the admin feed price plus a spread, then use it as Mint collateral; all three are live on v2 and were verified in the browser: 10 xMXN supplied to the pool, 10 OUSD into sOUSD (demo APR 5%), and 10 OUSD buying 0.09975 tTBILL on the desk at the $100 admin price plus spread. The tTBILL is a demo, not a security; its issuance is gated (no faucet), and the desk only buys back what it sold to you. Never say guaranteed returns."),
]

def slide(p):
    prod = p["art"].replace("product-", "").replace("-v4.webp", "")
    key = next((k for k in (f"screen-{prod}-v6.png", f"screen-{prod}-v5.png", f"screen-{prod}-v3.png", f"screen-{prod}-v2live2.png", f"screen-{prod}-v2live.png", f"screen-{prod}-v4.png") if k in assets), None)
    shot = key is not None
    art = assets[key] if shot else assets.get(p["art"], "ART_" + p["art"])
    alt = (p["name"] + " in the Mercado app: product header, live KPIs and the first tab") if shot else ""
    vid = p.get("video")
    if vid and vid[0] in assets and vid[1] in assets:
        art, alt = assets[vid[1]], "40-second screen recording: Javier draws a 375 xMXN advance, his frozen Mercado Card is declined at a demo shop, he unfreezes it and a 150 xMXN tap payment goes through once, with receipts"
        vattr = f' data-video="{assets[vid[0]]}"'
    else:
        vattr = ""
    pr = ""
    for i, (big, cap, lk, url) in enumerate(p["proofs"]):
        left = 128 + i * 480
        pr += (f'<div data-build-in="rise {i+3}" style="position:absolute;left:{left}px;top:600px;width:440px;display:flex;flex-direction:column;gap:8px;'
               + ("" if i == 0 else "padding:0 0 0 32px;border-left:1px solid rgba(255,255,255,0.12);") + '">'
               f'<p style="font-size:120px;font-weight:500;line-height:1;letter-spacing:-5px;color:{p["tint"]}">{big}</p>'
               f'<p style="font-family:{M};font-size:24px;line-height:1.4;color:#999999">{cap}</p>'
               + (f'<p style="font-family:{M};font-size:24px;color:#F2F0EA"><a href="{url}">{lk} ↗</a></p>' if url else '') + '</div>\n')
    dot, st = p["status"]
    return f'''<section id="{p["id"]}" data-transition="fade" style="background:#0D0D0D;color:#F2F0EA;font-family:'Instrument Sans', Arial, sans-serif;padding:128px 128px 160px">
<div style="position:absolute;left:0;top:0;width:1920px;height:10px;background:{p["base"]}"></div>
<p style="position:absolute;left:128px;top:128px;width:900px;font-family:{M};font-size:24px;color:{p["tint"]}">{p["num"]} — {p["name"]}</p>
<h2 data-build-in="rise 1" style="position:absolute;left:128px;top:190px;width:1600px;font-size:96px;font-weight:500;line-height:1.05;letter-spacing:-4px;color:{p["tint"]}">{p["name"]}</h2>
<h2 data-build-in="rise 2" style="position:absolute;left:128px;top:292px;width:1600px;font-size:96px;font-weight:500;line-height:1.05;letter-spacing:-4px;color:#999999">{p["purpose"]}</h2>
<hr style="position:absolute;left:128px;top:440px;width:1664px;border-top:1px solid rgba(255,255,255,0.12)">
<p style="position:absolute;left:128px;top:470px;width:960px;font-family:{M};font-size:24px;color:#999999">for</p>
<p style="position:absolute;left:128px;top:506px;width:960px;font-size:32px;font-weight:500;line-height:1.3;color:#F2F0EA">{p["who"]}</p>
{pr}<img data-build-in="fade 5" src="{art}"{vattr} alt="{alt}" style="position:absolute;left:1152px;top:470px;width:640px;height:404px;object-fit:{"contain;background:#161616" if vattr else "cover"};border:1px solid rgba(255,255,255,0.12)">
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
        open(os.path.join(ROOT, "project", "slides", p["id"] + ".html"), "w").write(principles(slide(p)))
        print(p["id"], "ok", "art url" if p["art"] in assets else "ART PLACEHOLDER")
