# Deck v8 — judge critique

**Reviewed 14 October 2026; published v8 / artifact version 90 as reported by lead. Baseline HEAD `030cbae827d1410a08ba437161ca559f802472ff`.** This is a critique of the supplied 13 PNG renders and their corresponding HTML notes, not a claim that the remote presentation player was independently tested.

**Verdict:** this is now a coherent, attractive product catalogue. It is not yet a convincing explanation of why an operator should adopt a reusable financial system. In the first ten seconds, MERCADO and “plug-and-play” land. After three minutes, I expect a judge to remember six branded applications around a peso token, but still ask who adopts them, which parts actually travel to another country, and where the money behind credit and returns comes from. Those are presentation judgments, not observed audience results.

Keep the nine-slide main sequence, the readable sarape wordmark, dark canvas, product accents and action screenshots. The recurring template is a strength. **There is no observed broken-render P0 in the 13 supplied images.** Fix the claims and the platform argument before adding visual decoration.

**Evidence and scope.** All 13 renders inspected; all `<aside>` notes read. Main notes total **209 words**, every main slide is at or below 35 words, so the brief's word limits pass. Seven current app routes were opened at 1440×900, dark, `?present=0`: Home, Mint, Remesas, Global, Invest, Developers and Contracts; all returned 200 with no recorded page errors. The Mint Risk tab was inspected. Card/Crédito flows were left untouched; their claims were checked against the supplied captures, current source and the existing recorded video. No signatures, paid API calls or transactions. [Live checks](deck-v8-evidence/live/summary.json), [13-slide claim ledger](deck-v8-evidence/claim-ledger.json), [extracted copy/notes](deck-v8-evidence/slides-extracted.json), [render hashes](deck-v8-evidence/renders-manifest.json), [numbered code snapshots](deck-v8-evidence/code-manifest.json).

**The eight improvements, ranked by judge impact relative to effort**

**1. P1 — Separate Invest's savings mechanism from its stocks claim. Slides 08 and A4. Owner: slides; factual check: api/contracts. Effort: copy only.**

“Save in dollars, pesos or stocks, earning every second” makes the last clause apply to all three. The notes repeat the conflation. The live app deliberately separates two reserve-funded savings vaults from buying an index token. The token is admin-priced and does not represent ownership of equities. A judge who asks “who pays the 8%?” should not discover a different product in the appendix.

**Exact change:** lead has approved the on-slide wording **“Save in dollars or pesos. Buy stocks.”** Keep “stocks” as requested, and make its implementation explicit in speech: **“The two vaults accrue from funded reserves. Stocks uses a demo index token with an admin-set price, not ownership of equities.”** Steps: **“Choose asset → Deposit or buy → Track value.”** Keep the deposit sheet. Remove 5%/8% from the main spoken claim; leave configured rates and reserve mechanics in the Q&A answer. The word “stocks” must not become a claim of underlying equity custody.

Evidence: [08 render](deck-v8-evidence/renders/08-invest.png); `deck/project/slides/invest.html:5,10,15`; [live Invest](deck-v8-evidence/live/invest.json); `apps/web/components/invest/invest-screen.tsx:241`, `apps/web/components/invest/use-stocks.ts:2`, `packages/contracts/src/v2/StakedOUSD.sol:10,42,64`. **Judge's question:** “Is that investment income, a subsidy, or merely a moving counter?”

**2. P1 — Crédito is earnings-informed lending, not demonstrated earned-wage access. Slides 06 and A1. Owner: slides; factual check: api. Effort: copy only.**

“Advances on what gig workers already earned” implies an identified unpaid wage receivable and a collection relationship with the platform. Current eligibility uses synthetic earnings history; the cap is based on median weekly earnings. The borrower manually repays separate lender capital. Neither the pretty score nor an attestation establishes payroll collection or default protection.

**Exact change:** **“Working-capital advances based on earnings history.”** Steps: **“Connect earnings → Check your limit → Draw xMXN.”** Notes: **“Earnings history sizes a credit line. Separate lender capital funds the advance, with a flat two percent fee. Repayment is manual; current income data is simulated.”** This preserves the function and explains who supplies the funds. On A1 replace the subtitle with **“An earnings-informed advance, spent at a Mercado merchant.”** Keep the slider, fee and total-repayment screenshot; they explain the product better than the score alone.

Evidence: [06 render](deck-v8-evidence/renders/06-credito.png), [A1 render](deck-v8-evidence/renders/10-spend-video.png); `credito.html:5,15`, `spend-video.html:4`; `apps/web/lib/server/credit/score.ts:5–10,82–114`, `provider.ts:80–111`, `packages/contracts/src/CreditPool.sol:119–158`. **Judge's question:** “If the driver never repays, who loses money and what recourse exists?”

**3. P1 — Make “plug-and-play” an architecture claim with a customer and an adoption request. Slides 01, 02 and 09. Owner: slides/lead. Effort: small layout and copy change.**

The cover names a category, the ecosystem lists modules, and the close lists country differences. None identifies the adopter. “Everything else ships as is” skips funding, risk configuration and integration work. The factory accepts currency parameters, but the reviewed implementation is one Mexico deployment; its factory creates one token and locks its issuer set. That supports reuse of components, not a demonstrated country switch.

**Exact change:** retain the cover headline; replace the broad “emerging economies run on…” paragraph with **“Local-currency finance is fragmented. Give fintech operators connected payments, credit and savings.”** Treat fintech operators as the proposed initial customer, not validated demand. On 02 change the hub caption to **“MXN-denominated token”**, and the bottom label to **“Future configurations”** before xCOP/xBRL/xNGN. Keep all six modules; “Invest saves it” becomes **“saves and invests”**, because not every Invest holding is xMXN.

For 09, lead approved retaining **“Mexico is the template. Any developing economy is next.”** Replace the right-hand glitch art with two equal columns: **REUSE** — issuance, exchange, credit, spending, savings; **LOCALIZE** — currency + rate feed, funding, risk rules, licensed partners. Under them: **“Reuse the core. Integrate each market.”** Ask: **“Introduce us to a Mexico corridor operator, a driver platform and a merchant partner.”** Keep the single testnet line, scoped as **“On-chain product flows built and running on Tempo testnet.”** Set the ask in two intentional lines, not a wrap that leaves “ONE” stranded at the end of the first line.

Evidence: [01](deck-v8-evidence/renders/01-cover.png), [02](deck-v8-evidence/renders/02-ecosystem.png), [09](deck-v8-evidence/renders/09-close.png); `close.html:6–12`; `packages/contracts/src/v2/MercadoFactoryV2.sol:29–48`. **Judge's question:** “Who plugs this in, and what have you proved can be reused?”

**4. P1 — Name the actual delivery rail and distinguish the two payment products. Slides 03–05 and 07. Owner: slides; factual check: api/contracts. Effort: copy only.**

“Family gets pesos,” “suppliers abroad in their own currency,” and “tap to pay” can be heard as bank payout, arbitrary-currency settlement and ordinary contactless-card acceptance. The current evidence is more specific: token delivery to wallets and per-purchase approval at Mercado merchants. The screenshots show this, but their small labels cannot carry the entire distinction. Remesas and Global also sound like the same product twice unless you explain the different customer/job.

Use these exact replacements; keep the six-slide template:

| Slide | Function line | Three steps | Local piece |
|---|---|---|---|
| 03 Mint | **Lock collateral. Issue xMXN. Repay to unlock.** | Lock collateral → Mint xMXN → Repay to unlock | Currency feed |
| 04 Remesas | **Send OUSD. Deliver xMXN to a family wallet.** | Choose recipient → Review xMXN quote → Send to wallet | Payout partner |
| 05 Global | **Pay suppliers in xMXN with a protected minimum.** | Enter supplier → Review minimum → Pay xMXN | Business KYC |
| 07 Card | **Approve each purchase. Pay a Mercado merchant.** | Merchant request → Approve amount → On-chain receipt | Merchant integration |

Keep partner lines as integration requirements; do not imply signed commercial relationships. Explain OUSD once in the Mint/Remesas speech. Say the family receives xMXN in its wallet; the roughly 9,250 figure is a captured example, not a promised current quote. For Global, spend the sentence on supplier addressing, minimum receipt and the paid quote API. For Card, the valuable differentiator is an amount-and-merchant-bound signature; there is no need to borrow an NFC implication. Mint's repay/unlock story is supported, but it is one of two issuance paths; the exchange also mints.

Evidence: [04](deck-v8-evidence/renders/04-remesas.png), [05](deck-v8-evidence/renders/05-global.png), [07](deck-v8-evidence/renders/07-card.png); [live Remesas](deck-v8-evidence/live/remesas.json) explicitly says no bank cash-out/SPEI; [live Global](deck-v8-evidence/live/global.json) names OUSD→xMXN and on-chain minOut; `MoveAMM.sol:137–152`, `MercadoCard.sol:13–26,121–157`. **Judge's question:** “Can the recipient spend or cash out outside your demo merchants?”

**5. P1 — Put the proof and the Tempo reason inside the three-minute story. Slides 02, 05, 07 and A1. Owner: slides. Effort: medium; reuse the existing recording.**

The nine main slides show prepared forms; the execution proof is optional appendix material. A sharp judge can mistake a substantial implementation for six frontend demos. “Built on Tempo” is a badge until you explain the shared ledger, sponsored fees and an inspectable receipt. The current MPP explanation is buried in A4, while the close's large HTTP-402 art introduces an unexplained technical concept.

**Exact change:** on 02, replace generic country-expansion speech with one sentence about shared rails: **“Six products share one token ledger on Tempo, with sponsored fees and inspectable transfers. Local partners connect that core to each market.”** On 05 say **“Partners can also buy a signed quote through HTTP 402.”** Make clear in Q&A that payment buys the API response, not the supplier transfer.

On 07 retain the approval sheet as poster, then play the **20.0s→36.64s segment** of the existing spend recording in the right-hand action area; review the edit so the frozen decline, retry/approval and paid receipt all remain intelligible. Use the caption **“Recorded on-chain flow”**. End on the receipt. Keep the complete 36.64s video in A1 for questions. Do not create a second main slide or perform a new transaction. The A1 note's separate HTTP-402 call requires a separate demo; remove that sentence if the operator only plays this recording.

Evidence: [video metadata](deck-v8-evidence/video-metadata.json), [sampled frames](deck-v8-evidence/video-contact.png), `spend-video.html`, [live Developers](deck-v8-evidence/live/developers.json). At 22s the recording shows a frozen-card decline; at 32s it shows a charge receipt. Those are recording observations, not fresh transaction verification. **Judge's question:** “What actually happened on-chain, and why is Tempo useful here?”

**6. P1 — Turn the risk appendix into an answer about failure modes. Slides A2 and A3. Owner: slides; factual check: contracts. Effort: small diagram/crop change.**

A3's large green 259%/280% and distant 135% marker create a reassuring aggregate story. The implementation liquidates individual positions against each collateral's own threshold; there is no universal 135% system liquidation trigger. The screenshot does say positions have separate limits, but the gauge dominates that sentence. It also mixes the exchange's reserve coverage with the vault's collateral backing. A2's graph is useful but simplified: FX affects vault valuation too, and owner controls extend beyond the one drawn branch.

**Exact change:** A3 headline **“Two balance sheets. Different failure modes.”** Use two columns: **“Mint: positions liquidate at their own collateral thresholds.”** / **“Exchange: redemptions use its reserve, with NAV haircuts and rate limits.”** Retain coverage figures as small, timestamped snapshot context. Remove the aggregate 135% gauge from this slide, or caption it **“Aggregate reference only; not a liquidation trigger”** and make the per-position explanation larger. The more useful question is not how far one aggregate benchmark is away, but whether a particular holder can exit.

On A2 label the image **“Issuance graph · snapshot 14 Oct 2026”** and the verification line **“17 source matches · unaudited”**. In a deck-native redraw, connect FX to both issuers and owner controls to their respective parameters. Do not make the screenshot's historical balances appear current. Keep the existing explicit Q&A answer about owner-controlled feeds and settings.

Evidence: [A2](deck-v8-evidence/renders/11-architecture.png), [A3](deck-v8-evidence/renders/12-risk.png); `apps/web/components/mint/mint-dashboard.tsx:375–409` calculates an aggregate reference using hardcoded 13,500 bps; `MultiCollateralVault.sol:191–210` uses per-collateral liquidation parameters. Live coverage had already moved to 261% during this review, while the deck correctly preserves an earlier 259% snapshot. [Live Risk text](deck-v8-evidence/live/mint.json), [live Contracts](deck-v8-evidence/live/contracts.json). **Judge's question:** “Can holders redeem during stress, and who can change the rules?”

**7. P2 — Give the actions a consistent visual weight and projection size. Slides 03–08. Owner: slides. Effort: one template pass and selective recrops.**

Names, colors, icon strokes and left margins are consistent. Screenshot scale is not: Crédito/Invest are 820px tall, Global 503px, Card 457px. Global's most useful evidence—the minimum received and fee—is much smaller than the oversized product name. Mint still carries a nearly million-token wallet balance and dense ratio chips; Global retains “Max: 999,989.42.” Those are incidental rather than headline balances, so this is polish, not failure of the functionality brief.

**Exact layout:** keep names and accent colors; reduce display type from **200px to 176px** across all six. Keep function text at **46px**, two lines maximum. Use one right action region **x=1152, y=184, w=640, h=760**; anchor the meaningful primary action near **y=824** by adjusting the crop, never stretching the image. Keep equal phone widths and preserve the sheet's aspect ratio. Global should prioritize input, output, minimum and Pay; crop ancillary wallet-max/address-helper lines when possible. Mint should prioritize collateral input, issue amount, after-ratio and Deposit-and-mint. Keep financial amounts and quoted protections intact.

Use the short step labels above to avoid awkward three-line wraps, and align all step-label baselines. Reduce top fade masks so labels such as merchant identity remain readable. Correct Mint's alt text: it currently says **7,459** while the image shows **7,454.57**; better omit the changing amount and describe the action. Where Global/Invest image rows were removed to close gaps, preserve the original capture in the asset provenance and call the result a presentation crop, not an untouched screenshot.

Evidence: `mint.html:4,12`, `global.html:12`, `credito.html:12`, `card.html:12`, `invest.html:12`; [03](deck-v8-evidence/renders/03-mint.png), [05](deck-v8-evidence/renders/05-global.png), [08](deck-v8-evidence/renders/08-invest.png); slides' crop description in [IRC record](deck-v8-evidence/irc-start.txt).

**8. P1 — Prepare the commercial questions alongside the technical ones. Slide A4 and presenter notes. Owner: slides/lead. Effort: copy only.**

“Answers are in the notes” is an instruction to the presenter occupying half a judge-facing slide. The eight listed questions over-index on implementation defenses such as donations and sponsor drain. Those matter, but the pitch has not answered buyer, adoption, capital or differentiation. The existing 512-word technical appendix is useful reference material; do not try to speak it as a single answer.

**Exact change:** title **“What is built. What the pilot must prove.”** Replace the large second title with a small line **“Mexico first · reusable core · local integrations.”** Use four paired prompts on the slide: **“Who adopts it? / Why six modules?”**, **“What travels? / What changes locally?”**, **“Who supplies capital? / Who bears losses?”**, **“What works today? / What needs a partner?”** Keep the detailed eight technical answers in notes, indexed below four short opening answers:

- **Buyer:** “Our proposed first adopter is a local fintech or corridor operator. This deck demonstrates the product; it does not establish customer demand.”
- **Differentiation:** “The claim is reusable issuance, exchange and consumer flows sharing settlement. We need a pilot to prove that integration costs less than assembling separate providers.”
- **Capital and revenue:** “Vault collateral, exchange reserves and lender funds are separate. Pilot partners must establish funding and sustainable fees; subsidized testnet yield is not revenue.”
- **Readiness:** “On-chain product flows run today. Fiat payout, real income access, production assets and operating arrangements still require partners.”

For the technical follow-up retain: no guaranteed peg or bank cash-out; admin-set prices; mock-funded vault accrual; manual credit repayment/default exposure; MPP settlement versus simulated fulfillment; process-local sponsor limits; source verification versus audit. Identify 141 passing contract tests as the **last recorded suite**, not a fresh result from this review. **Judge's question:** “Why would a real operator choose this over a stablecoin wallet plus existing providers?” Answer that as a pilot hypothesis, not invented traction or unit economics.

Evidence: [A4](deck-v8-evidence/renders/13-judge-qa.png), `judge-qa.html`; [full notes](deck-v8-evidence/slides-extracted.json). This changes preparation, not the number of main slides.

**Three-minute delivery and disposition**

The notes are short enough; the scarce resource is visual attention. A workable allocation is **cover 14s → ecosystem 20s → Mint 17s → Remesas 18s → Global 19s → Crédito 21s → Card 28s (including the 16.64s recording excerpt) → Invest 18s → close 25s = 180s**. Time the actual run after copy changes. Keep the final ask on screen; do not automatically continue into the appendix. Keep revised main notes within the existing 230-word total and 35-word per-slide limits.

Items **1–3 were posted individually to @lead @slides**. At 14:56, lead approved **all eight** for one batch, with these additional face-copy decisions: Remesas **“Send dollars. The family receives pesos in their wallet.”** (Choose recipient → See the quote → Send); Global **“Pay suppliers in pesos, with a guaranteed minimum.”** (Enter supplier → Check the minimum → Pay); Card **“Approve each purchase on your phone.”** (Shop requests → You approve the amount → Paid, with receipt). OUSD/xMXN precision stays in the notes. For Global the exact supporting note should be **“The transaction either delivers at least the minimum xMXN amount or reverts.”** That is the implemented guarantee; it is not guaranteed execution, bank payout or a peg. Lead also kept “unaudited” in A2 notes rather than on its face. [Approval record](deck-v8-evidence/irc-delivery.txt).

Approval is not implementation or a visual recheck; this report records the reviewed v8 baseline. No app or deck source was edited by review. All report, evidence and harness writes are under `review/`.
