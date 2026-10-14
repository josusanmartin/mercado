# Mercado review findings

Last reviewed head: `ee8fddb` plus shared-tree WIP through03:05 UTC (six products, gated tTBILL/InvestDesk redeploy, sponsor first-draw change, on-ramp rewrite, mobile restyles). Evidence hashes and pinned blocks below take precedence over moving source.

Current status: SIX-PRODUCT ECOSYSTEM: Card and Invest bounded contract/runtime checks pass. Pass17 reviews admin disclosures, sponsor boundaries, Tour accounting and PRINCIPLES contrast. Read review/CARD-REVIEW.md first for the new assignment. Card calendar25 tests and replacement runtime pass; Invest17 tests and latest gated-token desk runtime pass. On-ramp stays OFF by lead03:16 decision; prior route cases pass, and a newer no-auto-reclaim revision is not independently accepted. Sponsor R-016 selector-only first-draw bypass is fixed by 23b344b and independently verified; unsigned quota grief remains. Invest UI R-044/R-045 source fixes pass. No full new on-ramp acceptance claimed. Read review/ECOSYSTEM-REVIEW.md and review/MOCK-AUDIT.md before legacy UI detail. V2 local solvency, deployed runtime/accounting and independent API switch checks pass. R-030 rebuilt UI/complete switch remains gated; R-030 full ecosystem gate and Remesas recovery/mobile carry-forwards remain open; R-032 helper/R-035 terms/R-036–R-038 relay/indexer fixes are verified at their documented boundaries. R-016 unsigned-sender sponsor quota grief and R-022 reset/writer race remain residual open. No reviewer chain transaction was broadcast.

First pass: 2026-10-14, approximately 00:38–00:42 UTC. Includes the uncommitted API/credit service, FX adapter, frontend ABI/format helpers, and OUSD migration visible during that window. This is a moving shared tree; line numbers below refer to the inspected version. Reviewer writes only `review/` and does not commit.

## Findings

### R-001 — P1 — api — Unknown liquidity still permits a signed advance offer

- Status: RESOLVED in `eacccb5`. Executed actual `assessDriver` with an injected RPC failure and configured pool/signer: illustrative eligible score retained, no attestation, zero signing calls, explicit withheld reason.
- Location: `apps/web/lib/server/credit/index.ts:23` (read failure), `:57` (undefined cap), `:111` (signature); `apps/web/lib/server/credit/score.ts:115`.
- Scenario: the pool is configured and the signer key exists, but `availableLiquidity()` fails because the RPC is unavailable or the pool address is wrong. The catch returns `undefined`; scoring skips the liquidity constraint and the service signs an attestation anyway. The steady fixture advertises 1,500 xMXN despite no successful funding check. Borrowing may then revert. This does not establish an on-chain cap bypass.
- Evidence: executed the actual pure scoring module through TypeScript transpilation. Steady fixture + unknown liquidity → eligible, 1,500 xMXN; zero liquidity → ineligible, zero; 75 xMXN liquidity → eligible, 70. The service source passes the read-failure value directly into this path.
- Fix: retain an illustrative score if useful, but withhold the executable attestation when required pool reads fail. Explicitly explain unavailable funding and test the RPC-failure path with a configured pool and signer.

### R-002 — P1 — qa — Double charging and wrong debt accounting can still produce PASS

- Status: RESOLVED in `e727d02`; verified assertions for exact debt delta and no second payment. Later `527618d` also uses the live fee parameter and rounds upward like CreditPool. Live journey has not run.
- Location: `scripts/demo-journey.ts:425` (retry balance check), `:338` (debt delta), `:473` (step initialized as pass). Line numbers precede the OUSD rename.
- Scenario: the same order/reference is returned after charging twice. J5 only prints a warning and records a note, so the step remains `pass` and the script exits successfully. J4 similarly only warns when debt growth differs from principal plus the stated fee.
- Evidence: source review of committed `274cfe6`; no live duplicate charge attempted.
- Fix: assert no second xMXN payment on retry and assert the exact documented debt delta. Preserve failures in `last-run.json`; do not let either path count as acceptance evidence.

### R-003 — P1 — qa — Negative contract checks accept transport failures as valid reverts

- Status: RESOLVED in `e727d02`, strengthened by `377a998` and `527618d` with expected custom errors. Checked installed viem `BaseError.walk` semantics and each changed call site. Live negative simulations have not run.
- Location: `scripts/demo-journey.ts:262` and `:345` (negative simulation catch blocks, before OUSD rename).
- Scenario: an RPC timeout during the over-mint or replay simulation is caught and reported as a successful rejection. The actual contract behavior is then untested, but the journey still says PASS.
- Evidence: each catch rejects only its own synthetic `did NOT revert` message and accepts every other error.
- Fix: require a decoded contract revert and the expected custom error/reason; propagate network, decode, and unrelated revert failures. If prerequisites are unavailable, record blocked/skipped evidence explicitly.

### R-004 — P1 — qa — Stress narration did not match the starting ratio

- Status: RESOLVED by `c3a162a`, then updated consistently in `d730d26` for lead's safer live LP.
- Location: `DEMO.md:26` and `:28` at discovery.
- Scenario: the original tour started at 300%, then claimed 20→13 MXN/USD crosses 135%; it actually ends at 195%.
- Fix verified: current tour starts at 250% and previews the actual position down to the 10.8 liquidation boundary; below 10.8 is liquidatable. Separate live stress uses its own position. Product notes follow this decision.

### R-005 — P0 — api — Concurrent payment requests can settle twice for one order

- Status: LOCAL FIX VERIFIED in WIP; notified `@api` and `@lead`. Await owner commit and real payment evidence. The live mode/restart limitations below remain explicit.
- Location: `apps/web/lib/server/bills/service.ts:152` and `:160` in `eacccb5`.
- Scenario: two requests obtain the same CREATED order before either charges. Distinct valid payment credentials both settle outside the store lock. Only the first receipt is recorded; the second response can carry its own Payment-Receipt header with the first transaction in its JSON.
- Evidence: `node review/pay-concurrency-check.mjs` uses the actual orchestration, store and mock provider with a delayed settlement stub. Initial evidence `review/evidence/pay-concurrency-1791938671744.json`: two settlements, one order, inconsistent receipts. Fixed evidence `review/evidence/pay-concurrency-1791938740965.json`: one settlement and matching receipts. Both preserve exact source hashes. No chain transfers were performed.
- Fix verified: a per-order mutex covers status re-read, charge, payment-state write and fulfillment. The second request observes the completed order before settlement.
- Boundary: this verifies the local single-process server-broadcast (pull) path. Installed mppx prefers client-broadcast push for JSON-RPC wallets; those clients can already have sent two transactions before the server sees either receipt. UI prevention, explicit reconciliation and no blanket duplicate-transfer guarantee are necessary. Crash/restart between payment and durable order state is not yet tested.

### R-006 — P1 — api — Cash balance is not remaining borrow capacity

- Status: RESOLVED in API `359b9a4` and deployed contracts `27be377`. API separates the credit line (`maxAmount`) from `availableToBorrow`, reads `borrowCapacity(borrower,maxAmount)`, and withholds attestation on an unreadable/zero capacity. Contract limit test passes. Live API capacity matches the pool view; its signature recovers to the pool signer and the full advertised draw succeeds in `eth_call` (`api-live-1791939449291.json`). No reviewer borrow was broadcast.
- Location: `apps/web/lib/server/credit/index.ts:16` and `:57`; `packages/contracts/src/CreditPool.sol:172`.
- Scenario: a fresh pool has 75 xMXN cash. The API rounds its offer down to 70, but the 80% utilization cap only permits 60. Existing borrower principal can also consume the attested max because maxAmount is total outstanding principal, not an extra draw allowance.
- Evidence: `test_cashIsNotBorrowCapacity` in `review/contracts/ReviewBoundaries.t.sol` passes by asserting the real pool rejects a valid 70 xMXN signed draw with `ExceedsUtilization(70e6,60e6)` against Tempo's local TIP-20 precompiles.
- Fix: determine current utilization and borrower headroom when sizing a draw; retain the underwriting maximum's outstanding-principal semantics. Prefer a contracts capacity view, or consistent reads of cash, total assets, outstanding principal, limits and borrower principal. Fail closed if required reads fail.

### R-007 — P2 — contracts — MAX withdrawal view can quote an amount that reverts

- Status: RESOLVED in deployed `27be377`. Two-stage ceil correction, exact regression and 256-case MAX-withdraw fuzz pass in the 67-test run. New vault runtime matches the tested artifact excluding immutable-reference slots (`live-1791939621099.json`). The original deployed vault remains historical and is not the current app target.
- Location: `packages/contracts/src/CollateralVault.sol:178` versus `:193` and `:199`.
- Scenario: collateral 10 OUSD, debt 14.000007 xMXN, FX 10.5. `maxWithdrawable` returns 7.999999 OUSD; withdrawing it leaves a floor-valued ratio of 14999 bps and reverts. The view rounds once while enforcement first floors FX value.
- Evidence: `test_maxWithdrawableFractionalFxReverts` in `review/contracts/ReviewBoundaries.t.sol` reproduces the exact quote and revert with real local TIP-20 semantics.
- Fix: first compute required xMXN collateral value with ceil(debt × 15000 / 10000), then ceil(value × 1e8 / price). This is a conservative quote correction, not an unsafe withdrawal bypass.

### R-008 — P1 — qa — New stress step can pass without stress or a confirmed restore

- Status: RESOLVED in `531630a`/`3da40f0`: missing prerequisites become SKIP/exit 2, paused-read failures propagate, and the event is bound to script-reported borrower/liquidator. QA's first integration run failed because marker output was missing/unmatched; that failure is preserved. QA's later J7 run is green. Reviewer independently decoded the earlier deployed stress liquidation and verified restoration, separately from the QA-script claim.
- Location: `scripts/demo-journey.ts` J7 in `a214ba8`: missing-script `return warn(...)` and `paused().catch(() => false)`.
- Scenario: before the stress script exists, J7 returns normally and is recorded PASS. After a run, an RPC failure reading paused becomes false and is accepted as proof that the desk is unpaused. An unrelated liquidation in the block interval can satisfy the unfiltered event check.
- Fix: preserve a missing-script skip/blocked outcome or fail a required run; require successful restoration reads; bind the event to the stress accounts and expected transaction/amounts.

### R-009 — P1 — api — Interrupted settlement is not safely resolved before retry or expiry

- Status: REPRODUCED CASES FIXED by `fd1cfcf`/`3d11997`. Independent recheck `payment-recovery-1791939447005.json` passes both: failed scan stays 409 with no new charge, and settled payment is recovered before expired-quote closure. Actual crash/restart and client-supplied transaction-lifetime bounds remain unaccepted. Original finding was posted at 00:49 and restored to this file in pass 3.
- Location: `apps/web/lib/server/bills/service.ts:175` (expiry before recovery), `:243` (fixed 60-second hold), `:269` (RPC scan failure falls through after hold).
- Scenario A: payment may have settled; the order contains a pending attempt older than 60 seconds; the reconciliation RPC call fails. `recoverAttempts` returns null and a new 402 is issued. A client can pay again without resolving the original transfer.
- Scenario B: the quote expires after settlement but before the receipt is durably recorded. A credential-free retry closes the order as FAILED before any reconciliation, with the incorrect note “nothing was charged.”
- Evidence: `node review/payment-recovery-check.mjs`, using actual service/store with injected RPC outcomes. `review/evidence/payment-recovery-1791939231094.json`: A makes one new charge call and returns 402; B makes zero reconciliation calls and returns 410. Source hashes are preserved. These are local orchestration failures, not live duplicate transfers.
- Fix: reconcile pending attempts before applying unpaid-quote expiry. Failed reconciliation must remain unresolved even after elapsed time; use authoritative settlement/transaction-expiry evidence before allowing another charge. The installed client's default 25-second transaction expiry is not proof every supplied transaction has expired.

### R-010 — P0 — web — App routes fail on the optional mppx MCP import

- Status: RESOLVED in `fd93ca4`. Independent :3100 requests now return 200 for FX/driver/quote and a genuine 402 for unpaid bills; `api-live-1791939449291.json`. The unrelated missing dashboard pages are implementation coverage gaps, separate from this bundler fix.
- Location: `apps/web/next.config.ts:3`; import path `apps/web/lib/mpp/server.ts:8` → installed `node_modules/mppx/dist/server/Mppx.js:1839`.
- Scenario: the local Next server attempts to bundle `@modelcontextprotocol/sdk/types.js`, which is absent. `/`, `/api/fx`, driver demo/score, and bills quote all returned HTTP 500 on this review pass. The real 402/payment/browser journey cannot start.
- Evidence: read-only HTTP probes in `review/evidence/live-1791939156131.json` and `live-1791939239000.json`, including extracted Next compilation error.
- Fix: web owner should externalize the server-only mppx dependency or install/configure its required bundling dependency, then verify the recovered routes on the running :3100 server.

### R-011 — P1 — api — Push payment can settle before the server has any recoverable attempt

- Status: IMPLEMENTED in `3cbabbf`: issued challenges are persisted before returning 402 and scanned on retry. Owner's real-mppx/local-reconciliation test covers a lost credential; live interrupted-client/restart evidence is still pending. Normal push verification was initially bypassed by this pre-scan, losing the Payment-Receipt header; `c37355c` excludes the presented challenge from the pre-scan and the owner reports a live push success. Independent receipt recheck is ongoing. No reviewer lost-response transfer attempted.
- Location: `apps/web/lib/mpp/client.ts:70` (inFlight clears on failure), `:100` (credential callback only changes stage); `apps/web/lib/server/bills/service.ts:193` (attempt written only once credential reaches server).
- Scenario: a JSON-RPC wallet broadcasts the payment, then the credential POST is lost before reaching the server (or the browser closes). The order has no pending attempt. Calling the helper again with the same idempotency key obtains another challenge and can broadcast a second transfer. The mutex and per-page inFlight map do not cover this sequential failure.
- Evidence: installed `mppx/dist/tempo/client/Charge.js:192-213` chooses push for JSON-RPC accounts and broadcasts before returning the credential; the application's `onCredentialCreated` does not preserve it. Server recovery only scans recorded pending attempts.
- Fix: durably register issued challenge IDs and reconcile their exact memo-bound transfers before new payment initiation, and/or persist and retry the original push credential across navigation/network failure. Make the uncertain state visible and avoid blanket “never charged twice” copy until this path is tested.

### R-012 — P1 — contracts — A wallet switch can change the sender halfway through a transaction flow

- Status: LOCAL FIX VERIFIED in current WIP. `run` pins account and each write checks account/network before simulation and signing. Independent recheck `hook-account-1791939985770.json` performs the first write, stops before the second, and returns failure. Browser account-switch verification is pending the shell.
- Location: `apps/web/lib/contracts/tx.ts:46` (`getConnection` inside every write); `apps/web/lib/contracts/actions.ts:119` (`swapAndSend`).
- Scenario: the user swaps as Sender, switches wallet/persona while waiting, and the following Send step uses Driver's account. If Driver has sufficient xMXN, both steps succeed but the remittance is funded by the wrong account and Sender keeps the swap proceeds.
- Evidence: `node review/hook-account-check.mjs` executes actual `useTx` with minimal React/wagmi adapters: swap uses account A, transfer uses account B, flow returns success. `review/evidence/hook-account-1791939777957.json` preserves source hash and writes. No real signatures or broadcasts.
- Fix: pin initiating account/chain at `run` entry and check the connected account/chain before every simulation/signing step. Stop with a readable error if either changes. Disable persona switching during active flows as a UI aid.

### R-013 — P1 — contracts — Sponsorship limits transaction count but not fee exposure

- Status: LOCAL FIX VERIFIED in `3364196`: huge fee, aggregate fee cap and unsupported fee token are now refused; mixed batches with an external target, creation and wrong chain also refuse. `sponsor-abuse-1791940313755.json`. No live drain attempted. Quota availability and call scope remain separate below.
- Location: `apps/web/app/api/sponsor/policy.ts:46` (`refusal`); `apps/web/app/api/sponsor/route.ts` (`Relay.feePayer` validation).
- Scenario: a request targets an allowed Mercado contract and stays under 5M gas, but supplies an enormous `maxFeePerGas`/priority fee. It passes the policy and can consume sponsor funds in one transaction if the balance covers it; hourly transaction counts do not bound per-transaction cost. Explicit unsupported fee tokens also pass the policy.
- Evidence: `review/sponsor-policy-check.mjs` evaluates the actual policy with a huge priority fee and with xMXN as fee token; both return no refusal. `review/evidence/sponsor-policy-1791939944157.json`. Installed viem's `tempo/internal/relay/feePayer.js` signs after application validation without adding a cost limit; raw sponsorship prefers `transaction.feeToken` over the configured default (`:279`). No live drain/signing attempt was made.
- Fix: require bounded gas, max fee/priority fee, and a conservative total fee cap; validate an explicit allowed USD fee token in both fill/raw paths. Keep the sponsor's testnet funds isolated.

### R-014 — P1 — api — Credit screen keeps a consumed or wrong-wallet attestation active

- Status: FIX VERIFIED IN PART: browser connects Javier, gets a live offer and visible Refresh, then switches to Miguel and sees Draw removed (`credit-browser-1791940615629.json`). Post-success refresh is verified in source; no reviewer borrow was broadcast.
- Location: `apps/web/components/credit/credit-screen.tsx:21` (mutation data), `:174` (conditional Refresh), `:210` (draw without clearing the attestation).
- Scenario: successful draw consumes the nonce, but the screen continues to offer Draw with the same attestation and no refresh control until expiry. Switching wallets also leaves the previous borrower's offer active. Further draws revert even while the new live capacity is positive.
- Fix: invalidate/refetch after a successful draw and on account/profile change; make Refresh available for an existing offer and ensure displayed borrower matches the connected account.

### R-015 — P1 — api — Editing payment fields leaves the old quote payable

- Status: BROWSER FIX VERIFIED: after a real quote, editing phone or amount removes Checkout; `browser-flows-1791940545735.json`. Source locks payable controls while busy.
- Location: `apps/web/components/billpay/pay-screen.tsx:85`, `:89`, `:99`, `:103` (form changes); `:129` (Pay uses existing quote).
- Scenario: Get quote for phone A/100 MXN, change the form to phone B/200 MXN, then Pay. The previous quote and idempotency key remain active, so settlement/fulfillment still use A/100 while the edited form shows B/200. Provider buttons can also reset state during a pending payment.
- Fix: invalidate quotes on changes to destination/amount/provider; lock those controls during quote/payment work and show the final quoted destination in checkout.

### R-016 — P1 — contracts — Unsigned fill requests can exhaust everyone's sponsor quota

- Status: MITIGATED; residual ACCEPTED BY LEAD for judging at03:06 UTC (unsigned prepare-quota grief). `4da15ea` adds selector/spender checks, eligibility, dedupe and IP ingress limits; `34d2e1a` corrects dedupe for expiring nonces. Local recheck passes refusals and fee/expiry variant accounting. However, unsigned fills may spoof an existing eligible persona and consume that victim's 30 slots; eligibility is not ownership. Forwarded-IP headers also require a trusted overwriting proxy. Raised to contracts/lead for an explicit limited-demo risk decision. No abuse sent to shared sponsor.
- Location: `apps/web/app/api/sponsor/route.ts:46` and `:52`; `policy.ts:81`; installed `viem/_esm/tempo/internal/relay/feePayer.js:91-108`.
- Scenario: a caller supplies prepared `eth_fillTransaction` requests with invented `from` addresses. No sender signature, ownership proof or broadcast is needed. Each fill consumes a global slot; even the same sender/nonce/payload consumes another slot on every retry. Seventeen invented senders can consume all 500 slots and deny fee sponsorship to the demo wallet for the hour.
- Evidence: `review/sponsor-abuse-check.mjs`, `sponsor-abuse-1791940313755.json`: 30 identical unsigned fills produce sponsor signatures with zero downstream RPC calls; isolated quota then accepts 500 requests across 17 senders and rejects a new legitimate sender. These signatures use a random local test key, never the deployed sponsor.
- Fix: bound ingress before filling/signing (trusted per-session/IP controls appropriate to this single-process demo); deduplicate identical signing commitments and distinguish sender quotas from identity proof. A public sponsor needs an explicitly budgeted Sybil policy. Persist the budget if restart must preserve it. Do not claim the current in-memory $5/hour bound survives restarts or multiple processes.
- Scope: current target checks reject arbitrary external contract calls but allow every selector on the five targets, including unknown/reverting calls and token approvals to any spender. The local relay signs an unknown vault selector without execution validation. This does not grant sponsor asset approvals or bypass target authorization: execution sender remains the caller. Restrict selectors/approval spenders and validate call shape if the policy intends only the documented app flows.

### R-017 — P1 — contracts — Invalid memo is rejected only after swap has executed

- Status: LOCAL FIX VERIFIED: `memo-1791941049318.json` shows zero writes for the 34-byte memo, and valid 10/32-byte notes still complete both local steps. Recipient validation also runs before writes. No reviewer swap broadcast.
- Location: `apps/web/lib/contracts/actions.ts:117-126` (`swapAndSend`, memo encoding after swap).
- Scenario: a memo of 17 accented characters is 34 UTF-8 bytes. The helper swaps OUSD into xMXN first, then `memoToBytes32` throws and no recipient transfer occurs. Retrying the complete flow can swap again. A 32-character UI limit alone does not prevent this with Unicode.
- Evidence: `review/memo-check.mjs`, `memo-1791940314259.json`: ASCII 32 bytes and 16 accented characters pass; 17 accented characters record one swap followed by the memo error. No real transaction was sent. The UTF-8 bytes32 encoder itself is correct for these boundaries and for `para mamá`.
- Fix: encode/validate memo and recipient before approvals or swap, reuse the encoded memo for the final write, show a UTF-8 byte counter in Send. Preserve any completed swap receipt on later send failures and offer to finish the send without swapping again.

### R-018 — P1 — api — Browser reload loses the action needed to reconcile a pending payment

- Status: BROWSER FIX VERIFIED after the additional R-021 fetch fix: `recovery-ui-1791941099162.json` loads a saved unpaid order, then sends exactly one same-key credential-free POST and shows a non-paying result. No wallet or transfer is involved. Actual settled-push recovery through this browser control remains separate from this unpaid-order check.
- Location: `apps/web/components/billpay/use-bill-pay.ts:62-68` (saved key), `:108-118` (GET-only refresh); `recent-orders.tsx:18-28`; `apps/web/lib/server/bills/service.ts:391`.
- Scenario: a push transfer settles, the credential POST is lost, then the browser reloads. The saved key/quoteId survives, but quote/keyRef state does not. Recent payments can only call GET, which returns stored CREATED without invoking `recoverAttempts`. The user cannot resume the same order from the UI; creating another quote can cause a second payment while the first remains unresolved.
- Fix: expose an explicit Resume/check settlement action using the saved quote and key. First perform a credential-free POST/reconciliation; do not silently follow a 402 into another payment while the old transfer is unresolved. Show the recovered receipt or pending state and retain the original identity across navigation/reload.

### R-019 — P1 — web — Mobile hides the mandatory no-value and non-redemption disclosure

- Status: BROWSER FIX VERIFIED in `f29e464`: at 390px the full banner wraps with no clipping and 42431 is visibly rendered (`mobile-labels-1791940702612.json`). /pay horizontal overflow remains a separate P2 layout follow-up.
- Location: `apps/web/components/shell/testnet-banner.tsx:8` (`truncate`).
- Scenario: the only global disclosure uses one clipped line. At 390px it visibly ends around “Tokens h…”, hiding both “no value” and “not redeemable for pesos.” The network badge is also hidden on mobile. A screen-reader/DOM text assertion alone would misleadingly pass the complete string.
- Evidence: `review/evidence/screen-mobile-1791940479311.png`; DOM measurement clientWidth=336 vs scrollWidth=580. Independent mobile /pay snapshot measures page width 405 vs 390; the provider/card row also overflows (P2 layout issue, same owner handoff).
- Fix: allow disclosure text to wrap; keep Tempo Moderato/42431 visible at the mobile breakpoint. Verify rendered visibility as well as DOM presence. Preserve the not-issuer-backed collateral wording wherever OUSD is explained.

### R-020 — P1 — web — A completed Send receipt changes when live balances or form recipient change

- Status: LOCAL FIX VERIFIED: `send-receipt-1791941132553.json` holds the delivered value at 20 xMXN across recipient edits and unrelated balance changes. Source now takes amount/memo from confirmed transaction logs. No reviewer transfer was broadcast.
- Location: `apps/web/components/transfer/send-screen.tsx:55-57`, `:88`, `:232-237`.
- Scenario: after sending 20 xMXN to Rosa (100 → 120 balance), change To to a different wallet holding 2,100 xMXN. `arrived` now subtracts Rosa's old 100 from the new wallet's 2,100, while the success card still says Rosa: “Delivered 2000 xMXN to Rosa.” An unrelated incoming transfer to Rosa similarly inflates the old receipt.
- Evidence: `review/send-receipt-check.mjs`, `send-receipt-1791940814658.json`, executes current SendScreen. Baseline says 20; editing recipient says 2,000; unrelated +200 transfer says 220. Source hashes preserved.
- Fix: freeze the actual delivered amount, recipient, memo, swap amount/fee and transaction hash from confirmed logs. Render live wallet balance separately; later form edits or transfers must not rewrite a prior receipt.

### R-021 — P0 — api / web — Settlement-only fetch reaches the wallet auto-payment wrapper

- Status: BROWSER FIX VERIFIED for the affected recovery path in `87e1143`; web also disables MPP auto-polyfill on all three connectors. No unintended transfer was attempted or broadcast by the reviewer.
- Location: `apps/web/lib/mpp/client.ts` (`checkBillSettlement` originally uses global fetch); `apps/web/lib/tempo/config.ts` (connector defaults); installed `node_modules/accounts/dist/core/Provider.js:1549-1573`.
- Scenario: the user clicks “Check settlement / Never pays” on an unpaid saved order. The server returns 402. The accounts provider installed by Tempo wallet/passkey connectors wraps global fetch by default, so this nominal status check proceeds into payment handling. Without a wallet it throws “No active account”; with a connected account it can invoke the wallet payment flow. A payment-capable fetch cannot implement the promised no-payment action.
- Evidence: initial disconnected browser run `recovery-ui-1791940880144.json` visibly ends “No active account.” Its `pass:true` ONLY checked request identity and absence of Authorization; that assertion was insufficient and is NOT recovery acceptance. Preserved unchanged. Installed provider source confirms default polyfill and automatic 402 handling.
- Fix verified: API uses `Fetch.unwrapFetch(globalThis.fetch)` for quote/status/reconciliation; post-fix `recovery-ui-1791941099162.json` makes one same-key POST and reports no on-chain payment without touching a wallet. Web additionally sets `mpp:false` for Tempo Wallet, passkey and demo-persona connectors. Explicit Pay still uses its dedicated Mppx instance; QA owns the next live pay regression.

### R-022 — P1 — api / contracts — Demo order reset is not serialized with the live writer

- Status: MITIGATED, RESIDUAL OPEN. API now refuses PAYMENT_VERIFIED, unresolved CREATED attempts and stores written in the previous 30 seconds. The check/rename race is explicitly acknowledged and requires a quiescent writer; --force bypasses the checks. No reviewer reset executed.
- Location: `apps/web/lib/server/bills/archive-orders.mts:21` (`renameSync`); `bills/store.ts:65` (process-local writer lock); bill settlement/recovery state in the archived store.
- Scenario: reset renames orders.json while another process is settling an order. A store operation that already read the file can later rewrite the pre-reset database, or a post-settlement operation can find the order missing. Pending recovery is also removed from the active API even though the original transfer may still land. Keeping the archive and replay file does not by itself preserve live reconciliation.
- Fix: require a quiescent writer and no unresolved/active payments before archiving, or provide a reset operation serialized inside the serving process with an ingress guard. Refuse/reset-later rather than presenting an unconditional safe-while-running claim. Preserve archives as evidence.

### R-023 — P1 — web — Missing Home reads were presented as debt-free

- Status: SOURCE FIX VERIFIED in the console rewrite and `ac2e268`. Missing debt/position now displays unavailable; `health(undefined)` is unknown, and only an explicit zero-debt ratio gives “No debt.”
- Location: `components/home/home-screen.tsx`, `lib/vault-math.ts`.
- Scenario: an RPC failure previously became zero debt / no vault position through defaults; the initial health helper also treated undefined ratio as no debt.
- Evidence: source review and owner fix. `home-rpc-unavailable-1791941415510.json` is a blocked browser probe during a server restart, not a successful fault-injection acceptance.

### R-024 — P2 — web — Page shortcuts navigate behind a wallet dialog

- Status: BROWSER FIX VERIFIED after `168b86b`.
- Location: `components/console/keyboard.tsx`.
- Scenario: focus a button in the wallet modal on /pay and press Backspace; the page navigated Home. Global t/+ also lacked the modal guard.
- Evidence: initial `redesign-1791941595884.json`; corrected recheck `redesign-flow-1791941954556.json` confirms Backspace/t/+ stay in place, Escape closes the modal, and the next Escape navigates Home. Input typing also stays on the screen. The initial immediate Escape-count assertion was timing-sensitive and is not an independent defect.

### R-025 — P1 — web — System view overstates yield and treats wallet balance as MPP volume

- Status: SOURCE FIX VERIFIED (01:50): merchant wallet balance label and explicit live-v1/in-progress-v2 notes.
- Location: `components/home/system-map.tsx:16`, `:28`, `:55` at discovery.
- Scenario: merchant token balance is labeled “xMXN paid through MPP.” Direct transfers/seed funds raise it and withdrawals reduce it without changing verified payment volume. The active v1 Create card also says collateral keeps its own yield, although v1 locks plain faucet OUSD.
- Fix: label the metric merchant wallet balance, or derive cumulative volume from verified receipts. Distinguish live v1 from v2 yield/multi-collateral in progress.

### R-026 — P1 — api — Recording a v2 deployment switches quotes before acceptance

- Status: INITIAL GATE FIX SOURCE VERIFIED in `9ac7e08`; superseded by the atomic shared-gate work in R-030. Manifest presence no longer switches MOVE by itself; remaining shared UI/pool mismatch must be closed before flip.
- Location: `lib/server/move/quote.ts:49` at discovery.
- Scenario: the presence of `deployments.v2.vamm` immediately selects v2 quote/token, while app, pool and payment default remain v1. This violates the lead-controlled switchover gate and offers a different asset/venue before its e2e acceptance.
- Fix: one explicit protocol version gate shared by app, quotes, bills and credit; signed quote binds version/chain/token/venue; never silently fall back across token versions.

### R-027 — P1 — contracts — Late donation realizes old unfunded sOUSD accrual instantly

- Status: LOCAL FIX VERIFIED in `a158c97`: accounted assets/funded reserve and checkpoint-before-fundYield. `v2-fixes-recheck.log` shows dry-year donation and late funding keep price at1.000000; later funded accrual works. No deployed check yet.
- Location: `packages/contracts/src/v2/StakedOUSD.sol:36` (`min(grown,balance)`); design §1; ERC4626PriceFeed trusts convertToAssets.
- Scenario: deposit 100 OUSD with no yield reserve, wait a year at 20% APR. Share price stays 1 because balance clamps accrued assets. Donate 20 directly without advancing time: price jumps to 1.199999 in the same block, increasing collateral valuation immediately. A fresh donation does not move price, so testing only that case misses the issue.
- Evidence: `review/contracts/ReviewV2Staked.t.sol`, `review/evidence/v2-staked-donation.log`: two local real-TIP20 tests pass, including the reproduction. Source hashes in `v2-initial-source-sha256.txt`. No deployed donation performed.
- Impact boundary: assets are funded after the donation; this is not proof of an unbacked loan or profitable theft. It disproves donation-independent pricing / no within-block price jump, which the feed and design rely on.
- Fix: explicitly account funded yield with checkpoint-before-funding and prevent direct donations from recognizing historical unfunded accrual. Test depleted reserves, long idle periods, first depositor, and deposit/withdraw checkpoints.

### R-028 — P1 — contracts — Claimed rolling redemption cap is an epoch cap

- Status: LOCAL REPRODUCTION VERIFIED; policy revision in progress. Initial epoch permits498.481596 OUSD out within1second from1,249.950101 reserve (`v2-move-initial2.log`). The first leaky-bucket fix adds a1000 OUSD floor; independent probe confirms498.003992 out immediately from1250 reserve (`v2-fixes-recheck.log`). Lead rejected that floor at01:50 and requires pure25%-of-reserve capacity/refill; final no-floor recheck PASSES in `v2-no-floor-recheck.log`, including old epoch-boundary rejection. The docs still need the accepted burst/refill semantics.
- Location: `packages/contracts/src/v2/MoveAMM.sol:_window/_rollWindow`; design §4.
- Scenario: use nearly the 25% snapshot limit just before a 24-hour epoch resets, then redeem again against the reset reserve snapshot one second later. This exceeds 25% over a rolling day while both calls comply with the implementation.
- Fix: implement a rolling bound or explicitly choose/document fixed epochs and their boundary burst. Test the boundary rather than claiming a rolling cap from within-window checks. Reserve/NAV constraints are separate and may still prevent insolvency.

### R-029 — P1 — contracts — Paused vAMM still returns payable quotes

- Status: LOCAL FIX VERIFIED in `a158c97`; quote now calls the pause guard. Original paused-quote reproduction and corrected rejection both preserved in v2-move-initial2.log / v2-fixes-recheck.log.
- Location: `packages/contracts/src/v2/MoveAMM.sol:quote`; swap functions have `whenNotPaused`.
- Scenario: admin pauses trading; quote still succeeds and the paid partner API may collect 0.50 xMXN for a trade already known to be disabled. Both execution directions then revert.
- Fix: quote must reject the paused state before the API charges, matching its stated execution-eligibility contract. An indicative price is not a fill guarantee, but known global pause should not be hidden.

### R-030 — P0 switch blocker — contracts / web / api — Protocol flag mixes v1 UI with v2 server

- Status: CORE SWITCH BLOCKER CLOSED02:36.7 shared gate tests,18 sponsor boundaries including Card,17 independent API checks and rebuilt core UI are verified; lead notified and initiated v2 flip at02:37. New Card calendar redeployment/Invest review remain separate extension gates.
- Location: `apps/web/lib/contracts/addresses.ts`, all shared balance/pool reads and actions, `lib/server/credit/index.ts:19`.
- Scenario: after NEXT_PUBLIC_PROTOCOL=v2, API signs eligibility for v2 pool and MPP charges v2 token, while ADDR and shared Credit/Earn/Pay hooks still target v1. Draw sends a v2-bound attestation to the wrong pool; displayed spending balances are the wrong token. A missing v2 pool also falls back to the old env pool.
- Fix: one shared active-protocol/address source; require complete deployment including pool, and fail closed on incomplete v2. Atomically migrate all consumers. Lead alone flips after version-specific journey and review acceptance. Check both cold-start client bundle and server environment.

### R-031 — P1 — web — V2 backing labels overstate fairness and remaining capital

- Status: SOURCE FIX VERIFIED02:52 in current Global: contributed capital, refill capacity and post-trade coverage labels match semantics.
- Location: `components/transfer/send-screen.tsx:295`–`:301` at discovery.
- Scenario: `equity()` is historical contributions minus withdrawals, not remaining equity after FX losses; the decaying bucket is labeled “Redeemed today”; the NAV row promises no one can run first. Those labels misdescribe state under stress and throttling.
- Fix: label net contributed capital and used redemption capacity, describe haircut and availability limits, and qualify the mint rule as post-trade coverage. No unconditional no-run claim.

### R-032 — P1 — web — V2 memo helper reintroduces partial-flow validation

- Status: LOCAL FIX VERIFIED02:21 in `v2-memo-1791944491336.json`: invalid recipient and oversized memo write nothing; missing decoded amount stops after mint with recovery error, without undefined transfer. Original failure evidence retained. New Remesas recovery must expose the referenced direct-token send action. No real transaction sent.
- Location: `lib/v2/actions.ts:sendUsdToMxnWithMemo`.
- Scenario: invalid recipient passes until after mint-to-self; undefined decoded mint amount bypasses an out===0n guard and reaches transfer encoding. The screen checks recipient validity, but the helper no longer preserves v1's before-write validation boundary.
- Fix: validate recipient and memo before any approval/mint; reject undefined and zero mint receipt amounts with the explicit Send-only recovery hint. Keep the delivered receipt frozen and tied to the actual token/version.

### R-033 — P2 — web — Send connect button overflows a phone viewport

- Status: BROWSER FIX VERIFIED02:44 in extensions-1791945841528.json: send deep link and all checked routes exactly390px. Later mobile redesigns need fresh acceptance.
- Location: `components/shell/connect-gate.tsx`, reused by /send.
- Scenario: anonymous390px /send has403px document width. “Continue as Miguel (Sender in Houston)” button is343px wide atx60 and escapes its panel.
- Evidence: `evidence/send-mobile-overflow.json` and screenshot. Fix button sizing/wrapping within available width.

### R-034 — P1 — web — V2 direct Send observes the wrong transaction state

- Status: LOCALLY REPRODUCED; owner notified.
- Location: `components/transfer/send-screen.tsx:54`,`:79`,`:254` at discovery.
- Scenario: in v2 “xMXN I hold” calls m1.transfer, but form/submit disabling and success-receipt condition read m2.tx. Pending direct transfer leaves Send enabled; successful direct transfer while m2 is idle hides the Delivered receipt. Adding m1 TxProgress does not fix those conditions. The useTx busy ref prevents a second call to that same hook; controls can still switch to the independent swap hook.
- Evidence: actual TSX with isolated pending/success adapters in `v2-send-state-1791943431699.json`: Send disabled=false while m1 pending, receiptVisible=false after m1 success.
- Fix: use the transaction state for the selected operation and disable all operation controls while either hook is busy; preserve the frozen actual-delivery receipt.

### R-035 — P1 — api / contracts — Crédito displays configurable loan terms as constants

- Status: SOURCE FIX VERIFIED02:21: usePool reads feeBps/perUserCap/maxUtilizationBps; Drivers uses rounded-up live fee; Earn labels use the live params. The separate unknown locked-in-loans fallback is also fixed to unavailable. No admin params were changed by review.
- Location: `components/credit/credit-screen.tsx:47`,`:417`; `components/earn/earn-screen.tsx:19`,`:20`,`:175`; `packages/contracts/src/CreditPool.sol:setParams`.
- Scenario: admin changes feeBps from200 to300. Draw preview still uses200 and claims2%, while actual debt adds3%. Utilization and per-user cap can likewise differ from hardcoded80%/1500. Current equality with deployment defaults does not make them live reads.
- Fix: expose feeBps/perUserCap/maxUtilizationBps in active pool hook and use them for terms/debt previews. Show unavailable rather than inventing defaults if those reads fail. Wire new Crédito Drivers/Lenders as they replace old pages.

### R-036 — P1 — contracts — FX keeper walks around the oracle jump guard

- Status: LOCAL FIX VERIFIED02:25 in `fx-relay-1791944691686.json`:20→10 refuses before any write. Owner policy tests5/5 also pass.
- Location: `packages/contracts/script/fx-relay.mjs:80` (step loop).
- Scenario: one external rate moves20→10 while maxJumpBps=2000. Keeper writes16,12.8,10.24,10 in sequence, bypassing the intended20% shock rejection and exposing synthetic intermediate prices to mint/liquidation/swaps. This requires a bad/stale/extreme source observation; it is not an arbitrary-user oracle permission bypass.
- Evidence: actual fetch/relay functions in a VM with local adapters, `fx-relay-1791944443248.json`. No keys loaded or live transaction sent.
- Fix: reject a target outside the configured jump before any write. Keep explicitly approved stress/restore operations separate from the normal source relay.

### R-037 — P1 — contracts / api — Relay invents source freshness and accepts stale/future observations

- Status: LOCAL/API FIX VERIFIED02:25:2020/2099 dates refuse before writes; sourceTime remains null when absent; confirmed block time used. API verifies successful oracle-target receipt and matching block timestamp, and live3100/3101 show corrected provenance (`fx-api-live2.json`). Explicit daily policy48hours, future-clock tolerance5minutes.
- Location: `packages/contracts/script/fx-relay.mjs:48`,`:61`,`:91`; `apps/web/lib/server/fx.ts:65`.
- Scenario: fallback daily timestamps2020-01-01 and2099-01-01 both result in a fresh on-chain update. Coinbase supplies no observation timestamp but relay calls local fetch time sourceTime. onchainAt is process wall time after receipt, not block time. API authenticates provenance by numerical rate equality only, so same-price admin refresh can incorrectly inherit an older relay record.
- Evidence: actual-function VM cases in `fx-relay-1791944443248.json`; source review of API record comparison. No claim about Coinbase update frequency is needed for this finding.
- Fix: explicit source-age/future validation and documented daily/weekend policy; unknown source timestamp remains unknown; use receipt block timestamp and bind cached record to chain/oracle/rate/updatedAt. Mark stress/admin overrides honestly.

### R-038 — P1 honesty — contracts — Merchant inflows are labeled MPP payments

- Status: SOURCE FIX VERIFIED02:25: row is now Transfer to merchant, total merchantInflows, node-side recipient topic filter. QA independently spotted the same semantic gap.
- Location: `apps/web/lib/contracts/activity.ts:88`,`:149`,`:251`.
- Scenario: any direct xMXN transfer to merchant increments mppPaid and creates an MPP payment row without an order, challenge or verified settlement. A memo alone is also forgeable. Supply/loan reconciliation does not validate MPP attribution.
- Fix: label merchant inflows until joined to verified bill/API settlement records. Keep amount/order identity separate from recipient filtering. Using single event rather than events also enables RPC topic filtering; current viem filters recipient locally, so correctness of recipient filtering is preserved but fetch cost is higher.

### R-039 — P1 — web — New Remesas drops recovery for already-minted tokens

- Status: PARTIAL FIX REPRODUCED02:27: recovery action added but disappears after its transfer fails; actual hook probe shows mint→transfer-attempt→mint (`remesa-recovery-1791944849954.json`). Active=recover suppresses stranded detection; fresh Send remains enabled and attempt is not persisted. Owner notified.
- Location: `apps/web/lib/remesas/use-remesa-send.ts:61`; `apps/web/components/remesas/phone-app.tsx:174`; `apps/web/lib/v2/actions.ts:64`.
- Scenario: mint/swap succeeds but the later memo transfer fails. The helper instructs using xMXN I hold, but Remesas exposes only a fresh USD swap/send. Clicking Send again spends USD and mints again; the already-minted tokens are still in the sender wallet. R-032 prevalidation is fixed, but transaction interruption still needs recovery.
- Fix: persist confirmed mint amount/recipient/token/account and expose an explicit send-existing-token recovery without another swap; disable duplicate flow starts. Preserve explorer evidence for the completed first leg.

### R-040 — P1 — web — New Remesas drops saved payment recovery controls

- Status: BROWSER FIX VERIFIED02:28 in `recovery-ui-1791944850580.json`: real unpaid order persisted through reload, one Check settlement request reused its exact key/quote with no Authorization. No payment sent.
- Location: `apps/web/components/remesas/phone-app.tsx:Pagar`; `components/billpay/use-bill-pay.ts:useRecentOrders`; old `components/billpay/pay-screen.tsx:459`.
- Scenario: an order's payment is pending or paid but fulfillment unresolved, then page reloads. The old Pay history offered an unpaid settlement check by stored idempotency key. Remesas imports only useBillPay and never renders useRecentOrders/RecentOrders, while /pay redirects there. Keys remain stored but users cannot inspect/recover them through the new screen.
- Fix: restore recent-order rows and the unwrapped/unpaid status check; never route Check settlement through an auto-paying fetch. Keep provider completion distinct from token payment.

### R-041 — P1 honesty/policy — contracts / web — Card daily labels describe a refill bucket as actual daily spend

- Status: LOCAL/DEPLOYED FIX VERIFIED02:42. Lead chose calendar day fixedUTC−6;25 local tests pass and new0x052081… runtime matches atblock39495229 (`card-live-1791945663477.json`). Same-day refund restores spend capacity, old-day refund does not; nonce stays consumed.
- Location: `packages/contracts/src/v2/MercadoCard.sol:getCard`,`:MAX_DAILY_LIMIT`, `:_spentNow`; `apps/web/lib/contracts/card.ts:CardView`.
- Scenario: card dailyLimit1000 charges1000, then500 twelve hours later. totalSpent=1500 while spentToday=1000; remaining capacity is not actual remaining daily budget. Owner tests intentionally implement leaky refill, but UI/source names1000 perday / spentToday imply a calendar or rolling-day spend total.
- Evidence: `ReviewCard.test_reviewBucketIsNotStrictRollingDailySpend`, passed in `card-review-tests2.log`.
- Fix: explicitly choose and label bucket capacity + continuous refill (with separate actual transaction totals), or implement the promised daily spend limit. Never call bucket usage actual spent today.

### R-042 — P1 demo liquidity — contracts — Free tTBILL faucet drains InvestDesk OUSD inventory

- Status: LOCAL/DEPLOYED FIX VERIFIED02:43: desk tracks bought[wallet] and limits buyback accordingly.17 local tests pass; replacement0xDacE8d… matches runtime, inventory funded, live unbought sell eth_call rejects ExceedsBoughtBalance atblock39495410 (`invest-live-1791945774666.json`). Nontransferable buyback eligibility is a material UI/liquidation-liquidity limitation sent to owners.
- Location: `packages/contracts/src/v2/DemoRWA.sol:faucet`; `packages/contracts/src/v2/InvestDesk.sol:sell`.
- Scenario: a fresh wallet with zero OUSD calls unrestricted faucet(100e6), approves the desk, sells100 tTBILL at the demo$100 price and25bps spread, and receives9975 OUSD from the10000 seeded reserve. The mint cap is per call and cannot limit repeated/Sybil draining. Desk does not mint assets itself, but accepts free-minted assets as consideration.
- Evidence: actual-contract local `ReviewInvest.test_reviewPublicFaucetCanEmptyFundedInventory`, passed in invest-review-tests.log. No network broadcasts.
- Fix/decision: gate demo issuance used by the finite funded desk, or explicitly accept/disclose the free-faucet/testnet reserve-drain boundary and avoid presenting inventory as economically protected. Track this in MOCKS.md and do not call no-desk-mint proof no-free-mint economics.

### R-043 — P2 — contracts / api — Paused InvestDesk still returns trade-ready quotes

- Status: LOCAL/DEPLOYED FIX VERIFIED02:43: quoteBuy/quoteSell call pause guard, independent quote/trade rejection passes in invest-fixes-recheck.log; replacement runtime matches.
- Location: `packages/contracts/src/v2/InvestDesk.sol:quoteBuy`,`:quoteSell`.
- Scenario: desk.pause() then quoteBuy(100 OUSD) returns positive tTBILL output, while buy reverts EnforcedPause. Source comment says quotes revert as the trade would; view guard omits desk pause (feed pause is correctly enforced).
- Evidence: ReviewInvest.test_reviewPausedDeskStillQuotesExecutableLookingTrade in invest-review-tests.log; failed trade leaves input funds unchanged.
- Fix: pause guard on quote entrypoints or an explicit paused-state UI gate. Never present a currently paused trade as executable.

### R-044 — P1 — api — Invest personal withdrawable value shows whole-pool cash

- Status: SOURCE FIX VERIFIED02:52: portfolio and phone use min(personal claim,pool cash), unavailable if either read is unknown.
- Location: `apps/web/components/invest/invest-screen.tsx:139`.
- Scenario: Portfolio displays p.pesos.poolCash as Withdrawable now for a wallet with no lender claim. Whole-pool liquidity is not that wallet's withdrawable amount. The phone's actual maxOut already computes min(user claim,pool cash), so transaction guard and displayed claim disagree.
- Fix: use the same minimum in the portfolio; label aggregate pool cash separately. Unknown either read means unavailable, not zero/default.

### R-045 — P1 — api — Invest attributes transferred assets or collateral movement to earned return

- Status: SOURCE FIX VERIFIED02:52 for the stated scenarios: return withheld unless current shares/token quantity equals quantity from own deposits/trades. Label explains external movements; personal desk buyback eligibility displayed. This is a bounded UI attribution check, not a complete basis engine.
- Location: `apps/web/components/invest/invest-screen.tsx:61`,`:65`; `use-invest.ts:useInvestHistory`.
- Scenario: receiving100 sOUSD by Transfer with no ERC4626 Deposit event creates100 OUSD Earned since deposit. Moving purchased sOUSD/tTBILL into Mint makes wallet value fall while deposit/trade basis remains, producing a false loss. Faucet tTBILL likewise looks like investment profit. History scans deposit/withdraw/buy/sell events but not transfers or posted collateral.
- Fix: track basis and custody movements, or withhold return when scope/basis is incomplete. Current wallet mark is not an investment yield calculation. Keep actual share value/holdings visible with honest source labels.

### R-046 — P0 new-route acceptance — web — On-ramp idempotency is lost on restart or uncertain settlement

- Status: LOCALLY REPRODUCED02:46; owner/lead notified, on-ramp acceptance held.
- Location: `apps/web/app/api/onramp/route.ts:27`,`:36`,`:56`,`:72` (initial82-line implementation).
- Scenario: successful writeContract then receipt timeout returns502, deletes inflight and releases quota; same key retries a new transfer. Fresh process also loses the done Map and re-sends a completed key. Same key with different address/amount returns the original success rather than409. This violates lead's durable one-delivery/key requirement.
- Evidence: actual route under local fake wallet/receipts, `onramp-1791945985077.json`: timeout statuses502/200 with2 writes; restart200/200 with2 writes; conflict200 instead of409. No real key, network or broadcast.
- Fix: durable payload-bound intent, atomic per-key claim/locking, persist the signed transaction/hash before broadcasting, reconcile uncertain settlement by hash without a second transfer, and replay only identical intent. Preserve failure/unknown outcomes across process restart.

### R-047 — P1 — web — On-ramp quota rollback clobbers concurrent spend and zero-cent top-ups pay gas

- Status: LOCALLY REPRODUCED02:46; owner/lead notified.
- Location: `apps/web/app/api/onramp/route.ts:43`,`:53`,`:75`.
- Scenario: A reserves500 then waits; B reserves and completes500; A fails and sets spend back to its captured old value0, erasing B. C and D then each complete500, totaling1500 despite1000 daily cap. Positive0.001 input rounds to0 and executes a zero-value transfer without consuming any daily budget.
- Evidence: local route probe `onramp-1791945985077.json`: race responses502/200/200/200; fractional-cent200 with amount0. No live abuse attempted.
- Fix: integer-cent minimum>=1 before reservation; durable reservation identities/atomic increments and releases, retaining uncertain broadcasts; global delivery/gas budget for the public test-card-funded float. A cap per arbitrary wallet is not a global spend cap.

## Pass 11 — ecosystem IA and mock/data audit (from02:07 UTC)

- Read `crew/DESIGN-ECOSYSTEM.md` and02:08 wire-everything assignment immediately. New product names/routes: Mint /mint, Remesas /remesas, Global /global, Crédito /credito. Persona selector removed in favor of explicit Demo mode with per-product role mapping. Existing console acceptance is historical.
- Created `review/ECOSYSTEM-REVIEW.md`: ten-second Home test, role/funding coherence, mobile Android/full-screen behavior, redirects/recovery, truthful accounting flows and carry-forward findings. Created `review/MOCK-AUDIT.md` from327 scoped code matches saved in evidence; qa posted MOCKS.md at02:12; reconciliation is recorded in MOCK-AUDIT. G1 needs fee/utilization expansion beyond the cap literal; a marker-lint PASS does not prove data wiring. R-035 is a concrete current wiring defect.
- Lead accepted indicative rather than firm Global quote wording and updated the design. Posted credit repayment≠burn, activity/volume provenance and Sender airtime funding requirements to owners.
- The newest shared-gate probe `v2-protocol-sponsor-1791943549343.json` passes all7 version/completeness cases and15 sponsor boundary checks. R-030 remains ecosystem UI/e2e gated, not a missing-pool/gate helper issue anymore.
- Independently ran the actual API read-only switch checker:17 checks PASS (`api-v2-switch-independent3.txt`) including accepted borrow eth_call, v2 attestation binding, xMXN-v2/merchant402 challenges and Move venue/token. Local launcher/npm cache failures are preserved separately and are not API defects. Used cached tsx directly; no dependency install or broadcast.
- Anonymous3101 preview `v2-screens-1791943490996.json`: Home/Mint/Send/Credit/Pay/Contracts200 with no page or console errors; Earn navigation was aborted during WIP, so no all-routes acceptance. Rebuild supersedes these screens.
- QA reports v2 scripted journey green at02:08; reviewer has not yet re-read those new journey receipts (deployment receipts ARE independently checked). Q-011 appears to be a mistaken expected revert: maxMintable already honors debt-ceiling room; a ceiling-bound MAX+1 correctly throws DebtCeilingExceeded. Owner/QA alerted; no contract bug confirmed.

## Pass 10 — v0.2 reframe and adversarial design review (from 01:42 UTC)

- Read-only v2 deployment check `v2-live-1791943177493.json` atblock39491154: all35 manifest receipts succeed;9 runtimes match reviewed artifacts after immutable-slot masking; supply=CDP debt+AMM liability; pool/issuers use v2 token; issuer membership+factory lock correct; reserve and mock yield funded; equity>=2500; quarter-reserve bucket. Initial `v2-live-1791943147800.json` used an incorrect reviewer hasRole argument order and saved only runtime/receipt checks; corrected to Tempo hasRole(address,bytes32). No deployed acceptance of UI/MPP journey yet.
- Shared protocol/policy probe `v2-protocol-sponsor-1791943265715.json`:15 sponsor boundary checks pass across versions. Gate respects default/public/script versions and missing pool, but missing vault/oracle is not refused (owner notified). Shared hook/ABI and all UI consumers remain part of R-030.
- Final local no-floor recheck:15 executions /10 distinct tests (5 inherited repeats), including256 fuzz cases, pass. Artifact `v2-no-floor-recheck.log`; exact source hashes `v2-reviewed-source-sha256.txt`. Deployed contracts independently checked below; atomic app switch/e2e acceptance still pending.
- Fresh anonymous browser check `redesign-1791942908388.json`: all12 desktop/mobile route loads return200; footer visible/unclipped; no pageerror events. Send mobile overflow is R-033. This probe does not observe React console-only hydration warnings or certify paid flows. The old immediate Escape-count check remains timing-sensitive; the separate awaited check already passes.
- Read latest IRC assignments and SPEC v0.2; prioritizing `crew/V2-DESIGN.md`. Updated PRODUCT with institutional Create, remittance Move, gig Lend, MPP Spend, a new story, three ranked improvements and eight revised judge questions. Earlier v1 recommendations are marked historical.
- Lead caught the liability-floor/equity-drain design issue before implementation; current MoveAMM enforces `amountIn <= liability`. Reviewer will test fungible CDP/AMM burns and total-supply accounting rather than assuming token provenance can be tracked.
- Additional local probes in `v2-vault-boundaries.log`: per-collateral aggregate ceiling across two borrowers, reduction below outstanding debt,18-decimal exact withdrawal bound (256 fuzz cases), RWA gap-down liquidation, and repay/debt-free exit while both feeds are paused pass. The suite also inherits four Move checks; do not count inherited tests as new independent coverage.
- Design claims requiring qualification: 20→16 MXN/USD is a 20% decline in that quote, equivalently 25% peso appreciation; the 25% equity buffer is initial, not maintained by a 100% mint gate; fees/size impact/caps make “no bank run / no first-mover advantage” too strong. Under stressed NAV redemption holders accept a haircut, and rate limits can queue them.
- RWA haircut is a demo risk parameter, not protection against an admin inventing prices. Owner can change feeds/risk/ceilings in WIP. Require explicit authority disclosure, invalid/stale feed tests, decimal tests, per-collateral ceiling enforcement, and supply/debt invariants. A shared FX oracle also means live v2 stress would affect v1; keep v1 green with coordinated restoration or isolated local stress.

## Pass 9 — console redesign, sponsorship and receipt verification (01:28–01:40 UTC)

- `redesign-flow-1791941954556.json`: seven browser checks pass: offer→Draw input navigation, input/dialog shortcuts, Escape modal close then Home, bill→Checkout and edited-bill quote invalidation. Mobile footer is fully visible and now includes Tempo Moderato 42431 plus no-value/non-redemption disclosures; no overflow. No Draw/Pay/Swap/Supply broadcast by reviewer.
- Initial desktop Home 500 in `redesign-1791941595884.json` was a transient WIP export mismatch; other routes and subsequent Home loads return 200. Do not present the transient snapshot as all-routes success or a persistent defect. Connected profile arrow focus passes after hydration; the old Other wallets selector failing after a restored connection is reviewer instrumentation, not an app failure.
- R-012 UI follow-up is present in `ec82c1b`: Credit draw/repay use shared TxProgress; Pay reports busy for the entire flow, disabling persona/Tour controls. This is source verification in addition to the earlier account-pinning execution probe, not a new mid-signature browser experiment.
- Sponsor recheck `sponsor-recheck-1791941598397.json` again confirms fee/target/function/spender restrictions and quota accounting. R-016 remains residual open: unsigned spoofed eligible senders consume victim quota. No request abused the shared relay.
- `receipt-helper-1791941324880.json`: independently fetched the real successful memo transfer receipt and ran the actual deliveredFromReceipt helper. It returns exactly 99.50 xMXN and “para mamá” without counting both Transfer and TransferWithMemo twice; sponsor feePayer matches the configured account.
- Pinned RPC snapshots in `chain-screen-1791941664291.json` and `chain-screen-1791941879120.json` bracket changing driver balances/debt during crew transactions. Browser 70 balance/153 debt and later chain 50/153 are not proof of incorrect UI accounting without the same observation time. R-025 is a concrete metric-definition mismatch regardless of timing.

## Pass 8 evidence (01:22–01:26 UTC)

- Sponsor selector/spender/fee checks and empty-account eligibility pass isolated checks. Deduplication initially omitted expiring-nonce expiry/fee fields; source review flagged this and contracts corrected it before the recheck. `sponsor-recheck-1791941049183.json`: differing expiry produces distinct fee-payer payloads and distinct quota keys; 30 fee variants sign, the 31st is refused (our deliberately disabled downstream throws during unsponsored fallback). This is local policy/Relay evidence, not 30 live sponsored transactions.
- Expiring-nonce semantics checked against [Tempo TIP-1009](https://github.com/tempoxyz/tempo/blob/main/tips/tip-1009.md): hash-based replay protection means changed expiries are not one sequential nonce commitment. No claim about the current maximum expiry window is needed for this finding.
- The memo and frozen Send receipt regressions now pass. An earlier recheck failed because the reviewer adapter lacked the newly exported memoByteLength; that probe error is preserved separately and is not an app failure.
- Recovery UI recheck first exposed R-021; post-fix check is green for a saved unpaid order. This does not establish a new lost-push chain settlement experiment.
- `tsc --noEmit --incremental false -p apps/web` initially found a Send receipt type mismatch during WIP migration; next source snapshot passes (empty `typecheck-pass8.txt`). No build was run and no shared artifacts were written by review.
- Lead announced a new console-menu redesign at 01:25. Current screen checks are pre-redesign evidence and must be rerun once the new shell lands.

## Pass 7 evidence (01:15–01:21 UTC; continuing)

- All six routes returned 200 without page errors in `browser-flows-1791940545735.json`. At this snapshot Home and Send were still stubs; Mint/Credit/Pay/Earn contain real screens. Send landed subsequently and its receipt bug is R-020.
- Quote invalidation, connected-driver eligibility and wallet-switch offer reset pass browser checks. Saved real connected offer screenshot for slides; no draw/payment broadcast by review.
- R-019 mobile disclosure/network visibility fix passes. /pay still overflows to 405px at a 390px viewport (layout follow-up only).
- R-018 now has an incoming Check settlement control using credential-free same-key POST; reviewer browser recheck is running against an unpaid order, without any wallet/transfer.
- Reviewed QA's `bills-crash-proof.ts` and transcript: actual child-process SIGKILL before/after pull broadcast, same-key retry and merchant-balance/fulfillment-count assertions. This supports those two pull windows; it does not independently prove lost push-credential recovery or arbitrary signed-transaction lifetime safety.
- Read live `/api/sponsor` policy: caps, allowed USD tokens and 30/500 quotas match the reviewed source. No abusive request was sent to that live relay.

## Pass 6 evidence (01:09–01:12 UTC; continuing)

- Read the review handoff, prior findings/product notes, crew rules, SPEC and INTERFACES. Saved changed-commit stats and WIP summaries under `review/evidence/`; no edits outside reviewer files other than authorized IRC posts.
- The first browser probe hit the dev-server restart (connection refused), preserved in `browser-restart-summary.txt`; lead confirms recovery at 01:11. A fresh browser pass is next.
- Sponsor cost bounds independently pass locally. Its target boundary rejects mixed external batches, contract creation and wrong chain. Quota grief and late memo validation are separate reproduced findings above.
- `/credit` has borrower matching, wallet-reset, always-visible Refresh and post-draw refresh in source (R-014); `/pay` invalidates quotes on edits and disables payable fields while busy (R-015). Browser verification follows.
- Payment copy at `pay-screen.tsx:156` still promises “you will not be charged twice” for uncertain settlement; this overstates the currently tested recovery boundary in R-009/R-011. Requested qualified retry/reconciliation wording.

## Pass 5 evidence (01:03–01:07 UTC)

- `review/evidence/journey-live-1791939980574.json` independently re-reads QA's frozen 01:04 full-run receipts, historical borrower debt/pool stats, and three public bill orders. All listed transactions succeeded; each order has exactly one matching token/amount/merchant Transfer in its receipt. Normal pull and push orders retain `mppReceipt`; simulated provider rejection remains paid-but-unfulfilled. An independent `eth_call` replay of the actual borrow calldata reverts `NonceAlreadyUsed`.
- This recheck preserves the original QA snapshot and hash, including its outcome claims. It independently verifies chain/order state; it does not replay wallet interaction or retrospectively measure the retry debit delta. Those assertions remain QA's captured live-run evidence.
- Earlier reviewer probe files remain preserved: `journey-live-1791939704604.json` selected a J0-only snapshot and performed no receipt checks; `journey-live-1791939734735.json` hit a reviewer decoder error on Tempo's `calls[].input`. Corrected parser recheck `journey-live-1791939816390.json` verifies the earlier 00:58 receipts. Neither instrumentation issue is a contract finding.
- Reviewed contract hooks, sponsor route/policy and new credit/payment screens. R-012 was fixed and rechecked locally. R-013/R-014/R-015 are posted to their owners. All reviewer writes remain under `review/`, with channel posts through the authorized IRC tool.

## Pass 4 evidence (00:56–01:03 UTC)

- `review/evidence/live-1791939464298.json`: new deployment, all **38** manifest receipts succeed, including core, smoke, desk seeding, pool supply and stress. No old-address smoke receipt is reused as proof for the new deployment.
- `review/evidence/live-1791939621099.json`: deployed factory, oracle, vault, desk and pool runtimes all match the local test artifacts after masking only Solidity immutable-reference slots. Oracle is fresh/valid at **20.00**, desk is **unpaused**; snapshot reserves **1,050 OUSD / 19,005 xMXN** and pool cash **10,010 xMXN**.
- Stress receipt `0x6ecd13b888a88503d08cd286514d233258d85ae5f051f982a923986b339e993b` decodes the expected vault `Liquidated` event: **1,250 xMXN debt covered**, **100 OUSD seized**, plus the burn and collateral transfer. The recorded restore tx sets **20.00**. At the stressed 104% ratio, seizure is collateral-capped, so this is not proof that the liquidator receives a full 10% bonus in every case.
- `review/evidence/api-live-1791939449291.json`: live API request checks, valid/invalid input responses, real xMXN 402 amount/token/merchant/order binding, same unpaid order retry, quote conflict=409, and current API signature/capacity accepted in deployed-pool `eth_call`.
- `review/evidence/browser-1791939509026.json` with desktop/mobile PNGs: `/` returns the Next scaffold, `/mint`, `/send`, `/credit`, `/pay`, `/earn` return **404**. This is a live frontend coverage failure, not a network block; web/API owners are building these screens. No completed browser wallet journey is claimed.
- Reviewed typed contract read/write hooks and new bill/advance hooks. Filed R-012 and explained the push receipt short-circuit to QA/API. Fee-sponsor route is new WIP and remains under review.
- Lead approved the deck critique; slides moved to a driver-first arc, about 120 seconds of notes, supporting mint/remittance beats and appendix architecture/formula/roadmap. User subsequently requested minimal text and screenshots/animations; slides implemented that direction. Real app screenshots still depend on the screens landing.

## Pass 3 evidence (00:51–00:55 UTC; historical snapshot)

- Network limitation from the prior session is removed. `review/live-check.mjs` uses only read-only RPC and HTTP requests; this reviewer has broadcast no transactions or changed shared chain state.
- Moderato reports chain ID **42431**. In the pinned snapshot, both tokens have **6 decimals**, xMXN has currency **MXN**, and the oracle reports **20.00**, fresh/valid, `isMock=true`. Factory/oracle/vault have deployed code; desk/pool are zero in the shared deployment manifest.
- Independently fetched all **9** recorded deployment/smoke receipts: all succeeded. Decoded events plus historical reads confirm: deposit **100 OUSD**, mint **1,000 xMXN**, repay/burn **1,000 xMXN**, withdraw **100 OUSD**; final smoke account position and token supply return to zero. This is evidence for the provisional deployment only.
- `review/evidence/live-1791939239000.json` verifies ISSUER_ROLE membership: vault=true, factory=false, merchant=false. This is a bounded membership check, not enumeration of every possible role holder. The initial live file preserves three reviewer-probe ABI failures: TIP-20 uses `hasRole(address,bytes32)`, not the OpenZeppelin argument order; corrected in the second run. Those failures are not contract findings.
- Full local contracts suite: **67 passed, 0 failed, 0 skipped**, including 20 Vault, 21 LoanAttestation, 14 FXStress and 12 Swap tests. Command: `~/.foundry/bin/forge test --root packages/contracts --out <repo>/review/out --cache-path <repo>/review/cache --offline -vv`. Log: `review/evidence/contracts-pass3.log`. This covers current WIP source, not a claim that the pending redeploy matches it.
- Live app HTTP requests failed with R-010. Live MPP 402, payment, restart recovery, wallet journey, and deployed API-to-pool signature verification remain unaccepted. Local service probes are reported separately.
- Reviewed the 12-slide local deck and posted concrete narrative/proof-label changes to `@slides`/`@lead`; details are in PRODUCT.md. No deck files were edited.

## Pass 2 evidence (00:42–00:47 UTC)

- Read all five contract implementations, local Base/Vault tests, new bill service/store/provider/MPP helper and routes, dependency replay/binding/client-mode source, updated acceptance and journey scripts, and the Demo/crew changes through `d730d26`.
- Vault source has conservative mint/withdraw enforcement, repayment burns supply without requiring a fresh oracle, only the vault receives issuer rights, and no admin withdrawal path. Desk reserves and pool cash are separately tracked. This is bounded source review, not a full audit.
- Executed `~/.foundry/bin/forge test --root packages/contracts --out <repo>/review/out --cache-path <repo>/review/cache --offline --match-path test/Vault.t.sol -vv`: **18 passed**, including two 256-case fuzz tests. No network or deployment involved.
- Executed review boundary probes with `FOUNDRY_TEST=<repo>/review/contracts` and `--match-contract ReviewBoundaries`: **2 passed**, reproducing R-006 and R-007. Initial external-import resolution needed adjustment; final compilation and tests succeeded.
- Solidity EIP-712 domain and struct match the API source, and fees round up in CreditPool. Full signed API-to-deployed-pool evidence remains pending.
- FX API now uses `peek()` and returns the actual timestamp or 0 for a config fallback, addressing QA's staleness-label finding.
- Local app now runs at **http://localhost:3100**; :3000 belongs to another project and is outside this review's operations. QA reports a current MPP route bundler error on the optional MCP dependency; no live payment claim is made.

## First-pass coverage and evidence limits (historical)

- Read `SPEC.md`, `INTERFACES.md`, crew guidance, all initial commit stats, README/acceptance disclosures, shared chain/schema/types, all three income fixtures, credit scoring/attestation/provider source, FX/env/deployment/http helpers, API routes present, frontend ABI/format helpers, and the full journey script. Scanned status/diff for uncommitted work.
- Lead's 00:39 decision changes collateral to **Testnet OUSD (Tempo faucet, no real value)**, deployment key `ousd`; followed updated `INTERFACES.md` and `crew/COMMON.md`. Existing dOUSD references are a migration watch item, not evidence that the team intends to ship the old configuration.
- API EIP-712 types match the current interface: `MercadoCreditPool`, version `1`, chain 42431, verifying pool, and `Eligibility(address borrower,uint256 maxAmount,uint256 expiry,uint256 nonce,bytes32 dataHash)`. Solidity implementation was not yet present for cross-language verification.
- Executed all three pure fixture score cases with unknown, zero, and 75 xMXN liquidity. Baseline scores: steady 96.5 / 1,500 maximum; irregular 54.2 / 590 maximum; new-driver 21.3 / ineligible. These are illustrative rules, not validation of a credit model.
- Contracts existed only as Foundry setup and a TIP-20 probe at the first-pass boundary. Vault math, roles, liquidation, desk isolation, lending, and deployed behavior are **not yet reviewed or accepted**.
- Next dashboard remained scaffold/in-progress; no successful browser journey is claimed. MPP app routes were not yet present. No on-chain transactions were initiated by this reviewer.

## Dependency facts checked

- Installed `mppx` is **0.13.4**. Read `dist/tempo/Methods.js`, `dist/tempo/server/Charge.js`, and `dist/server/Mppx.js`. Charge input uses decimal token units and is converted with `parseUnits(amount, decimals)`. Passing already-scaled base units would multiply the charge by 10^6.
- Current route verification compares amount, currency, recipient and application metadata; Tempo charge requires a challenge-bound transfer memo. Bind quote/order identity in application metadata and keep order idempotency separate from payment verification.
- `tempo.charge` defaults to an in-memory replay store. A new method/store per request would lose the replay namespace. Review persistent/single-process order and payment state once implemented.
- Read local `tempo-std` TIP-20 interfaces and `ForkProbe.t.sol`; issuer-gated burn operates on the caller balance. Pool/vault tests must account for the actual precompile behavior.
- Official references consulted: [MPP server creation](https://mpp.dev/sdk/typescript/server/Mppx.create), [Tempo source](https://github.com/tempoxyz/tempo), [Tempo integration guide](https://docs.chain.link/ccip/v1/evm/tools-resources/network-specific/tempo-integration-guide). Direct docs.tempo.xyz pages redirected to a location unavailable to the browsing tool; installed source is the implementation evidence used here.

## Next pass (updated03:14 UTC)

Start IRC unread. Current owner follow-ups: R-049 Tour unpinned/open-ended step windows + hidden rows; R-050 maize heading / terracotta block text contrast; R-051 Card needs in-phone TESTNET/SIN VALOR REAL. R-048 admin copy fixes verified, sponsor malformed-first-draw fix verified and unsigned-quota residual accepted by lead. Invest current desk and gated/legacy token runtimes + live bindings pass. R-046 on-ramp stays OFF by lead03:16 decision;7 prior route cases pass, the reproduced auto-reclaim race has a newer source fix not yet independently accepted, and lead says spend no more time on it before judging. R-039 unknown-broadcast Send still requires reconciliation before retry. QA filming Driver/Merchant/Familia around03:11–03:16: no reviewer chain writes, restarts, reset or commits. Build was fixed by lead after Invest WIP import error; latest12-case browser pass returns200/no page errors. All outputs under review/evidence; latest scripts/fix boundaries recorded below.

## Pass12 — Brand v4, relay fixes and migrated recovery (02:19–02:25)

- Brand v4 now owns product visuals. Initial live18-route/viewport snapshot `ecosystem-1791944489822.json`: all implemented routes200, no page errors; /global404 while explicitly assigned/WIP. /credit and /earn preserve tab intent; /pay URL preserves airtime intent but Remesas does not consume it yet; /send still old route. Mobile header overflow persists (390→402–414px); initial Crédito table width also exceeded viewport, improved in later snapshot. Details `ecosystem-flow-1791944639656.json`. Home ArrowRight and Enter open the intended product.
- Sponsor/version recheck at02:23: all7 gate and15 policy boundaries pass, output `sponsor-ecosystem-recheck-summary.txt`. R-016 quota/ingress/process residual remains; no live quota exhaustion attempted.
- R-032 helper fix independently verified with actual module; R-035 mutable params and unknown loan-lock display source fixed. New Remesas drops two recovery surfaces (R-039/R-040); owners notified.
- Relay/indexer R-036–R-038 posted and fixed in this pass; no reviewer live writes. API's first tiny probe mistakenly called Response.status as a method (`fx-api-live.json`); corrected read-only probe `fx-api-live2.json` works. Browser unpaid-quote probe initially had a strict selector matching hidden duplicate phone DOM; rerun targets visible input. These instrumentation issues are not app failures.
- Judge Q&A rewritten into eight current, honest ecosystem questions/answers in PRODUCT.md, including admin FX authority, reserves, mock boundaries, sponsor residual and production limits.

## New assignment02:29 — Mercado Card / five products

Read IRC immediately on user steering (`irc-card-assignment.txt`). Created CARD-REVIEW.md with authorization/domain/replay/merchant/limit/freeze/refund test matrix and UI/version boundaries. Lead explicitly requires holder EIP-712 tap auth despite optional wording in design; communicated stronger gate to contracts. No Card source available yet. Posted platform-data/cache/signature consistency requirement for Uber/DiDi/Rappi; no mislabeled Uber fallback. PRODUCT and ECOSYSTEM updated to five products/Brand v4, judge Q&A now includes Card trust boundary.

## Invest queued / Card source reviewed (02:33–02:35)

IRC assignment in irc-invest-assignment.txt; created INVEST-REVIEW.md pricing/inventory/no-guaranteed-return gate. Card source found, reviewed EIP-712 mandatory merchant-bound tap, nonce/deadline, holder controls, transfers and capped refunds. Independent test subclass adds9 checks to14 owner tests;23/23 pass incl256 partial-refund fuzz runs. First reviewer import used unsupported absolute-resolved path; corrected to project imports test/ and src/, preserved first log. No contract failure. Runtime/deployment check follows; R-041 policy/copy concern posted.

New Brand v4 browser snapshot ecosystem-1791945070347.json: Global now200; all18 checked route/viewport cases200, no page errors; Home/Mint/Remesas/Global/Crédito widths390. Send deep-link now redirects correctly but form overflows430 at390 (remesas-send-overflow.json); header fix does not close R-033 entirely.

## Pass13 — Card deployed proof / Invest pricing (02:34–02:38)

- Card first deployment0x7Fb945…36A70 independently checked atblock39494624: reviewed runtime matches (masking immutable slots only), v2 xMXN bound, merchant active, local EIP-712 digest equals chain,6 stage receipts successful, CardCharged sum equals gross spend (`card-live-1791945295100.json`). This proof is for the initial bucket version, NOT the later calendar-day redeploy.
- Lead chose CDMX midnight calendar limit for R-041; source now implements fixedUTC−6 day boundaries and same-day refund capacity restoration. New local tests/redeployment recheck in progress. Card refund must still leave tap nonce consumed.
- Sponsor actual-source probe expanded for Card user charge/approval versus owner allowlist:18 boundaries pass,7 protocol-gate cases pass (sponsor-card-recheck-summary.txt). R-016 unsigned quota/ingress residual unchanged.
- InvestDesk source landed;14 tests pass (10 owner+4 independent),256 round-trip fuzz cases. Fixed-price round trips lose only spread/rounding and cannot profit; xMXN buy minOut failure rolls back the entire AMM redemption and inventory transfer. New concrete R-042 faucet/inventory and R-043 paused-quote findings posted. Deployed InvestDesk/complete UI not yet independently accepted.
- Latest mobile brief now permits real Uber/DiDi/Rappi logos with source attribution, simulated Mercado consent and no password entry. This supersedes the earlier no-logo instruction; no affiliation claim is authorized.

## Pass14 — deployed extensions, Invest UI and new on-ramp (02:41–02:46)

- Card calendar replacement runtime and3 manifest receipts pass; Invest replacement runtime/token/feed/AMM bindings/inventory and5 receipts pass. Both preserve local source acceptance boundaries. Invest no-purchase sell simulation returns the exact expected ExceedsBoughtBalance. Sponsor source now passes21 user/admin/approval boundaries plus7 protocol gate cases.
- Post-flip extensions snapshot extensions-1791945841528.json: Home/Card/Invest/Crédito/Remesas-send all200 at1440 and390, no page errors, all exactviewport width. R-033 send overflow fixed. Typecheck-six-products.txt is empty (tsc exit0 at this snapshot). No button-driven transfer by review.
- New Invest UI financial-copy issues R-044/R-045 posted. New simulated on-ramp assignment from lead received02:44; actual route inspected, R-046/P0 and R-047/P1 locally reproduced with fake wallet/receipt adapters. Reviewer probe initial syntax error corrected before execution; no product error or real transaction involved.
- Remesas R-039 owner added persisted state plus fresh-send guards; source looks improved, independent updated-hook probe still needed. Prior failed-recovery reproduction remains preserved.

## Pass15 — on-ramp rewrite residuals / UI fixes (02:48–02:52)

- R-039 actual-hook updated probe remesa-recovery-1791946121612.json confirms failed recovery persists, fresh mount reloads same55 amount/account/recipient, new Send is refused. Unknown delivery settlement remains open: Send step hash with no receipt must be reconciled before issuing another transfer. Stored recovery also needs token/version/hash scope; owner notified.
- On-ramp rewrite tested via actual route + actual bill mutex with isolated review ledger and fake wallet. Four groups pass: pending restart/no re-sign, settled replay+payload409, disabled+$1 min/integer-cent validation, concurrent per-wallet cap. Two remaining R-046 blockers reproduced in onramp-v2-1791946317787.json: corrupt existing file becomes empty and re-signs, two isolated process mutexes sharing a file create2 signatures for one key. Live GET3100 shows enabled:false;3101 unreachable at02:52. No live POST/transfer by reviewer. Lead told to keep disabled.
- Initial rewrite probe default-import adapter error was corrected before executing cases; launcher artifact is instrumentation only. Durable ledger artifacts are fake signed-byte records under review/evidence/onramp-sandbox-*; no secrets.
- R-031 Global copy, R-044 personal withdrawal amount and R-045 scope-sensitive yield display fixes source verified; owners notified. New UI screenshot pass already confirms no runtime errors/overflow for Card/Invest/new Driver app at390/1440.

## Pass16 — current source drift / sponsor regression (02:53–02:56)

- Contracts redeployed InvestDesk again against gated tTBILL, now0xD4662343deeE28B4d4a9E4be8E718d9C7d5E4c32. Independent read-only recheck in invest-gated-live-summary.txt: runtime matches, current v2 token/feed/AMM bindings correct, tracked inventory funded, quote positive, unbought sell rejected,6 manifest receipts succeed. Earlier0xDacE8d… proof remains historical. Old tTBILL remains listed as tTBILL-legacy; do not confuse its public faucet with new gated token.
- R-016 NEW concrete bypass: sponsor first-draw exception grants senderEligible=true and refusal accepts an invented sender whose call is only the4-byte borrow selector, no arguments/attestation. Actual policy probe in sponsor-new-borrow-summary.txt:21/22 pass, first-borrow case fails. Installed viem feePayer.ts:110–126 uses prepared transaction directly, so upstream fill simulation is not a reliable guard. Contracts notified; no live sponsor spam.
- Current on-ramp v2 harness onramp-v2-1791946317787.json has4 pass groups and2 fail groups. Single-process restart is safe; corrupt ledger and multiple process mutexes are not. GET /api/onramp enabled:false confirmed;3101 unreachable then. Keep route disabled.
- Brand guidance changed again02:55: Spanish-only dark-first phone apps, tiny Testnet/sin valor real + Demo/Simulado badges, detailed explanation in desktop panels; mobile owns Remesas/Card and mobile2 Crédito/Invest. Real platform logos now allowed with sources. Preserve accessible recovery/close controls and essential simulation labels on actual mobile devices where side panels may move below the fold. QA reported Card error sheet blocks freeze toggle; owner fixing, no duplicate finding needed.


## Pass17 — PRINCIPLES / admin powers / sponsor / Tour (03:00 onward)

PRINCIPLES.md supersedes older visual directions, including the pass16 dark-first note. Paper/ink canvases, Archivo Black + Inter Tight, editorial index and compact precise testnet meta are the current acceptance basis. Terracotta/rosa contrast and visible phone disclosures are being measured in the rendered app, not inferred from token names.

### R-048 — P1 — contracts — `/contracts` understates owner economic control

- Status: SOURCE FIX VERIFIED03:10; originally posted03:05 to contracts. Source `apps/web/components/contracts/contracts-proof.tsx:251,315,286,384`.
- The vault says its owner cannot mint to itself or move collateral. There is no direct admin sweep, but owner-selected collateral/feed/ceilings permit owner minting and adverse liquidation valuations. The pool says its owner cannot withdraw lender funds, while owner can rotate the attestation signer, set utilization to100%, attest its own borrower and draw all idle cash. Those draws create debt but repayment is unsecured.
- Independent local Foundry proofs: new owner-issued collateral valued by an owner-chosen feed mints1,000,000 xMXN to owner; rotating the pool signer and caps lets owner borrow all10,000 lender xMXN. `review/contracts/ReviewAdminClaims.t.sol`, `review/evidence/admin-claims-pass17.log`:4/4 pass. No network writes.
- Additional omissions: FX owner `setConfig` can widen band, staleness and jump bounds; the stated5–50/1h rails are settings, not immutable constraints. AdminPriceFeed `forceSet` bypasses its2% normal-update jump limit within its immutable band. Both authority paths reproduced locally. The legacy tTBILL entry also needs its actual public-faucet authority checked rather than sharing gated-token copy.
- Fix: distinguish absence of direct withdrawal/free-mint entrypoints from economic trust in owner-controlled collateral/valuation/credit signing. State override/config authority and its consequences plainly. Read each contract owner rather than implicitly assuming the vault owner controls all forever.

### R-049 — P1 — web — Tour per-step evidence has no closed accounting interval

- Status: OPEN; posted03:05. Source `apps/web/components/tour/demo-tour.tsx:131–140,219–236,301–306,449`. Line numbers reflect inspected source.
- Snapshots request block and latest balances in parallel without pinning balances to that block. Transfer queries include the snapshot block, then use latest forever, with no step end. Crédito and Card use the same driver: a Card debit appears in both step histories; revisiting Crédito subtracts it from a number called “this step.” Existing transfers in the baseline block can appear with no matching balance delta. New transactions keep changing a supposedly completed summary.
- Actual-module probe `review/tour-trace-check.mjs`, `review/evidence/tour-trace-1791947059790.json`: initial block is included, later Card log appears under both steps, baseline balances are unpinned. The same probe confirms a7-row trail silently renders only5 (`TraceList.slice(0,5)`), including the “whole trail” summary.
- Fix: bind each visit to account, chain/token version, pinned start block/balances and pinned end block/balances; query `(start,end]`, freeze completed deltas, and show/paginate all events. Label external/reset flows as account activity, not product-generated transactions. Actual transaction hashes are used for links; attribution/window correctness is the failed boundary.

### Pass17 bounded acceptances

- InvestDesk0xD4662343deeE28B4d4a9E4be8E718d9C7d5E4c32 matches reviewed runtime atblock39497275; active gated-token/feed/AMM bindings, inventory, positive quote and unbought-sale rejection pass. Six manifest receipts succeed (`invest-live-1791946905172.json`). No reviewer trades.
- Sponsor first-draw fix independently passes22 legacy/version policy checks. Additional actual-policy harness `sponsor-v2-boundaries-1791947061163.json` passes32 cases: all nonallowed Card/InvestDesk/sOUSD write selectors rejected, mixed borrow/admin batch rejected, real local EIP-712 valid signature accepted and wrong borrower/key/domain/expiry/amount/nonce rejected,31st distinct fill refused. No live sponsor requests or quota consumption.
- Limits remain per process:30/sender/hour,500global/hour and0.01USD maximum signed fee cost per transaction, at most5USD/hour per process under those assumptions. This is not a lifetime sponsor-balance protection. Eligible-wallet impersonation can still consume unsigned prepare quota; public faucet balances make eligibility cheap; forwarded IPs require a trusted ingress. No arbitrary-target/admin-call allowance was found in this pass.


### R-050 — P1 — web — PRINCIPLES palette applied to text without adequate contrast

- Status: OPEN; posted to web/mobile/mobile2. Live snapshot `review/evidence/principles-1791947206250.json`,390 and1440px, all12 page cases200/no page errors at that instant (later build regression tracked separately by QA).
- `components/console/settings.tsx:97`: Invest heading uses maize#E5A823 on white,2.109:1; below even large-text3:1. `components/remesas/remesas-screen.tsx:129` / shared FlowNode accent: white85% meta11.5px/description13px on terracotta#E2603F gives2.953:1; white18px/600 gives3.512:1, below normal-text4.5:1. Use ink for these text roles.
- Palette reference: terracotta/white3.5125, rosa/white4.3419, maize/white2.1091; ink#0A0A0A on those accents5.6365/4.5598/9.3871. Small text on rosa also needs ink/darker treatment. Compare unrounded ratios. Standard: [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), normal4.5:1, large3:1 (24CSSpx or18.667px bold).
- Remesas and Crédito phone TESTNET/SIN VALOR REAL meta were visible at390 and measured>6:1. Old Card Demo pill3.15:1 is superseded by the03:09 ink restyle, queued for rendered recheck. Invest phone restyle is also pending. Existing Home overflow reproduces390→426 and1440→1547; already assigned by lead, no duplicate finding.

### Pass17 fixes and current gate notes (03:10)

- R-048 source copy now discloses owner-driven minting, signer/cap-driven lending of all idle cash, FX config/force override, tTBILL force override, and liquidation enabled by risk/feed changes. Independent read-only check atblock39497983 (`invest-token-live-1791947335637.json`) confirms all12 inspected ownable addresses share the stated owner. Current and legacy DemoRWA runtime both match; current faucetCap0 and faucet(1) reverts with the correct reason; legacy faucetCap1000 tokens and vault mintPaused=true. R-048 is SOURCE FIX VERIFIED; no live exploit.
- Lead explicitly ACCEPTED R-016 residual unsigned prepare-quota grief at03:06 for judging. Contracts owns fee fallback proof/UI attribution; reviewer does not claim to have broadcast those tests. No admin selector bypass found.
- R-046 latest actual-route+ledger module recheck:7/7 prior cases now pass (`onramp-v2-1791947407348.json`). Additional actual-module deterministic lock-resume interleaving still fails (`onramp-lock-race-1791947438471.json`): reclaim(lock,null) can remove a live lock written after its stale/empty check. Recommend no automatic reclaim; require quiesced operator cleanup for unresolved ownership. On-ramp remains unaccepted/disabled pending this fix. R-047 original cap/minimum failures are fixed.
- QA's03:10 report: Invest phone WIP import CHAIN_ID broke :3100 compilation/API. Owner was notified by QA/lead; do not interpret the earlier successful browser snapshot as current build acceptance. Spending-proof take held, no review transactions/restarts.


### R-051 — P1 — mobile — Card phone lost its no-value disclosure

- Status: OPEN; posted03:14. Source `apps/web/components/card/holder-app.tsx:63–87`.
- New ink/cream phone has an excellent-contrast Demo network mark and explains it is not Visa/Mastercard, but contains no TESTNET / SIN VALOR REAL disclosure in any branch. An isolated phone screenshot or scrolled phone does not include the shell/desktop panel's money caveat. Loading/no-card states omit even the network meta.
- Fix: persistent compact no-value meta in the phone header, independent of card/data state. Other three phones retain the label and measure>6:1. New Card Demo badge measures15.97:1; network explanation7.86:1. The issue is missing money semantics, not unreadable existing text.

### Pass17 final verification snapshot (03:14)

- New PRINCIPLES phones: `principles-1791947550020.json` records all12 page/viewport cases200 with no page errors and exact viewport widths390/1440, so Home overflow is fixed. Remesas/Crédito/Invest each have visible in-phone no-value meta. Card390 snapshot hit a loading skeleton; desktop loaded the cream card. Source confirms R-051 is present in every state. R-050 remains in the shared Invest heading and Remesas diagram, distinct from fixed mobile button colors. Avatar initials were not filed as failures: display font weight/duplicated identity makes an automated normal-text classification inconclusive.
- Live Tour check `tour-live-1791947668216.json`, blocks39496530–39498530:10 driver transfer rows; xMXN/OUSD signed log sums equal pinned balance deltas; all5 rendered hrefs use the actual event hash with the correct Moderato explorer;8 sampled receipts succeed. Only5/10 rows render. Latest block was pinned by the read adapter for reconciliation, so this validates source-event mapping and links, NOT the product's unresolved step-window accounting.
- `/developers` owner-requested review found fresh quote/key on retry after unknown bill settlement. API immediately added persisted pending intent/reconciliation and executable quote/key snippets. Independent actual-hook recheck `developer-retry-1791947597589.json` passes: reload holds pending with no payment, unpaid resumes same quote/key, settled recovery adds no paid attempt. Initial test launcher met a newly added import while owner edited; it is preserved as instrumentation failure, not product evidence. Requested softer idempotency wording: server order recovery is not an unconditional guarantee against client-broadcast duplication. No reviewer payment.
- Deck/photo labels were not independently recertified in this pass. Phone CSS scans skip images/gradients/opacity-composited text when a flat-background ratio would be unreliable; measured findings above use simple solid colors. No claim of comprehensive WCAG compliance.


### Pass17 close / lead decision03:16

Lead assigned R-049 Tour windows/truncation and R-050 shared contrast to web, R-051 phone money meta to mobile. They remain owner follow-ups. Lead explicitly keeps the on-ramp OFF and says not to spend more time there before judging. A newer onramp-ledger.ts now removes automatic reclaim, but reviewer did not run another acceptance pass after that decision; retain the earlier race reproduction as historical evidence, not a claim that the newest source still contains it.

API455eda3 softens `/developers` retry copy to same-order recovery; no unconditional never-pays-twice user copy remains in its updated source. QA reports a44s real driver→Card spending take completed, but lead spotted the demo-name mismatch (Crédito Lupita, Card Javier) and assigned the fixture correction. This is crew evidence, not a reviewer transaction or independent video certification. QA wallets are free again; reviewer still broadcasts nothing.


## Urgent deck copy handoff (03:44 UTC)

Lead03:40/josu requested a radically simplified14-slide script, delivered as `review/DECK-COPY.md` and posted to lead/slides within the requested ten-minute window. Each slide has one action headline, subline≤12 words, at most one numeric callout, and notes≤2 sentences; structural validation saved to `evidence/deck-copy-validation.json`. First validation launcher regex was too greedy and corrected; content limits pass. No deck/source commits or publication by review.

Read-only draft evidence:500 OUSD→9149.158361 xMXN;10000→176297.243813, rounded to9149/176297 pesos in visible copy. FX moved slightly from lead's reference quote, explaining the2-peso Global difference. `/api/invest/rates` reports500/800bps dollar/peso configured APR and mIDX100USD. These API observations do not independently verify the new sxMXN deployment/runtime/funding or validate annual returns. Latest one-number/no-decimal copy rule places sender inputs and the second Invest rate in notes, replacing the earlier multi-counter slide request.

Next review queue from unread: sxMXN instance+funding and sponsor extension; mIDX/second desk; Invest accrual counters and new rates API; Tour R-049 fix88ee949; contrast R-0503a59e13; Card R-051 fix; Remesas R-039 reconciliation b36e64f (especially unknown tx deemed dropped after10min versus actual signed validity/nonce evidence). On-ramp remains OFF by lead. QA03:41 reports V1–V12+VS pass, V0 RPC-limit failure remains; this is crew evidence. The default app must retain disclosures; capture-only ?present=1 is a separate lead-authorized presentation mode, not blanket default label removal.
