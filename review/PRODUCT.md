# Mercado product review

Updated 2026-10-14 through 00:55 UTC. Lead approved ideas 1–3 at 00:39 and refined the actual-position stress preview at 00:45. Implementation belongs to the assigned crew owners. Mercado's local server is http://localhost:3100.

Mercado's strongest demonstration is a driver receiving a small, explainable xMXN advance from a separately funded lender pool, spending it through an actual HTTP 402 payment, and repaying it manually. Show the settled payment and remaining debt together. Keep the simulated airtime outcome visibly distinct from the token settlement.

## People and their jobs

| Person | What they need to accomplish | Evidence they should see |
|---|---|---|
| LP / minter | Lock USD test collateral and create xMXN without losing sight of FX risk | Collateral, debt, ratio, available mint amount, separate 150% mint and 135% liquidation thresholds |
| US remittance sender | Send an understandable peso-denominated amount to family in Mexico | OUSD input, actual xMXN delivered, spread, recipient, explorer receipt; onchain delivery only |
| Gig driver | Understand why an illustrative advance was offered, spend part, and repay | Demo Uber Data, weekly series, cap explanation, 2% fee, total debt, settled payment, manual repayment |
| Lender | See where supplied xMXN went and how much can be withdrawn now | Available cash, loans out, own claim, realized fees only after repayment, credit risk |

The sender's family receives testnet tokens in a wallet. This demo does not deliver cash, bank pesos, a real top-up, or automatic repayment from an Uber payout.

## A 2–3 minute walkthrough

| Time | Action and narration | Proof on screen |
|---|---|---|
| 0:00–0:20 | Show Moderato and the testnet OUSD label. Explain that vault collateral, desk inventory and pool liquidity are separate. | Three balance cards with sources and contract links |
| 0:20–0:45 | LP deposits collateral and mints xMXN. Briefly preview peso appreciation. | Receipt, ratio, mock FX source, preview-only stress result |
| 0:45–1:00 | Sender swaps a small OUSD amount and sends xMXN to the recipient wallet. | Recipient balance delta and onchain-delivery receipt |
| 1:00–1:25 | Show independent lender funding, then the driver's Demo Uber Data and the reason for the offered limit. Draw the advance. | Pool cash decreases, driver balance and debt increase; signature expires |
| 1:25–2:00 | Buy 100 MXN of simulated Telcel airtime. Show the unpaid 402, wallet payment and verified receipt. | Real testnet settlement in xMXN, order/reference, SIMULATED fulfillment, remaining loan debt |
| 2:00–2:30 | Manually repay from prepared test funds. Disclose any demo top-up as a stand-in for earnings. | Debt cleared; lender realized fee and available cash updated |

The aha moment is one local-currency balance connecting funding, borrowing and an HTTP-paid service, with the financial state and receipt observable at each step. Avoid forcing a judge to infer this connection from six disconnected tabs.

Prepare accounts, allowances and sufficient fee-token balances before recording. Name the active role during account switches. If a transaction is pending or a service is unavailable, show that state honestly. A prepared fixture can introduce the story; completion claims must come from the actual receipt.

## Ranked ideas

| Rank | Idea | Demo impact | Effort | Decision / owner |
|---|---|---|---|---|
| 1 | Guided flow: lender funds → driver draws → 402 payment; payment receipt and debt side by side | Very high: makes the MPP use and inclusion story immediately visible | Small–medium | Approved; web, qa |
| 2 | Preview-only peso-appreciation slider beside mint health | High: explains a synthetic peso's central risk in seconds | Small | Approved; web; real stress remains contracts admin script |
| 3 | Three separate fund balances on Home/Earn with plain source notes | High: demonstrates that locked collateral is not being spent on loans or swaps | Small–medium | Approved; web, contracts views |
| 4 | Shareable remittance receipt: amount delivered, recipient, network, tx link, onchain-only label | Medium–high: makes the sender/family use tangible | Small if reusing receipt component | Proposed; defer until core flow passes |
| 5 | Clear lender story: cash available, principal lent, own claim, realized fees and no guaranteed APY | Medium–high: gives the funding side a reason to exist | Small once views exist | Extend idea 3 after core integration |
| 6 | Optional paid score endpoint for third-party demo underwriting | Medium: a second native MPP API use | Medium–large: another paid path and idempotency boundary | Defer until bill flow is proven |

Current approved stress preview: keep the live demo LP at least 250% collateralized; 1,000 OUSD and 8,000 xMXN debt at 20 MXN/USD gives 250%. The slider uses the viewer's actual position across 8–25 and marks its calculated liquidation boundary: 10.8 MXN/USD in this example (135% exactly, liquidation below it). A move from 20 to 10.8 is a 46% decline in USD/MXN; expressed as peso appreciation it is about 85%. Avoid calling it 46% peso appreciation. This is a mock scenario, not a forecast or current quotation. Preview never writes the shared oracle. Real liquidation proof belongs to a separate stress position; restoration and desk pause/unpause need transaction evidence.

## What to make legible to judges

- **Tempo:** actual TIP-20 issuance, actual Moderato transactions, visible fee-token/network handling, and usable receipts.
- **MPP:** an unpaid request gets HTTP 402; payment is verified for this exact order and amount; retry returns one order without another debit. Payment and fulfillment have different states.
- **Product usefulness:** a specific driver need, an understandable small advance, and a payment that uses the borrowed balance. Keep the lender and sender stories brief enough to support that sequence.
- **Risk and honesty:** synthetic testnet xMXN; faucet OUSD with no real value; Demo Uber Data; admin mock oracle; SIMULATED top-up; manual repayment; realized fees rather than projected APY.

These are suggested judging priorities inferred from the build's Tempo/MPP scope, not a claimed official judging rubric.

## Current story gaps

Independent live review now verifies the provisional core deployment and all nine deployment/smoke receipts, including deposit/mint/burn/withdraw accounting. Current contract source has 67 passing local tests. The shared manifest still has no desk/pool, the app currently returns 500 from an mppx bundling error, and payment recovery has open findings. The full story remains a target; these core receipts do not establish swap, credit, MPP, wallet or stress completion.

Lead changed collateral at 00:39 to **Testnet OUSD (Tempo faucet, no real value)** with deployment key `ousd`. Replace remaining descriptions of an independently deployed dOUSD token consistently, including the spec, diagrams, README, API deployment readers, UI and scripts. Never infer issuer backing or redemption from the faucet token's OpenUSD name.

For Home, prioritize wallet OUSD/xMXN, collateral ratio with mock feed age, loan debt including fees, available lender cash, and latest verified receipt. Avoid an unqualified total-value figure, market peg, generic APY, or a bill-paid badge.

A driver who spends an advance cannot repay principal plus fee from the remaining advance alone. The tour must show a separate source for the repayment funds and label any prepared top-up. The fixture is neither a real Uber payout nor automatic collection.

## Full-deck critique (posted to slides and lead)

The 12-slide draft has the right separation of actual settlement and simulated fulfillment. Its proof slide correctly marks the pending contracts and provisional addresses. Preserve that precision across the journey and honesty slides: “implemented on-chain” and “verified in this deployment” are different claims. Current live failures belong in the evidence status until corrected.

Lead with one driver who needs 100 MXN of airtime before payday. The lender funds the pool, the driver draws, the endpoint demands 402, and the receipt appears next to remaining debt. That sequence gives MPP a clear job. Minting and the sender/family example should support it without requiring four equally long persona tours.

The speaker notes total about 210 seconds before wallet waits. For a 2–3 minute demo, target about 120 seconds of speech; move the detailed architecture, mint formula and six-part roadmap to appendix or shorten them. Keep a few seconds to show the unpaid response and confirmed receipt.

Concrete corrections requested:

- Replace “retries never charge twice” with the narrower settled-order behavior; interrupted payments and push-mode credential loss still need proof (R-009/R-011).
- Label the score table “Credit line.” Actual drawable amount is `availableToBorrow`, constrained by existing borrower principal, per-user cap, pool utilization and cash. A 1,500 line is not always a 1,500 draw.
- Change the formula speaker note from “up to 150% collateralization” to “at least 150%.” Keep the 250% demo position and actual-position stress preview.
- Remove unsourced market-stat placeholders before presenting. A concrete driver scenario can carry the problem slide without invented remittance fees or exclusion statistics.
- Keep the existing labels: testnet faucet OUSD/no real value/not issuer-backed/not redeemable; Demo Uber Data; mock oracle; SIMULATED top-up; manual repayment from separately disclosed funds.
