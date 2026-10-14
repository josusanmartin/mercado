# Mercado product review

Updated 2026-10-14, 01:46 UTC for **SPEC v0.2**. This section supersedes the archived v1 narrative below. Implementation belongs to the crew owners; lead commits reviewer files.

**A parallel financial system for emerging markets, built on Tempo.** One synthetic local currency connects four jobs: institutions **Create** money against collateral, senders **Move** it across an on-chain corridor, gig workers access **Lend**, and people or agents **Spend** through MPP.

## Current evidence boundary

The working default remains **v1 on Moderato**: OUSD CDPs, a separately funded SwapDesk, the unsecured advance pool, and actual xMXN settlement through MPP with simulated bill fulfillment. The console screens are live; the latest review verifies navigation, offer-to-draw navigation, quote invalidation, keyboard/dialog behavior and mobile disclosures without broadcasting transactions.

**V2 is being designed and built alongside v1.** Multi-collateral institutional minting, demo yield-bearing sOUSD, demo tTBILL, and integrated mint/burn vAMM must be labeled planned/in progress until deployed and independently checked. No demo token is a real staking product, Treasury claim, equity claim or source of real yield. A new pitch does not promote v1 receipts into v2 proof. Distinguish implementation, deployment, configured app target, and completed journey.

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
| 0:00–0:20 | System | Four modules around xMXN; persistent Moderato/no-value labels. Identify which version is live. |
| 0:20–0:50 | Create | Institution chooses collateral, sees debt capacity and FX health, then a real mint receipt. If v2 is not accepted, show the working v1 OUSD mint and label sOUSD/RWA as the next version. |
| 0:50–1:15 | Move | Sender exchanges and sends to the recipient. Actual delivered amount, memo and receipt. Call it mint/burn reserve execution only with v2 receipt evidence; v1 still exchanges seeded inventory. |
| 1:15–1:40 | Lend | Driver's illustrative income explains a line. Lender-funded draw changes balance and debt. |
| 1:40–2:10 | Spend | Unpaid request returns 402; payment settles; SIMULATED airtime receipt sits beside debt. Show the separate paid-agent trace briefly. |
| 2:10–2:30 | Risk and close | Peso appreciation reduces USD backing; show the preview and v2 reserve stop if proven. Repayment is manual from separately disclosed funds. |

The aha is the connection between creation, circulation, credit and programmable spending—not four independent finance demos. Keep role switches named and prepared. If v2 misses its acceptance gate, give the complete live v1 story and a clearly labeled v2 architecture; do not switch the default to meet the slide narrative.

## Three highest-impact remaining improvements (v0.2)

1. **A version-aware System view with traceable numbers.** Each module links to its actual contract/receipt and labels live v1, verified v2, or planned. Show CDP collateral, reserve assets/liability and lender cash separately; do not sum them into an unsupported total backing number. This connects the broader pitch to existing proof with little new surface area.
2. **One compact v2 solvency demonstration.** After deployment, show a funded reserve at a named FX rate, peso appreciation, a denied unsafe redemption and the documented recapitalization/recovery path. Include a funded demo sOUSD accrual and unchanged direct-donation valuation. This makes the difficult engineering inspectable; animations alone are not acceptance.
3. **One partner quote-to-settlement trace.** Reuse the paid API machinery for a bot buying a Move quote, then clearly separate payment for the API from execution of the currency swap. Display source, expiry, min-out and actual delivery. Keep the existing underwriter trace as the proven fallback; no claims of competitive remittance costs without sourced comparison.

## Judge Q&A (v0.2 — eight hard questions)

1. **What is actually live, and why Tempo and MPP?**
   V1 has testnet issuance, exchange inventory, unsecured lending, and xMXN HTTP payment settlement. Tempo supplies native token transfers/memos and fee sponsorship; MPP makes an HTTP response payable with a verified receipt. V2 adds the proposed collateral and mint/burn exchange design. We distinguish source, deployment and completed journeys; the broader design is not yet evidence of a working financial system.

2. **Who creates the money, and what makes xMXN a peso?**
   The intended minter is an institution or sophisticated collateral owner; the unit of debt is MXN, valued through an oracle. On Moderato, OUSD and every added collateral are test assets. There is no fiat redemption, guaranteed peg, real Treasury/equity backing or assurance of issuer-backed collateral. The retail driver borrows existing xMXN rather than opening the institutional mint position.

3. **Where does the yield come from, and can a donation fake it?**
   Production collateral would carry its own externally earned yield; the Mercado vault runs no strategy. Our proposed sOUSD is an ERC-4626 demo with admin-driven, funded accrual, not real investment income. The reviewer requires donation-resistant accounting and limits on collateral valuation before accepting v2. An increased displayed share price alone proves neither earned yield nor redeemable assets.

4. **If the peso appreciates, can everyone redeem the same USD reserve?**
   No automatic guarantee follows from virtual reserves or a spread. For example, 1,000 OUSD against 19,900 xMXN is undercollateralized when the mock rate falls from 20 to 18 MXN/USD. V2 must specify and enforce its reserve coverage and redemption stop/haircut policy; it must also explain recapitalization and who bears a deficit. Until those rules and stress tests pass, the vAMM remains in progress. A circuit breaker can stop an unsafe withdrawal; it cannot manufacture missing backing or assure immediate redemption.

5. **Are exchange redemptions or gig loans spending institutional collateral?**
   V1 uses three separate pools: CDP collateral, seeded exchange inventory and lender-supplied xMXN. V2 proposes separate accounting for CDP collateral and a protocol OUSD reserve, even inside the same vault. Swap minting creates reserve debt; CDP minting creates borrower debt. xMXN is fungible, so the design must bound redemptions by aggregate reserve liabilities without assuming a token remembers its origin. The advance pool remains separately funded and unsecured.

6. **What makes an RWA price, haircut or credit line trustworthy?**
   In this demo, admin-set prices and income fixtures are explicit trust assumptions. A haircut and debt ceiling cap exposure; they cannot make an invented price or fake income true. Real assets need enforceable redemption/custody and suitable price/liquidity controls; real lending needs approved income access, identity, underwriting and collections. Signed loan limits prevent replay and excess draws, not Sybil fraud or default.

7. **Does an MPP receipt mean a real bill was paid, and are retries free?**
   It proves verified testnet token settlement for the API order, while airtime fulfillment is always SIMULATED. Tested single-process pull recovery and same-order retries avoid a second settlement; the browser's settlement check does not pay. Those are bounded tests, not a universal exactly-once guarantee. A partner paying for a quote buys the API response, not the subsequent currency swap or a guaranteed FX fill after expiry.

8. **What stops sponsor drain, and what remains before real money?**
   The demo sponsor has target/function/spender restrictions, fee caps and process-local quotas. Unsigned requests can still consume an eligible sender's quota; restart/multiple processes weaken the budget. Sponsorship funds fees, not purchases. Beyond that bounded demo, v2 needs tested solvency and collateral valuation, reliable oracles/liquidity, real asset/fulfillment arrangements, robust recovery and legal/compliance review before handling actual customers or funds.

Evidence pointers: `review/FINDINGS.md` distinguishes independent checks from crew evidence; `ACCEPTANCE.md` and `scripts/evidence/` preserve runs. The v2 review will live in `review/V2-REVIEW.md` once the design arrives. Answers above are intentionally conditional where v2 is still a proposal.

---

## Archived v1 product decisions (historical; superseded where v0.2 conflicts)

The following preserves earlier decisions and evidence limits for handoff. References to a driver-first pitch, the separately capitalized exchange as the primary future path, and the old eight-question appendix describe v1. They are not the current v0.2 product brief.

