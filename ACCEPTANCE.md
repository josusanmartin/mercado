# Mercado: acceptance checklist

Tracks every check from SPEC §6 (plus the §0 journey). `qa` maintains this file. Each row lists who owns it, where it stands, and the evidence: a test name, an explorer link, or a curl transcript.

**Status key:** ⬜ not started · 🟡 in progress / partial · ✅ verified (evidence linked) · ❌ failing (issue filed)

Explorer: https://explore.testnet.tempo.xyz (Tempo Moderato, chain 42431)

## Final status (14 Oct 2026, 03:20 UTC): v2 live on :3100, six products

| Area | Status | Evidence |
|---|---|---|
| SPEC §6 required checks 1–11 | ✅ 11/11 | §B below (v1 evidence; the same properties hold on v2 per §F) |
| Contracts | ✅ 141/141 Foundry tests, 10 suites | `scripts/evidence/forge-test.txt` |
| Source verification | ✅ every v1 + v2 contract `exact_match/exact_match` on Tempo's Sourcify (`contracts.tempo.xyz`), checked by qa 03:17 UTC | links in `README.md` |
| v2 journey (six products) | ✅ V0–V10 + VS green on Moderato | §F below, `scripts/evidence/v2-run-*.json` |
| Post-flip HTTP check (:3100 = v2) | ✅ attestation bound to pool v2, bills + underwriter 402s in xMXN v2 | §E (V2) |
| Mocks only where necessary | ✅ qa (`check-mocks.ts` PASS); review re-audit requested; G3 (v2 /mint OUSD $1 wording) reopened → contracts | `MOCKS.md` |
| Indexer = chain | ✅ minted − burned == totalSupply (v1 + v2) | §E (IX) |
| Crash/restart safety (bills) | ✅ | §A2 (X3) |
| Spending-proof hero video | ✅ 39.2 s on the v5 skin (dark), real txs, Javier everywhere | §F (F9), `deck/assets/hero-spend-final.mp4` |
| UI e2e (6 products, honesty, redirects, mobile) | 🟡 most green; open: /remesas desktop overflow, mobile Demo-mode control | §C |

## A. SPEC §0 end-to-end journey: v1, pre-flip (`scripts/demo-journey.ts`)

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

## E. v0.2 (josu's rules and the v2 switch gate)

| # | Check | Owner | Status | Evidence |
|---|---|---|---|---|
| M1 | Mock only what's necessary: every remaining mock is listed in `MOCKS.md` (what / why / where labeled) and `scripts/check-mocks.ts` passes | qa / all | ✅ (qa) · review re-audit requested | Scanner PASS on the 6-product app, §C gaps G1–G6 all closed. Mocks: Uber/DiDi/Rappi demo data + simulated consent, Telcel/CFE fulfillment, sOUSD mock yield, tTBILL admin price (gated issuance, real InvestDesk trades), card network/PAN, card on-ramp checkout (simulated, currently disabled) |
| IX | Activity indexer (getLogs) is complete and correct | contracts / qa | ✅ | `scripts/check-indexer.ts` on v1 and v2: minted − burned == totalSupply (68,650 / 745,661.61), Σ Borrowed == totalBorrowed, lent − repaid + fees == outstanding, sampled txs succeeded, no duplicate rows |
| V2 | `PROTOCOL=v2` journey green end to end (V2-SWITCH gate) | qa / contracts / api | ✅ | Gate passed; lead flipped :3100 to v2 at 02:37 UTC. `scripts/demo-journey-v2.ts` V0–V10 + VS: Create (sOUSD, tTBILL via InvestDesk), Move (mint-to-recipient, redeem), Lend/Spend/Repay on pool v2, underwriter bot over HTTP, Card (issue, limit, tap auth, frozen decline + retry, charge, refund), Invest (pool supply, sOUSD, T-bill buy/sell), stress liquidation + restore. Post-flip HTTP check on :3100 green |

## F. v2 live: six products, one currency (`PROTOCOL=v2 npx tsx scripts/demo-journey.ts`)

All at the relayed USD/MXN (~18.37). Every step asserts the supply identity `xMXN.totalSupply == Σ vault debt + AMM liability` after each mint/burn, and every negative check is a simulation that must revert with the exact custom error.

| # | Product · step | Status | Evidence |
|---|---|---|---|
| F1 | **Mint**: stake OUSD → sOUSD (demo), mint xMXN v2 at 250% on the deposit; over-mint / over-withdraw → `RatioTooLow`, non-issuer mint → `Unauthorized` | ✅ | [stake](https://explore.testnet.tempo.xyz/tx/0x5c5d41b751160138c31bdf1afd5f06b7eae9937ebf3576e8033a41057cbc762f), [mint 1,469.97](https://explore.testnet.tempo.xyz/tx/0xaef469ee31baca15a225d5b79d36efeeeefbe47ba3391c9f330e2d4b63df17be) |
| F2 | **Mint**: tTBILL (demo RWA, gated issuance, bought on InvestDesk) at 300%; independent positions | ✅ | [deposit](https://explore.testnet.tempo.xyz/tx/0x3c1c69ef10f813574f33f39862e054efa849f739313ca1a0d1400b07fa1f1b9b), [mint 6,124.15](https://explore.testnet.tempo.xyz/tx/0x162a99ffb489e8e499d50efb455b295b62059ab262aebc9632bb96c6f7363e1c) |
| F3 | **Remesas/Global**: 50 OUSD → xMXN v2 **minted straight to the recipient** in one tx (Transfer from 0x0); Slippage / SwapTooLarge sims | ✅ | [50 OUSD → 916.55 xMXN to Rosa](https://explore.testnet.tempo.xyz/tx/0x3829f78ed58a67fb0182afed88360afad1be03f3d2def1fda4dcb2c13cf15e31) |
| F4 | **Global**: redeem 200 xMXN v2 → OUSD (burned); ExceedsLiability sim; 24h bucket recorded | ✅ | [redeem 200 → 10.86 OUSD](https://explore.testnet.tempo.xyz/tx/0x61d4f51e63f85c9e9b46ada4cdb9f030d1450172e3e8fe0c170ecf0ec1d54fdb) |
| F5 | **Crédito**: attestation (api credit service) bound to CreditPool v2 → borrow; tampered sig / replay sims | ✅ | [borrow 500](https://explore.testnet.tempo.xyz/tx/0xbb9f6edeea5275c4997c6f052f50a26922dcdabd2e0b785178ba86557ab0cb33), [repay 510, fees realized](https://explore.testnet.tempo.xyz/tx/0xcc9b79f6216e1782629429466288da208714d053792256178f2f71a6868de2b8) |
| F6 | **Spend (MPP)**: Telcel 402 paid in xMXN v2 → SIMULATED top-up; idempotent retry | ✅ | [100 xMXN v2 → merchant](https://explore.testnet.tempo.xyz/tx/0x625b5bc111d0ef59f4cb3d2e5b9c4ceecddd4a4074c539101bd99f876820f69e) |
| F7 | **Agents (MPP)**: underwriter bot over real HTTP on :3100, 402 → 2 xMXN v2 → report + Payment-Receipt; no attestation leaked | ✅ | [2 xMXN v2](https://explore.testnet.tempo.xyz/tx/0xe560865f15ac4d253d28d44a1f481f797702ae3917f205e095fb0b278ca122ce) |
| F8 | **Card**: issue → set limit → holder EIP-712 tap → terminal charge → refund. Sims: wrong signer / raised amount → `BadTapSignature`, non-merchant → `NotMerchant`, expired → `TapExpired`, over limit → `OverDailyLimit`, non-holder freeze/limit → `NotHolder`, frozen → `CardIsFrozen`, replay → `TapReplayed`, over-refund → `RefundTooLarge` | ✅ | [issue](https://explore.testnet.tempo.xyz/tx/0x2d44d537ac81950a39af8fe2cdfdfea16cf088c94f6047f7b71a3032b8d39b05), [limit](https://explore.testnet.tempo.xyz/tx/0xd0e0f9ddb8bcbecc6a93391c47deecb875528c57f9d4b06ce4d3371406155bda), [freeze](https://explore.testnet.tempo.xyz/tx/0x37d728bc084c80cae3dc2d2e9f135dbc54168021e35d5a15f3804aba1765a0d5), [unfreeze](https://explore.testnet.tempo.xyz/tx/0x4b1733e8022b7aec7d40eae47ead572700e84f96d2b6227819843e3582e8fd38), [charge 50](https://explore.testnet.tempo.xyz/tx/0x93b1f73b4cd807081aed5b9d482b49e432aa22e33ed9e9e3a6b0315b86d8e18f) |
| F9 | **Spending proof in the real UI** (judge item 2): Javier (same name in the driver app and on the card) draws 375 → Card tap declined while frozen ("Tarjeta congelada", nothing charged) → Cerrar → unfreeze → charged exactly once → receipts on the terminal + phone, "Adelanto pendiente / Debes 382.50" | ✅ | `deck/assets/hero-spend-final.mp4` (39.2 s, v5 take 07:06 UTC, dark, first 2.4 s of page load trimmed); [draw](https://explore.testnet.tempo.xyz/tx/0x248cefa64643e1a5bc8ab3f88db1362f8c7597824ecbf8645832277ab454fdc3), [freeze](https://explore.testnet.tempo.xyz/tx/0x7ebd4430600537368156009363ab1598d5316b7a18df53d478fcb93545e4cdbd), [unfreeze](https://explore.testnet.tempo.xyz/tx/0x3ea143230d4cb7c5dcbf89cb71e51eba75270a131c68fb14d70a17117527814a), [charge #34, 150](https://explore.testnet.tempo.xyz/tx/0x2d85c8503d369e42da33f2a4c228d95dc6a9ede0bdb534451f2db968b09879ed). Previous v4 take (03:24, charge #7) archived as `deck/assets/archive/hero-spend-v4.*` |
| F10 | **Invest**: supply 100 xMXN v2 to the pool (realized fees only), stake 50 OUSD → sOUSD, buy tTBILL with 100 OUSD and sell half back; Slippage / TradeTooLarge / ExceedsBoughtBalance sims (R-042 drain closed) | ✅ | [supply](https://explore.testnet.tempo.xyz/tx/0x5104aa9cc83501747d1c228da8ca47de59e5bfe1b5dd524f91d5d657d3deec79), [stake](https://explore.testnet.tempo.xyz/tx/0xf7de9bcb5a472c0aa8dbfa905b88940eda0b8cbd60ae4a09924837779bbcd5fb), [buy](https://explore.testnet.tempo.xyz/tx/0xbf55024bbc508b9cd7ec81b9f5ef053ab8b2bf0b6c5c8be53513d9e01cfabc3d), [sell](https://explore.testnet.tempo.xyz/tx/0x260653a81aa48e3c21f44f0a5f1af9f792ca2d974c3fed0e881dd43ff1029ac4) |
| F11 | **Risk**: StressDemoV2 forces −30% FX, AMM coverage 307% → 215%, a 160% v2 position is liquidated, then the price is restored and AMM + desk unpaused | ✅ | [liquidation](https://explore.testnet.tempo.xyz/tx/0xa0ca227ab323b30ed745379fb3038899b74f1954aa2e2191ee482eb52e61b6d0) |

## C. Pass D robustness (UI / ops)

| # | Check | Owner | Status | Evidence |
|---|---|---|---|---|
| D6 | Spending-proof hero (Card, v2 UI) | qa / mobile / mobile2 | ✅ | §F (F9) |
| D5 | Hero recording: driver advance → 402 bill payment → receipt + remaining debt, in a real browser | api / qa | ✅ | `apps/web/e2e/hero.spec.ts` → `deck/assets/hero-driver.mp4` (48s, real testnet txs) |
| D1 | Playwright smoke covers every product route | qa / web | ✅ | `ecosystem.spec.ts`: 6 products + home, honesty footer, redirects (/credit, /earn, /pay, /send), Crédito tabs, /card + /invest labels, no runtime errors (desktop + Pixel 7 + exact 390px) |
| D2 | Mobile layout usable | web / mobile | 🟡 | Remesas full-screen at 390px with no overflow; open: /remesas desktop 11px overflow, mobile Demo-mode control not visible |
| D3 | Readable errors (frozen card, over limit, expired tap, coverage, slippage, stale oracle, wrong network) | contracts / web | ✅ | `readableError()` maps v2 custom errors Spanish-first (e.g. "Tarjeta congelada · Card is frozen…"), visible in `hero-spend-final-declined.png` |
| D4 | Persistent honesty footer + per-product labels | web | ✅ | Footer "Testnet prototype · sin valor real · OUSD has no real value · xMXN is not redeemable for pesos" on every route (e2e); per-product mock badges |

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
| Q-011 | contracts v2 `MultiCollateralVault.maxMintable` | ~~Ignores debt-ceiling headroom~~. Withdrawn: maxMintable already returns min(ratio, ceiling) headroom (326,667), so MAX+1 → `DebtCeilingExceeded` is correct | contracts | withdrawn (qa error) |
| Q-002 | api `/api/driver/score` | Caller chooses profile for any borrower, so any wallet can claim "steady". Mitigated by borrower binding + 1,500 per-user cap; demo-acceptable, disclosed | api / qa | accepted (P3) |
