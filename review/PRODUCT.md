# Mercado product review

Updated2026-10-14 through03:05 UTC for SPEC v0.2, DESIGN-ECOSYSTEM and josu's wire-everything rule. This section supersedes the archived v1 narrative below. Implementation belongs to the crew owners; lead commits reviewer files.

**A parallel financial system for emerging markets, built on Tempo.** One synthetic local currency connects four jobs: institutions **Create** money against collateral, senders **Move** it across an on-chain corridor, gig workers access **Lend**, and people or agents **Spend** through MPP.

## Current ecosystem presentation (supersedes module-only navigation)

**Six products, one currency:** Mercado Mint for institutional issuance; Mercado Remesas for family remittances and Tiempo Aire/services; Mercado Global for businesses and partner API access; Mercado Crédito for drivers, lenders and paid underwriting; Mercado Card for spending existing xMXN at authorized demo merchants; Mercado Invest for lending-pool savings, demo-funded sOUSD and finite-inventory demo tTBILL trades. The old Create/Move/Lend/Spend verbs explain operations within these products; they are no longer the site's product names. Home must communicate this map in ten seconds. `crew/DESIGN-ECOSYSTEM.md` replaces the console-menu visual brief.

`crew/PRINCIPLES.md` now overrides prior visual briefs: white/ink, Archivo Black or Anton plus Inter Tight, cultural accents, one image-in-type hero and a keyboard-accessible numbered six-product index rather than tiles. KPIs are unboxed; precise compact TESTNET / SIN VALOR REAL labels remain visible. Small text must retain sufficient contrast; the accent palette is not automatically suitable for meta copy. Remesas, the Crédito driver app and Card use generic Android framing on desktop and full-screen mobile. Demo mode maps product roles explicitly; external-wallet navigation and pending actions must preserve the initiating account.

**Wire everything:** balances, fees, quotes, coverage, KPIs, charts, activity and receipts must come from actual chain/API state. Only unavoidable external integrations remain mocked: income/OAuth, airtime/service fulfillment, and demo collateral yield/price sources. The real FX relay now rejects abnormal jumps/stale dated sources and distinguishes unknown source time from fetch/block time. Card PAN/network and Uber/DiDi/Rappi connections are additional explicit simulations. See `review/MOCK-AUDIT.md` and `MOCKS.md`.

The top three product priorities are now: (1) one coherent six-product Home/tour with traceable balances and no dead ends; (2) a complete spending proof—family transfer or driver advance → holder-authorized Card charge/MPP payment → exact receipt, with interrupted-flow recovery; (3) visible risk proof—current FX provenance, reserve coverage/haircut/bucket and an executed v2 stress recovery. Global's paid signed indicative quote connects this to MPP beyond consumer billpay. Finish these journeys before expanding simulated features.

Money-flow diagrams must distinguish credit repayment (returns tokens to lenders) from CDP repayment and AMM redemption (burns tokens). Payment for a quote purchases an API response, not the supplier transfer. Detailed UX acceptance lives in `review/ECOSYSTEM-REVIEW.md`.

## Current evidence boundary

**V2 is live in the default app on Moderato** following lead's02:37 flip and QA's02:41 post-flip HTTP/MPP checks. Independent review verifies the shared gate, core contract runtimes/accounting, API binding, sponsor policy and rebuilt screen rendering. Original v1 journeys remain historical evidence for that version.

Card's calendar-day replacement passes25 local tests and deployed runtime/digest/receipt checks. InvestDesk's replacement passes17 tests, deployed inventory/token/feed bindings and rejection of unbought sales. Its buyback rights stay with the purchasing address; owning transferred/faucet tTBILL alone does not grant desk redemption. Those rights do not follow seized Mint collateral. UI now caps personal withdrawability and withholds dollar/tTBILL return attribution when holdings are not explained by the wallet's deposit/trade quantities (R-044/R-045 source fixes).

The new simulated card on-ramp has **not passed acceptance**: R-046/R-047 identify duplicate-delivery/idempotency and budget defects. Remesas send-recovery persistence is being rechecked. Test assets/yield/fulfillment are still explicitly simulated; live transaction plumbing is not production financial readiness.

## People and their jobs (v0.2)

| Person | Job | What must be visible |
|---|---|---|
| Institutional treasury / sophisticated minter | Put collateral to work issuing xMXN while native collateral yield accrues | Collateral type, demo-token status, funded share-value growth, valuation source/age, LTV, liquidation threshold, debt ceiling, debt and withdrawal limits |
| US sender and recipient in Mexico | Exchange test USD for a predictable xMXN delivery; optionally reverse the corridor | Input, executable output, oracle mid, spread/size impact, min received, reserve capacity, recipient and exact receipt; no bank payout or cashout |
| Gig driver | Bridge an illustrative short-term cash need and buy a service | Demo Uber Data, offered line versus drawable amount, fee and total debt, manual repayment, SIMULATED fulfillment separate from settlement |
| Lender | Supply loan liquidity and understand what remains withdrawable | Cash, outstanding loans, own claim, realized fees and loss/default risk; collateral yield is not lender APY |
| Partner / agent | Buy a useful API response without negotiating an API key | Unpaid 402, xMXN settlement, authenticated receipt and delivered response; quote expiry and source version |

The minter is not the retail driver. A sender need not open a personal CDP. xMXN held by the recipient is not a Mexican bank balance. Lender capital, CDP collateral and the protocol exchange reserve have distinct obligations even if v2 shares a contract address.

## A 2–3 minute system walkthrough

| Time | Beat | Proof and narration |
|---|---|---|
| 0:00–0:15 | Home | One currency, six products; current testnet/no-value meta and named demo roles. |
| 0:15–0:40 | Mint | Institution locks collateral and creates xMXN; show receipt, debt and assumed/demo valuation source. |
| 0:40–1:00 | Remesas | Sender converts OUSD into xMXN delivered to family; actual amount, memo and receipt, no bank cashout. |
| 1:00–1:20 | Global | Paid402 buys an indicative quote; the supplier transfer is a separate transaction. |
| 1:20–1:45 | Crédito | Simulated earnings → signed eligibility → lender-funded draw, live fee and total debt. |
| 1:45–2:10 | Card | Same driver authorizes exact shop/amount; frozen decline is recoverable, successful charge has a receipt. |
| 2:10–2:30 | Invest | Real pool/staking/trade operations; variable fees, admin-funded demo yield and limited tTBILL buyback rights. |
| 2:30–2:45 | Proof | Current FX/coverage and verified contracts, clear admin powers and exact transaction links. |

The existing Tour implements these destinations, but R-049 must be fixed before calling its balances and history per-step proof. The live event mapping and explorer links independently reconcile; the current windows overlap and the summary hides rows after five. Keep role changes visible and make the spending proof the centerpiece; six screens alone do not demonstrate one connected system.

## Three highest-impact remaining improvements (v0.2)

1. **A version-aware System view with traceable numbers.** Each module links to its actual contract/receipt and labels live v1, verified v2, or planned. Show CDP collateral, reserve assets/liability and lender cash separately; do not sum them into an unsupported total backing number. This connects the broader pitch to existing proof with little new surface area.
2. **One compact v2 solvency demonstration.** After deployment, show a funded reserve at a named FX rate, peso appreciation, a denied unsafe redemption and the documented recapitalization/recovery path. Include a funded demo sOUSD accrual and unchanged direct-donation valuation. This makes the difficult engineering inspectable; animations alone are not acceptance.
3. **One partner quote-to-settlement trace.** Reuse the paid API machinery for a bot buying a Move quote, then clearly separate payment for the API from execution of the currency swap. Display source, expiry, min-out and actual delivery. Keep the existing underwriter trace as the proven fallback; no claims of competitive remittance costs without sourced comparison.

## Judge Q&A — eight hard questions (02:35 UTC, six products / Brand v4)

1. **Why does this need Tempo and MPP instead of a database and Stripe?**
   Tempo gives the six products a shared token ledger, transfers with public memos and fee sponsorship. MPP lets an HTTP client pay for a bill or API response and receive verified settlement evidence. We demonstrate those integrations on testnet; we have not proved superior cost, adoption or production economics.

2. **Is xMXN actually a peso, and where can I cash it out?**
   It is a synthetic MXN-denominated testnet token. Institutions create collateralized debt; the exchange creates reserve liabilities; drivers borrow existing tokens. There is no bank cashout, SPEI integration or guaranteed peso peg. OUSD has no real value and is valued at an assumed $1 for this demo.

3. **What is real, and what is still mocked?**
   Contract execution, event-derived balances, MPP settlement and the external FX fetch are real. Uber earnings/OAuth, Telcel/CFE fulfillment, sOUSD yield and tTBILL backing/price are explicitly demo inputs. V2 contracts and crew transaction journeys are deployed; the default-v2 switch is complete, while each new product/flow keeps its own acceptance gate. `MOCKS.md` records exceptions; a marker scan alone does not establish live wiring.

4. **Who controls the exchange rate, and can they liquidate users?**
   An admin relays Coinbase data into the oracle; this is not decentralized. Coinbase publishes no source timestamp, so we show that uncertainty alongside fetch and block time. The keeper rejects abnormal jumps and stale dated fallback data. The owner can override rates, widen FX safety settings and replace collateral feeds; those changes can make positions liquidatable. It can also list its own collateral and mint, or rotate the loan signer and lend out all idle cash. A real market observation does not remove that authority.

5. **If the peso appreciates or everyone exits, who takes the loss?**
   Reserve coverage can fall. V2 blocks issuance that would leave coverage below100%, prices redemption at the lower of oracle value and reserve NAV, and applies fees, size impact and a25%-of-reserve leaky bucket. Holders can face a haircut or wait; outside capital can recapitalize the reserve. The bucket permits a burst plus continuous refill, not a strict25% ceiling in every rolling day.

6. **Where does yield come from, and whose assets fund loans or redemptions?**
   sOUSD accrual comes from an owner-funded demo reserve, not real investment income. Reviewed accounting ignores direct donations and does not credit unfunded past yield. CDP collateral, exchange OUSD reserves and lender xMXN are separately accounted. Credit-pool repayment returns lender funds; it does not burn xMXN. Lending carries default risk and no guaranteed APY.

7. **Can a merchant charge me without approval, or a retry charge twice?**
   Card local and deployed checks verify that each holder tap binds the merchant, amount, card, nonce, expiry, chain and deployed contract. Allowance alone must not authorize a charge, and refunds must not revive used signatures. The bounded tests cover replay, merchant substitution and capped refunds; they are not a comprehensive security audit. Existing MPP bill settlement uses a stable order key, verified payment and unpaid recovery; a transfer to the merchant alone is only an inflow, not proof of MPP attribution.

8. **Can this lend to real drivers and pay real bills tomorrow?**
   No. The score is illustrative, income is synthetic, loans are unsecured and repaid manually, and fulfillment is SIMULATED. Production needs real integrations, independently reviewed contracts and operations, durable payment recovery, credible liquidity/oracle controls and appropriate arrangements for customers and assets. The demo proves a connected transaction path, not repayment quality or production readiness.

Evidence: `review/FINDINGS.md`, `review/V2-REVIEW.md`, `review/MOCK-AUDIT.md`, `ACCEPTANCE.md` and timestamped `scripts/evidence/` distinguish independent review from crew-recorded runs. Card calendar25/25 and Invest17/17 local checks plus both replacement deployed runtimes pass. Invest UI attribution fixes pass at source scope; the new on-ramp still has a lock-reclaim blocker. Remesas unpaid payment recovery and ordinary failed-send persistence pass; unknown broadcast settlement still needs reconciliation before retry. See INVEST-REVIEW.md and FINDINGS.md. Sponsor policy checks pass, with unsigned quota grief and in-memory-budget residuals documented in R-016.

---

## Archived v1 product decisions (historical; superseded where v0.2 conflicts)

The following preserves earlier decisions and evidence limits for handoff. References to a driver-first pitch, the separately capitalized exchange as the primary future path, and the old eight-question appendix describe v1. They are not the current v0.2 product brief.

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

## Historical story gaps (snapshot at 00:39–00:56)

Independent live review now verifies the new core/desk/pool deployment, all 38 manifest receipts, the stress liquidation and oracle/desk restoration, plus a real unpaid MPP 402 and an API attestation accepted by the pool in simulation. Current contract source has 67 passing local tests. QA has broadcast the swap/send, borrow/repay and payment journeys; receipt-by-receipt reviewer checks are being preserved separately. At the last browser check the home page was still the Next scaffold and all five dashboard tabs returned 404, so backend receipts do not establish a usable wallet demo. Payment restart recovery and multi-step wallet switching retain explicit evidence limits.

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

These narrative/copy changes were accepted and incorporated. At 00:56 the user added a stronger visual constraint: less text, preferably screenshots, video and animations. The current deck uses short captions and schematic animations while the real app screens are being built. Keep animated/example states identifiable; replace them with actual screen captures once the browser journey works, and retain the payment/fulfillment distinction in both.

## Product round 2 (01:12 UTC; approved by lead at 01:13)

The on-chain and machine-to-machine MPP paths now have crew-recorded live evidence. The remaining lift is to let judges experience and inspect them quickly. No new financial product is needed.

| Rank | Concrete change | Why it helps Tempo/MPP judges | Effort / acceptance |
|---|---|---|---|
| 1 | Finish and record a single driver flow: connect prepared Driver → draw → 402 → receipt beside remaining debt, with the fee sponsor shown from the actual transaction. | Makes Tempo usability and MPP settlement observable in one 60–90-second sequence. A green backend alone cannot deliver this. | Small–medium, uses current screens. Browser flow must complete; show actual sponsor evidence and funding provenance. Never say any fresh passkey can spend before it has xMXN. |
| 2 | Make the paid-underwriter agent reproducible from the app/deck: a compact recorded 402 → 2 xMXN → report/receipt trace, transaction link, and exact runnable script command. | Shows a machine buying a useful API without an API key; this is a distinct MPP-native use already implemented. | Small. Link QA's existing transcript/script, label playback and Demo Uber Data, keep borrower attestation out of third-party output. Do not build a second agent UI or invent a second live run. |
| 3 | Finish Send with a receipt card: recipient, exact xMXN delivered, OUSD spent and spread, public memo `para mamá`, and explorer link. | Makes the local-currency and Tempo memo story tangible; an inspectable artifact is more memorable than another architecture slide. | Small once Send works. Use actual Swapped/TransferWithMemo data, validate memo before swap, state onchain testnet delivery only/no cashout. |

The already-approved stress preview and three separate fund balances remain useful supporting views. Keep the new deck direction airy and visual; use real screenshots and short labels. Preserve visible testnet, Demo Uber Data, mock-feed and SIMULATED fulfillment labels even when turning them into refined pills. The three requests above use existing behavior and evidence, rather than adding another contract or production-sounding integration.

Lead accepted all three: API owns driver/402 flow and the recorded paid-report panel; contracts owns sponsorship; QA records the 60–90-second browser video; web owns the Send receipt. Zero-fee-token assertions need the actual driver balance and fee-payer receipt, beyond a prepared sponsored approval transaction.

## Visual direction update (01:25 UTC)

The earlier airy/Stripe suggestion is superseded by the user's accepted directions. The app moves to the original console-menu language in `crew/DESIGN-SWITCH.md`; the deck uses dark, near-sans editorial layouts with original procedural glitch artwork. The three approved product priorities are unchanged. Capture new screenshots only after the app redesign; keep existing evidence labeled as the prior UI. Reviewer will check persistent disclosures and keyboard behavior after the shared shell lands.

## Archived judge Q&A (v1, 01:32 UTC; superseded above)

1. **Why does this need Tempo and MPP, instead of a token transfer and an API key?**
   Tempo gives this demo native TIP-20 transfers, public payment memos, USD-token fees and sponsorship. MPP makes the HTTP request itself payable: an unpaid call returns 402, then a verified xMXN payment unlocks the response. We demonstrate a bill endpoint and a separate bot buying an underwriting report without an API key. We have not proved better economics than existing payment rails.

2. **Is xMXN a real peso stablecoin, and is your OUSD issuer-backed?**
   No. This is Moderato testnet. Our collateral is faucet OUSD with no real value or issuer backing; xMXN is a synthetic, peso-denominated debt token. Minting requires at least 150% collateralization, but neither the token nor its oracle guarantees a market peg, fiat redemption or cash-out.

3. **What happens when the peso strengthens or the oracle is wrong?**
   Fewer pesos per dollar means less collateral value against peso debt. Below 135%, the vault permits liquidation, with a capped collateral bonus; insufficient collateral can limit what a liquidator receives. The live feed is an admin mock with staleness and sanity guards. Real price discovery, reliable feeds, liquidation participation and stressed liquidity remain production work.

4. **Are you lending the collateral backing xMXN to fund the demo?**
   No. The vault holds collateral for minting debt. The swap desk has separately seeded inventory, and lenders separately supply xMXN to the advance pool. Their balances and contract addresses are visible. Pool loans are unsecured; lenders cannot withdraw cash that is currently lent out, and fees become realized when borrowers repay.

5. **What stops someone inventing Uber income or taking many unsecured loans?**
   This prototype does not solve identity or credit fraud. Every income series is labeled Demo Uber Data, and the heuristic is illustrative. A trusted backend signs a borrower/chain/pool/limit/expiry/nonce-bound attestation; the contract enforces those bounds and exposure caps. Those checks prevent signature misuse, not fake income or one person controlling many wallets. Repayment is manual, and lenders bear credit risk.

6. **If the client or server crashes after paying, can you charge or fulfill twice?**
   The server binds the quote and challenge to one order, records issued challenges, serializes settlement per order, and reconciles interrupted attempts before retrying. Real pull-mode crash tests recovered one settlement and one fulfillment across retries. Browser recovery now checks the same saved order without auto-paying. That is bounded single-process evidence, not a universal exactly-once payment claim: duplicate push transfers can still need reconciliation/refund handling, and the actual airtime fulfillment is always SIMULATED.

7. **Can anybody drain your fee sponsor? Is “gasless” unconditional?**
   Sponsorship is conditional: only Moderato, approved functions/targets and eligible senders, with gas/fee caps and quotas. The current maximum is 0.01 USD in test-token fee units per sponsored transaction, with 30 transactions per sender/hour and 500 globally/hour in one process. Budgets reset on restart. Unsigned fills can still consume another eligible sender's quota, so this is a bounded demo sponsor, not a production anti-abuse system. Users still need xMXN to spend; fee sponsorship does not fund purchases.

8. **What is the strongest proof today, and what must change before real users or real money?**
   Deployed contracts, recorded transfer/borrow/repay/liquidation receipts, real 402 settlement and paid API calls, source verification, contract tests and browser journeys are the proof. The real-world links are missing: approved income access and underwriting, default/collections design, robust oracle/liquidity, production payment recovery and sponsor controls, and commercial/legal arrangements for actual fulfillment or fiat rails. We demonstrate testnet coordination and settlement, not a production credit product or paid utility bill.

Evidence pointers: `review/FINDINGS.md` separates independent checks from owner-run evidence; `ACCEPTANCE.md` and `scripts/evidence/` hold the crew's test/run records. Preserve those distinctions when answering follow-ups. The newest console restyle is a UI change and needs fresh browser acceptance.

## Current review delta (02:56)

Phone direction is now Spanish-only, dark-first per crew/mobile.md; detailed explanations can move out of the phone but essential Testnet/Demo/Simulado disclosures must stay visible on mobile. Source verification is not a security audit. Card calendar and latest gated-token InvestDesk deployments pass bounded independent checks. On-ramp stays disabled pending durable-store/multi-writer fixes, and sponsor first-draw eligibility needs attestation validation before claiming invented senders are refused.
