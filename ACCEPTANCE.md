# Mercado: acceptance checklist

Tracks every check from SPEC §6 (plus the §0 journey). `qa` maintains this file. Each row lists who owns it, where it stands, and the evidence: a test name, an explorer link, or a curl transcript.

**Status key:** ⬜ not started · 🟡 in progress / partial · ✅ verified (evidence linked) · ❌ failing (issue filed)

Explorer: https://explore.testnet.tempo.xyz (Tempo Moderato, chain 42431)

## A. SPEC §0 end-to-end journey (on Moderato, `scripts/demo-journey.ts`)

| # | Step | Owner | Status | Evidence |
|---|---|---|---|---|
| J1 | LP deposits testnet OUSD into CollateralVault | contracts / qa | ✅ | [depositCollateral 1,000 OUSD](https://explore.testnet.tempo.xyz/tx/0xe41f969e78ea0d29ab4d104f64dc5ca548619bf2f984aec7a77f496b6eae0355) |
| J2 | Vault mints xMXN to LP (6dp TIP-20) | contracts / qa | ✅ | [mint 13,333.33 xMXN → LP at 300.0%](https://explore.testnet.tempo.xyz/tx/0x701df8a6761f0d23bb302e8992b305e3dfa182edb7eef60668da906dca3c57eb); totalSupply grew by exactly the debt |
| J3 | Sender swaps OUSD→xMXN on SwapDesk and transfers xMXN to Recipient | contracts / qa | ✅ | [swap 50 OUSD → 995 xMXN](https://explore.testnet.tempo.xyz/tx/0xeb08956246c14a7ff23b628ae0eb18b103b2f910b7ab2bea4f4f15b7f37a76d3) (minOut 990.03; vault collateral unchanged), [transfer 995 xMXN → Recipient](https://explore.testnet.tempo.xyz/tx/0xc86a194befe0c1abc17923ee7b6e6fd8435e4a81f3bbdfe2a147a141c3cc396a) |
| J4 | Driver loads Demo Uber Data, gets a signed, expiring attestation, borrows from CreditPool | api / contracts / qa | ✅ | steady profile score 96.5, credit line 1,500; [borrow 500 xMXN](https://explore.testnet.tempo.xyz/tx/0x15e9ad6a3e0cb2f974cab113a5d8744755463b3f662214081216db4f3e950bf1), debt 0 → 510 (2% fee) |
| J5 | Driver pays Telcel airtime via a real MPP 402 flow in xMXN; response is SIMULATED and carries a receipt | api / qa | ✅ | Full J0–J7 run: pull [100 xMXN](https://explore.testnet.tempo.xyz/tx/0x17dd0edd81d2314f62898f4f7f9a6f5000f1bcb0102d94bff30eba7951106a7a), push [100 xMXN](https://explore.testnet.tempo.xyz/tx/0x97f7f7318e0015d8beb59b743e4eec243fa1ee50970f5d4528a57c7089ea1544): each 402 → on-chain transfer → 200 + Payment-Receipt → FULFILLED_SIMULATED, idempotent retry (merchant delta = 1×). Provider failure (phone …0000): [paid](https://explore.testnet.tempo.xyz/tx/0x870fa89d344b4836984e138253dab8364c8d2d4e5b6037c54ee9f30e242f760d) → FAILED, `paidButUnfulfilled: true` |
| J6 | Driver repays; pool shows the repayment and realized fees | contracts / qa | ✅ | [repay 510 xMXN](https://explore.testnet.tempo.xyz/tx/0x27c0f92d5b74a1fd1e7e3f0ba467bfa3e06e314b8fa68f15ec9b80e30dfc6ddb): debt → 0, outstanding 500 → 0, realized fees 0 → 10 xMXN, lender claim 10,010 |
| J7 | FX stress, run last: on-chain liquidation, then full restore + health re-check | contracts / qa | ✅ | see check 5 |

## B. SPEC §6 required checks

| # | Check | Owner | Status | Evidence |
|---|---|---|---|---|
| 1 | Contract transactions are visible on the Tempo testnet explorer, not only in a simulated UI | contracts / qa | ✅ | Every J1–J6 row above links a Moderato explorer tx; full run log in `scripts/evidence/` |
| 2 | Only the vault may mint/burn xMXN; deposits can't mint above the configured ratio (150%) | contracts | ✅ | Live J2 sims: over-max mint → `RatioTooLow`, direct `xMXN.mint` by LP → TIP-20 `Unauthorized`. Foundry (real TIP-20 precompiles, network=tempo): `test_onlyVaultCanMint`, `test_onlyVaultCanBurn`, `test_factoryCreatesXmxnWithVaultAsOnlyIssuer`, `test_cannotMintAboveRatio`, `test_cumulativeMintsRespectRatio`, `testFuzz_mintNeverExceedsRatio`. `scripts/evidence/forge-test.txt` (67/67) |
| 3 | Collateral withdrawal can't make a vault unhealthy | contracts | ✅ | Live J2 sim: `withdrawCollateral(maxWithdrawable + 1 unit)` → `RatioTooLow`. Foundry: `test_withdrawCannotMakeUnhealthy`, `testFuzz_withdrawKeepsHealthy`, `test_maxWithdrawableIsExecutable_R007`, `testFuzz_maxWithdrawableIsExact`. `scripts/evidence/forge-test.txt` (67/67) |
| 4 | Stale / zero / negative / outlier prices can't be used for minting or liquidation | contracts | ✅ | Live J0 sims on the deployed oracle: zero → `InvalidPrice`, 60 MXN/USD → `PriceOutOfBand`, +30% → `PriceJumpTooLarge`, non-owner → `OwnableUnauthorizedAccount` (uint256 makes negatives unrepresentable). Foundry: `test_staleBlocksMintWithdrawLiquidate`, `test_pausedBlocksMintAndLiquidate`, `test_zeroPriceRejected`, `test_outOfBandRejected`, `test_outlierJumpRejected`, `test_staleOracleBlocksSwaps`, `test_repayWorksWhileOracleStale`. `scripts/evidence/forge-test.txt` (67/67) |
| 5 | FX stress: peso appreciation lowers collateralization and liquidation is enforceable | contracts | ✅ | Live J7 (`StressDemo.s.sol`): 160% position, mock oracle force-set 20 → 13, [liquidated: 1,250 xMXN covered, 100 OUSD seized](https://explore.testnet.tempo.xyz/tx/0x85d0e1c9db14b55490c2525ecb3ca0170ccbc7d8efe33baad509e94073e4f67e); oracle restored to 20, desk unpaused, demo LP stayed at 300% |
| 6 | Swap can't spend CDP collateral, drain more than seeded reserves, or exceed `minOut` slippage | contracts | ✅ | Live J3: vault OUSD balance unchanged across a real swap; sims on the deployed desk: minOut above quote → `Slippage`, 600 OUSD (>10k xMXN) → `SwapTooLarge`; per-address 24h cap live (`remainingDailyCap` 1,900 OUSD after a 100 OUSD swap). Reserves are tracked internally (Foundry `Swap.t.sol`, 67/67 suite) |
| 7 | CreditPool borrow fails for invalid signer, expired attestation, replayed nonce, exceeded cap, insufficient liquidity | contracts | ✅ | Live J4 sims on the deployed pool: tampered sig → `InvalidSigner`, expired → `AttestationExpired`, over max → `ExceedsAttestedMax`, replay → `NonceAlreadyUsed`; liquidity/utilization caps in Foundry `LoanAttestation.t.sol` (67/67, review-verified) |
| 8 | Lenders can't withdraw xMXN that's currently lent out; repayment updates debt correctly | contracts | ✅ | Live J4: with 500 lent out, LENDER `withdrawAvailable(idle cash + 1)` → `InsufficientLiquidity`. Live J4/J6: debt 0 → 510 → 0, outstanding returns to 0, fees realized |
| 9 | MPP endpoint returns a real 402 when unpaid, verifies payment and records one receipt per order; retries can't fulfill twice | api / qa | ✅ | Live J5 (pull + push + failure): `WWW-Authenticate: Payment` 402 bound to order, on-chain transfer from driver to merchant equals the quote, one receipt per order, retry returns the same order/reference with no second debit; history checked. Concurrency/recovery (R-005/R-009/R-011) covered by api vitest (37) + review probes |
| 10 | Demo data and simulated fulfillment are labeled in both API responses and the frontend | api / web / qa | ✅ | API: `demo:true` + "Demo Uber Data" (driver/score), `simulated:true` + "SIMULATED fulfillment, no real top-up" (quote/pay), fx `isMock`. Frontend (Playwright `apps/web/e2e/smoke.spec.ts`, desktop + Pixel 7): visible footer "Testnet prototype · OUSD has no real value · xMXN is not redeemable" on every tab, Demo Uber Data + "illustrative" on /credit, SIMULATED on /pay, mock oracle on /mint, "No guaranteed return" on /earn. Receipt still: `deck/assets/hero-driver-receipt.png` |
| 11 | README discloses: testnet prototype, not a real credit product or a redeemable fiat stablecoin | qa | ✅ | `README.md` § Disclosures, reviewed and passed by `review` at 78e353f |

## A2. Extras (beyond SPEC §0)

| # | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| X1 | Machine-to-machine MPP: a fresh third-party agent wallet buys an underwriting report from the paid `/api/driver/score?access=underwriter` (402 → 2 xMXN → report + Payment-Receipt; no attestation leaked) | api / qa | ✅ | `scripts/underwriter-agent.ts`, transcript `scripts/evidence/underwriter-agent.txt`, [payment tx](https://explore.testnet.tempo.xyz/tx/0xbae8c938a550c95c5295203d7bfed526fd5a010768fb7f8c29b01f5d6f46683a) |
| X2 | Fee sponsorship: a wallet with zero fee tokens transacts via `/api/sponsor` | contracts | ✅ | [approve paid by sponsor](https://explore.testnet.tempo.xyz/tx/0xb2be0921e163201457a9a86286785e38f93fdb3b60c06e4714203bf6116a67b7) |
| X3 | Bills crash/restart safety: server SIGKILLed mid-settle, restarted on the same state | api / qa | ✅ | `scripts/bills-crash-proof.ts` (real bills service in a child process, own state files, real Moderato settlement). **A** killed right after broadcast, before PAYMENT_VERIFIED: a plain retry recovers [the tx](https://explore.testnet.tempo.xyz/tx/0x88501f18e3ca060b1f0de8b1fef215bc83b3be182f4112c1f4e827317f1eda70) from chain → FULFILLED_SIMULATED, no new 402, 1 charge, 1 fulfillment. **B** killed after the attempt persisted, before broadcast: retry → 409 SETTLEMENT_PENDING, nothing charged; after the hold, a fresh 402 is [paid once](https://explore.testnet.tempo.xyz/tx/0x98a2c0e64b915a7d5401c558437338e160836e8894daabaac8ef62abc8c1ccad). Transcript + order stores: `scripts/evidence/crash-proof/` |

## C. Pass D robustness (UI / ops)

| # | Check | Owner | Status | Evidence |
|---|---|---|---|---|
| D5 | Hero recording: driver advance → 402 bill payment → receipt + remaining debt, in a real browser | api / qa | ✅ | `apps/web/e2e/hero.spec.ts` → `deck/assets/hero-driver.mp4` (48s, real testnet txs) |
| D1 | Playwright smoke test covers every tab | qa / web | ✅ | `smoke.spec.ts`: 26/27 pass (desktop + mobile, every tab, labels, no runtime errors, API 402/400 checks) |
| D2 | Mobile layout (~390px) usable on every tab | web | 🟡 | Pixel 7: no overflow on 5/6 tabs; /send overflows by 3px (reported to web) |
| D3 | Readable errors: insufficient liquidity, stale oracle, wrong network, revert reasons | web | ⬜ | |
| D4 | Persistent "testnet prototype" banner; mock-oracle and "Testnet OUSD (no real value)" labels visible | web | ✅ | Console footer/hint bar on every tab, desktop + mobile (smoke.spec) |

## D. Adversarial review log

Findings from `qa`'s contract and API review. Each one is posted to the owner in #mercado.

| ID | Area | Finding | Owner | Status |
|---|---|---|---|---|
| Q-001 | api `lib/server/fx.ts` | FX fallback reports `updatedAt=now` when the on-chain oracle is stale/paused, so it looks fresh | api | open (P2) |
| Q-003 | contracts SwapDesk + OUSD | Faucet OUSD is free, so desk xMXN reserves can be drained (10k/swap, unlimited swaps) before a demo | contracts / lead | open (P2) |
| Q-004 | contracts `CollateralVault.liquidate` | Insolvent liquidation leaves phantom debt with 0 collateral; no close factor | contracts | noted (P3) |
| Q-005 | collateral OUSD | Third-party issuer controls OUSD transfer policy/pause, so collateral could be frozen; disclosed in README | qa | disclosed (P3) |
| Q-006 | contracts oracle/desk ops | On-chain FX stress on the shared oracle reprices the desk (xMXN→OUSD drain) and makes ≤207% positions liquidatable; restoring needs `forceSet` | contracts | open (P2) |
| Q-007 | contracts `CreditPool` | Share price excludes unrealized fees (JIT lender captures fees); no default/write-off | contracts | noted (P3) |
| Q-008 | web / `CreditPool.stats()` | `totalSupplied` is really totalAssets (cash + lent), so label it "lender claims" | web | open (P3) |
| Q-009 | api `bills/service.ts` payLocked | CREATED orders can be paid after quote expiry (stale interim FX) | api | open (P3) |
| Q-010 | api bills store | File store + in-process locks aren't serverless-safe; demo runs on a local single process (README note) | api / qa | disclosed (P3) |
| Q-002 | api `/api/driver/score` | Caller chooses profile for any borrower, so any wallet can claim "steady". Mitigated by borrower binding + 1,500 per-user cap; demo-acceptable, disclosed | api / qa | accepted (P3) |
