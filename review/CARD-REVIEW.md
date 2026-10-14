# Mercado Card adversarial review

Started 2026-10-14 02:29 UTC. Current assignment: DESIGN-ECOSYSTEM §6 and lead's02:27 message. Five products: Mint, Remesas, Global, Crédito, Card. Reviewer writes only review/, commits nothing and broadcasts no transactions.

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
