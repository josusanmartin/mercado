# Deck v8 · plug-and-play financial ecosystem (josu, 10:40)

josu: "too many slides. Let's all focus on making the presentation good. Central idea: we are building a **plug-and-play financial ecosystem**. Mexico is the example; it works for any developing economy. Each slide is a product: we present what it does. We don't care about balances in the wallet, we care about functionality." Also: no separate problem slide; mention the problem in one line. The cover image is broken.

## Main flow (9 slides, ~3 min)
1. **Cover**: "MERCADO" + "A plug-and-play financial ecosystem." + one line that names the problem: "Emerging economies run on cash, remittance fees and payday loans. Mercado plugs a full financial system into any local currency." Small meta: "Mexico first · built on Tempo". The image-in-type art must be a pre-rendered **<img>** (PNG with transparency), **never a CSS `background:url(/_blob…)`** (the player's editor drops it; that's what broke).
2. **The ecosystem**: one diagram. The local stablecoin (xMXN) at the center, the six modules around it as plug-in blocks (Mint, Remesas, Global, Crédito, Card, Invest), with a hint of "swap the currency: xMXN → xCOP · xBRL · xNGN…". 6–10 words of copy.
3–8. **One slide per product** in this order: **Mint, Remesas, Global, Crédito, Card, Invest**. Same template on all six:
   - the product name (big, in its accent color) + **one line on what it does** (functionality, not numbers);
   - **a 3-step flow** (icon + 2–4 words each) showing how it works, e.g. Remesas: "Dollars in → Exchange mints pesos → Family gets pesos in seconds";
   - **one screenshot of the ACTION**, not a home/balance screen: the Mint issue form, the Remesas send-review sheet, the Global pay card, the Crédito slider/advance sheet, the Card approve sheet, the Invest save sheet. Crop tight on the action. No wallet balances as the hero; if a balance is in frame, it's incidental.
   - a tiny meta line: what plugs in locally (e.g. "Local piece: licensed payout partner").
9. **Plug and play / close**: "Mexico is the template. Any developing economy is next." Show what changes per country: currency oracle, local stablecoin, payout/KYC partners, income-data integrations. **Everything else ships as is.** Then the ask: "One corridor. One driver platform. One merchant pilot." + the single testnet line: "Built and running end-to-end on Tempo testnet."

## Appendix (4 slides max)
Spend video (the live proof, 37s), Architecture (the contracts permissions graph), Risk (the FX gauge + coverage), Judge Q&A (notes). Delete: problem, system (old), compounds, xmxn, next, j4-bills, j5-agent, proof, old p-*/j-* slides once their content is in the new product slides.

## Rules
- Production framing; no disclaimers except the one testnet line on the close. No balances as headline numbers; numbers only where they explain a function (e.g. a 2% fee, 5%/8% a year, US$500 → ~9,150 pesos).
- Less text: ≤20 words of on-slide copy per product slide, excluding the 3 step labels.
- Same visual language as now (dark, Anton + Inter Tight, product accents, glitch art), fully consistent across the 6 product slides.
- Speaker notes: ≤35 words per main slide, total ≤230 spoken words, and they carry the "plug and play / Mexico is the example" story.
- Fresh action captures from the live app with ?present=1 (no txs; never press Approve/Pay/Send). List every new asset in IRC and touch deck/PUBLISH. lead reviews and publishes.
