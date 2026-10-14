# Mercado Card adversarial review

Started 2026-10-14 02:29 UTC. Current assignment: DESIGN-ECOSYSTEM §6 and lead's02:27 message. Six products now: Mint, Remesas, Global, Crédito, Card, Invest. Reviewer writes only review/, commits nothing and broadcasts no transactions.

## Authorization contract for acceptance

The design calls a per-charge signature optional; lead's direct implementation assignment requires a holder EIP-712 tap signature. Review uses that stronger requirement, communicated to lead/contracts. Token approval plus merchant allowlisting alone must not authorize an arbitrary charge.

| Boundary | Adversarial check | Required behavior |
|---|---|---|
| Holder intent | Approved merchant charges with no signature, wrong signer, changed amount/card/merchant/reference | Reject before moving tokens or consuming spend/nonce |
| Domain | Same signature on another Card deployment or chain | Reject via chainId and verifyingContract; fixed declared name/version |
| Replay | Reuse tap on same/different terminal, charge ID, card, day, or after refund | A used authorization cannot charge again; consume nonce atomically |
| Expiry/revocation | Expired tap; freeze after signing; lower limit after signing; unfreeze with unused old tap | Expired/frozen/over-current-limit rejects. Explicitly document whether unfreeze revives an unexpired tap; support nonce invalidation if product promises cancellation |
| Merchant authority | Nonallowlisted caller; merchant A submits tap for B; deauthorize a terminal before submission | Bind caller/recipient to signed merchant and current permission; owner allowlist scope visible |
| Card ownership | Another wallet freezes, alters limit, or issues over an existing holder/card | No cross-holder state mutation; issuance/card ID rules cannot reset existing spend accidentally |
| Amounts/limits | Zero, exact limit, limit+1, multiple charges totaling limit, low balance/allowance | Six-decimal units; cumulative spend bounded; transfer revert rolls back nonce/counters; no false CardCharged event |
| Daily window | Last second/first second boundary; change limit; freeze/reissue | Document UTC bucket versus rolling24h. A fixed-day reset must not be marketed as a rolling limit |
| Refunds | Wrong merchant, nonexistent charge, repeat/partial refund overflow, refund after holder freeze or charge day | Only original merchant supplies refund funds; cumulative refunded <= charged; replay stays consumed; no holder debit; frozen inbound-refund policy explicit |
| Reentrancy/state order | Callback/malicious token fixture, failed token transfer | Nonreentrant or demonstrably safe order; full rollback; never record paid before actual movement |
| Accounting/events | Charges/refunds versus balances and daily usage | Charge ID + payer + merchant + token + actual amount; gross spend/refunds/net spend labeled separately; no invented card history |
| Sponsor/version | New Card target/selectors/spender on v2 only; admin functions and other deployments | Allow only intended user actions; retain cost/quota restrictions; missing deployment cannot silently use another token/version |

Tests will live under review/contracts/ with isolated Foundry output/cache under review/. Contract source, tests, deployment address and frontend typed-data schema are pending at this initial snapshot. No test or deployment acceptance is claimed yet.

## UX and honesty gate

- Card front and POS say **Demo virtual card: not Visa/Mastercard; Mercado demo merchants only**. PAN/network are simulated; xMXN approval, issuance, limits, freeze, charges and refunds must each have real receipts when claimed.
- Holder tap must display merchant, amount and xMXN before signing. A signature is authorization, not payment success; show paid only after a successful charge receipt. Receipt keeps original payer/merchant/amount after input/account changes.
- The holder signs; an authorized terminal submits. Demo orchestration must identify both roles, keep the initiating intent stable, and never request a merchant key from the holder. Demo off must preserve the external wallet.
- Refunds refer to an actual original charge. Explain pending/failure and retry safely; do not render a green refund receipt for a local animation.
- Before the v2 switch, Card must explicitly show its availability boundary; do not present a working v1 card if only the v2 deployment exists.
- Five Home product tiles and the tour need meaningful Card placement. Card is a merchant spending edge from existing xMXN, not another mint or a card-network cashout.

## Adjacent Crédito change

Uber, DiDi and Rappi connections are simulated consent with platform-specific demo earnings, no official logos/password request or affiliation. Include platform in query/cache keys, fetched report, scoring and attestation dataHash; clear any old offer/signature on platform/account changes. Until platform support lands, show unavailable rather than silently label Uber data as DiDi/Rappi. Back-office loan-book rows must derive from actual Borrowed/Repaid events and distinguish principal, fees, outstanding balance and illustrative underwriting data.

## Initial contract results (02:34–02:38)

23 tests pass:14 owner tests plus9 independent checks including256 partial-refund fuzz runs, cross-deployment/chain replay, merchant substitution, failed-token rollback, refund replay and limit reduction. No authorization bypass found in this bounded pass. Evidence card-review-tests2.log.

Initial deployed Card0x7Fb945ee8BC4A80A37F0c5d95BbEC26976a36A70 matches the reviewed runtime;6 deployment/stage receipts succeed, token is v2 xMXN, merchant is enabled, typed-data digest equals on-chain tapDigest, event charges reconcile with totalSpent atblock39494624 (`card-live-1791945295100.json`). Sponsor18 cases including Card pass. These checks cover the INITIAL leaky-bucket implementation only.

R-041:1000 dailyLimit permitted1500 spend within12h while spentToday showed1000. Lead chose actual CDMX calendar days (00:00 fixedUTC−6) and same-day refunds restore capacity; previous-day refunds do not. Source updated, calendar local/deployed recheck underway. Previously described no-refund-headroom policy is historical, superseded by this decision. Initial deployment proof does not automatically accept the replacement.

UI source: holder signs typed data; terminal uses explicit testnet demo merchant account, waits for successful receipt and extracts charge ID before completion; token refunds require merchant approval and success receipt. Card network/PAN simulation label is visible. Full UI behavior/receiver-account switching still needs its own acceptance. ECDSA verification supports matching EOA signatures; contract-wallet signature schemes are not established by these tests.

## Calendar replacement verification (02:42)

Lead's calendar-day change passes25 tests including9 reviewer additions; refund replay remains consumed and only same-day refunds restore capacity. New Card0x052081d43f9A1e3637c2bBFC3b571b49d0C1F8b6 matches reviewed runtime atblock39495229, uses v2 xMXN, active merchant, and correct EIP-712 digest;3 current manifest Card receipts succeed and event sum reconciles with gross spend (`card-live-1791945663477.json`). Card UI renders at390/1440 without runtime errors or overflow in the post-flip snapshot. Full payment clicks remain crew QA evidence.
