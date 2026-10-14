# Mercado — simple deck copy

Prepared for josu and lead's urgent03:40 brief. Apply the **Headline**, **Subline**, and optional **Number** fields verbatim. Everything else is production guidance or speaker notes, not slide text.

Use the fourteen-slide order below. Cut “Built on Tempo”; combine the current proof and verification material into the single proof slide. Keep technical detail in the appendix. No extra metric tiles, transaction links, technical footers, or standalone decimal counters in this main flow. The app retains its counters and disclosures; the close carries the one approved testnet sentence.

Each slide has one headline, a subline of at most twelve words, and at most one numeric callout. To keep that limit, the input amounts for the transfer examples and the second savings rate are spoken. Whole-peso outputs below come from the read-only quotes checked for this draft; they are examples, not promised future prices. Number fields marked “None” are omitted.

## 01 · Cover — `cover`

**Headline:** Put your money to work.

**Subline:** Send, borrow, save, and spend with Mercado.

**Number:** None.

**Speaker notes:** Mercado connects the everyday jobs people need their money to do. We will follow it from creation to a family, a business, a driver, and a purchase.

## 02 · System — `system`

**Headline:** Create. Send. Pay. Borrow. Spend. Save.

**Subline:** Move money between products without leaving Mercado.

**Number:** Six connected products.

**Speaker notes:** Mint creates pesos; Remesas and Global move them; Crédito lends them; Card spends them; Invest offers savings and an equity-index token. These products share a currency and settlement network, while collateral, exchange reserves, loan capital, and savings remain separate accounts.

## 03 · Problem — `problem`

**Headline:**

Earn your money.  
Pay to send it.  
Wait to use it.

**Subline:** Your money should be easier to use.

**Number:** None.

**Speaker notes:** A family needs money at home, a business needs to pay a supplier, and a driver needs cash before the next payout. Today those jobs often require separate services; Mercado brings the actions into one connected experience.

## 04 · Mint — `j1-mint`

**Headline:** Deposit collateral. Issue pesos.

**Subline:** Keep earning on assets that pay yield.

**Number:** None.

**Speaker notes:** Institutions keep eligible collateral in a vault and borrow newly issued pesos against it; yield-bearing collateral can keep accruing while deposited. This is secured debt, and a position can be liquidated if its backing falls too far.

## 05 · Remesas — `j2-send`

**Headline:** Send money home.

**Subline:** Your family receives pesos straight into their wallet.

**Number:** 9,149 pesos received.

**Speaker notes:** Sending five hundred dollars quotes about nine thousand one hundred forty-nine pesos after the exchange fee and size impact. This is wallet delivery, not bank cashout; the exact amount is quoted before sending.

## 06 · Global — `p-global`

**Headline:** Pay your supplier in pesos.

**Subline:** Send dollars. Deliver pesos straight to their wallet.

**Number:** 176,297 pesos delivered.

**Speaker notes:** Ten thousand dollars quotes about one hundred seventy-six thousand two hundred ninety-seven pesos in the current example. Buying a signed quote pays for an API response; moving the supplier's money is a separate action.

## 07 · Crédito — `j3-advance`

**Headline:** Get an advance on what you’ve earned.

**Subline:** Use your earnings history to request an advance.

**Number:** Up to 1,500 pesos.

**Speaker notes:** Drivers share earnings data, receive an offer, and draw from lender capital within their available limit. Our demonstrated earnings are simulated, the loan is unsecured, and repayment is manual with the fee shown before borrowing.

## 08 · Card — `p-card`

**Headline:** Tap to pay at the corner store.

**Subline:** Approve the amount. See the receipt.

**Number:** None.

**Speaker notes:** The same driver approves the shop and amount, and the payment moves pesos already in that wallet. A frozen card rejects the charge; this is a Mercado merchant payment flow, not an issued Visa or Mastercard.

## 09 · Invest — `p-invest`

**Headline:** Save in dollars, pesos, or stocks.

**Subline:** Choose where to put your money to work.

**Number:** Five percent a year in dollars.

**Speaker notes:** The dollar vault is configured at five percent a year and the peso vault at eight percent, paid only while their funded demo reserves last. The stocks option is Mercado's equity-index token with an owner-set price and no underlying equities; it does not earn either savings rate.

## 10 · Bills and paid requests — `j4-bills`

**Headline:** Request it. Pay for it. Get a receipt.

**Subline:** The same payment flow serves people and software.

**Number:** None.

**Speaker notes:** A bill or API request asks for payment, the client pays, and the response includes settlement evidence through MPP. The bill fulfillment is simulated; the payment settles, and an interrupted order can be checked with its original key.

## 11 · Why it compounds — `compounds`

**Headline:** Borrow it. Spend it. Receive it. Use it again.

**Subline:** Money received in one product can be used in another.

**Number:** None.

**Speaker notes:** A driver's advance becomes a shop's receipt, and a family's remittance becomes money it can spend or save. That is the connection we demonstrate, not a claim of customer adoption or a promise that every product's reserves fund the others.

## 12 · Risk — `risk`

**Headline:** Check the backing before you borrow.

**Subline:** A stronger peso leaves less room to borrow safely.

**Number:** None.

**Speaker notes:** Peso debt gets harder to cover when the peso strengthens against dollar-valued collateral, so the app shows the effect on backing and individual positions. Positions can be liquidated and exchange redemptions can be restricted or take a haircut; owner-controlled prices and settings remain part of the trust model.

## 13 · Proof — `proof` + current `verify`

**Headline:** Follow the money. Check the receipt.

**Subline:** Open the payment trail, contract code, and paid API responses.

**Number:** None.

**Speaker notes:** Open a demonstrated payment, follow its receipt, and inspect the contract and its admin powers. The paid API trace separately shows the request, payment challenge, and returned response; we are showing inspectable execution, not a production security certification.

## 14 · Close — `close`

**Headline:** Put Mercado to work.

**Subline:** Built and running end-to-end on Tempo testnet.

**Number:** None.

**Speaker notes:** Try the connected journey from creating pesos to spending and saving them. We are looking for partners to connect it to real earnings, merchant services, and local payment rails.

## Production checks — not visible copy

- **Fresh quote evidence:** `review/evidence/deck-copy-remesas-quote.json` gives500 OUSD →9,149.158361 xMXN; `deck-copy-global-quote.json` gives10,000 OUSD →176,297.243813 xMXN. Both use the then-current oracle price18.37165667; the latest whole-peso Global output is two pesos above the earlier176,295 brief because the feed moved. These are short-lived indicative quotes, not transaction receipts. Keep sender inputs in the talk track and the output as the single visible number.
- **Rates:** `review/evidence/deck-copy-invest-rates.json` returns USD500 basis points and MXN800 basis points, with stocks at100 dollars. This confirms the configured-rate copy, not an independent acceptance of the newly deployed peso vault or a guarantee of funded future returns. The latest one-number rule takes precedence over the earlier two-counter layout; keep the peso rate in the notes and show the actual app when asked.
- **Mint:** no scaled institutional amount is asserted. The previously suggested millions exceed the current deployment's collateral debt ceiling; the simple action explains the product without implying those limits were raised.
- **Card:** no separate amount callout competes with the recorded receipt. Use the latest Javier-to-Javier spending video and its matching paid still; the actual recorded amount remains the source of truth.
- **Visuals:** use the newly requested dark-theme element crops, at most two per slide. Pick one phone or one panel that demonstrates the headline; omit surrounding navigation, extra metric panels, and text captions that merely repeat the headline. Verify the chosen crop's numbers match the spoken example, or use a neutral product view instead of a conflicting receipt.
- **Proof:** omit pass counts, contract counts, and hashes from the main slide. Keep bounded test results, known limits, source links, and the accurate mock register available for questions. Do not call the contracts audited; they have implementation tests, source verification, and a bounded independent review.
- **Scope:** this file changes deck copy only. Default app disclosures, MOCKS.md, review gates, and the disabled on-ramp decision are unchanged. No deck files were edited or published by review.
