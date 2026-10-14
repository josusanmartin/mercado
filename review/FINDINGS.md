# Mercado review findings

Last reviewed commit: `87e1143` and the later sponsor/memo/receipt changes through approximately 01:27 UTC; shared tree WIP is explicitly noted below.

Current status: fee caps, call selector/spender boundaries, expiring-nonce dedupe, pre-write memo validation, quote invalidation, wallet-offer reset, mobile disclosure visibility, frozen Send receipts and credential-free recovery fetch are independently rechecked at the evidence levels below. Remaining review risks are R-016's unsigned existing-sender quota grief and R-022's reset/writer race. R-021 exposed the connector auto-payment wrapper and is fixed for the tested recovery path. No reviewer chain transaction was broadcast. The new console-menu redesign is pending; all completed browser checks below predate it.

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

- Status: MITIGATED, RESIDUAL OPEN. `4da15ea` adds selector/spender checks, eligibility, dedupe and IP ingress limits; `34d2e1a` corrects dedupe for expiring nonces. Local recheck passes refusals and fee/expiry variant accounting. However, unsigned fills may spoof an existing eligible persona and consume that victim's 30 slots; eligibility is not ownership. Forwarded-IP headers also require a trusted overwriting proxy. Raised to contracts/lead for an explicit limited-demo risk decision. No abuse sent to shared sponsor.
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

## Next pass (updated 01:27 UTC)

Read `crew/DESIGN-SWITCH.md`; the shared console-menu redesign was assigned at 01:25 and is expected in about 20 minutes. Recheck always-visible mobile honesty labels, new persona bar while any transaction/payment is busy, keyboard scoping (typing in inputs must not trigger navigation/tour), dialog focus, and both light/dark layouts after it lands. Keep R-016/R-022 residuals explicit and ask lead for any limited-demo acceptance decision; do not close them merely on owner mitigation claims.

Prior restart note: start with `IRC_NICK=review bin/irc unread`, then `git log --stat d6c810a..HEAD` and status/diff. Recheck R-012, fee sponsorship, normal push receipts and recovery boundaries. Review browser flows when dashboard pages land. Preserve completed and failed evidence separately. Lead commits review files; the reviewer does not.
