# Mercado review findings

Last reviewed commit: `d730d26` (2026-10-14, approximately 00:47 UTC).
Latest pass also covers uncommitted contracts and the per-order payment-lock fix. Open: R-006 (P1 offer sizing), R-007 (P2 withdraw quote), R-008 (P1 stress evidence). R-005's P0 concurrent-settlement defect passes its local recheck; live payment/restart behavior remains unaccepted.
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

- Status: OPEN; posted to `@api` with source and local contract reproduction.
- Location: `apps/web/lib/server/credit/index.ts:16` and `:57`; `packages/contracts/src/CreditPool.sol:172`.
- Scenario: a fresh pool has 75 xMXN cash. The API rounds its offer down to 70, but the 80% utilization cap only permits 60. Existing borrower principal can also consume the attested max because maxAmount is total outstanding principal, not an extra draw allowance.
- Evidence: `test_cashIsNotBorrowCapacity` in `review/contracts/ReviewBoundaries.t.sol` passes by asserting the real pool rejects a valid 70 xMXN signed draw with `ExceedsUtilization(70e6,60e6)` against Tempo's local TIP-20 precompiles.
- Fix: determine current utilization and borrower headroom when sizing a draw; retain the underwriting maximum's outstanding-principal semantics. Prefer a contracts capacity view, or consistent reads of cash, total assets, outstanding principal, limits and borrower principal. Fail closed if required reads fail.

### R-007 — P2 — contracts — MAX withdrawal view can quote an amount that reverts

- Status: OPEN; posted to `@contracts` with an executable boundary probe.
- Location: `packages/contracts/src/CollateralVault.sol:178` versus `:193` and `:199`.
- Scenario: collateral 10 OUSD, debt 14.000007 xMXN, FX 10.5. `maxWithdrawable` returns 7.999999 OUSD; withdrawing it leaves a floor-valued ratio of 14999 bps and reverts. The view rounds once while enforcement first floors FX value.
- Evidence: `test_maxWithdrawableFractionalFxReverts` in `review/contracts/ReviewBoundaries.t.sol` reproduces the exact quote and revert with real local TIP-20 semantics.
- Fix: first compute required xMXN collateral value with ceil(debt × 15000 / 10000), then ceil(value × 1e8 / price). This is a conservative quote correction, not an unsafe withdrawal bypass.

### R-008 — P1 — qa — New stress step can pass without stress or a confirmed restore

- Status: OPEN; posted to `@qa`.
- Location: `scripts/demo-journey.ts` J7 in `a214ba8`: missing-script `return warn(...)` and `paused().catch(() => false)`.
- Scenario: before the stress script exists, J7 returns normally and is recorded PASS. After a run, an RPC failure reading paused becomes false and is accepted as proof that the desk is unpaused. An unrelated liquidation in the block interval can satisfy the unfiltered event check.
- Fix: preserve a missing-script skip/blocked outcome or fail a required run; require successful restoration reads; bind the event to the stress accounts and expected transaction/amounts.

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

## Next pass

Start with `IRC_NICK=review bin/irc unread`, then `git log --stat d730d26..HEAD` and status/diff. Verify remaining findings, contracts tests/deployment, real MPP 402 and recovery, then wallet flows and deck narrative. Preserve completed and failed evidence separately. Lead commits review files; the reviewer does not.
