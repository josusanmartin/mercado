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
| J5 | Driver pays Telcel airtime via a real MPP 402 flow in xMXN; response is SIMULATED and carries a receipt | api / qa | 🟡 pull ✅ / push ❌ | Pull: 402 → [100 xMXN driver→merchant](https://explore.testnet.tempo.xyz/tx/0x10ff16340ab60d9e4e68917f7734495f3cc4b4bd390078149889f6d2680fa00e) → 200 + Payment-Receipt, ref TLC-20261014-34921529, idempotent retry, history CREATED→PAYMENT_VERIFIED→FULFILLED_SIMULATED. Push: paid but settled only via recovery fallback, no Payment-Receipt (reported to api) |
| J6 | Driver repays; pool shows the repayment and realized fees | contracts / qa | ✅ | [repay 510 xMXN](https://explore.testnet.tempo.xyz/tx/0x27c0f92d5b74a1fd1e7e3f0ba467bfa3e06e314b8fa68f15ec9b80e30dfc6ddb): debt → 0, outstanding 500 → 0, realized fees 0 → 10 xMXN, lender claim 10,010 |
| J7 | FX stress, run last: on-chain liquidation, then full restore + health re-check | contracts / qa | ✅ | see check 5 |

## B. SPEC §6 required checks

| # | Check | Owner | Status | Evidence |
|---|---|---|---|---|
| 1 | Contract transactions are visible on the Tempo testnet explorer, not only in a simulated UI | contracts / qa | ✅ | Every J1–J6 row above links a Moderato explorer tx; full run log in `scripts/evidence/` |
| 2 | Only the vault may mint/burn xMXN; deposits can't mint above the configured ratio (150%) | contracts | 🟡 | On-chain (journey J2, sim): over-max mint → `RatioTooLow`; direct `xMXN.mint` by LP → TIP-20 `Unauthorized`. Foundry `Vault.t.sol` 18/18 pass (verified by review) |
| 3 | Collateral withdrawal can't make a vault unhealthy | contracts | ⬜ | |
| 4 | Stale / zero / negative / outlier prices can't be used for minting or liquidation | contracts | 🟡 | Live J0 sims on the deployed oracle: `setPrice(0)` → `InvalidPrice`, 60 MXN/USD → `PriceOutOfBand`, +30% jump → `PriceJumpTooLarge`, non-owner → `OwnableUnauthorizedAccount`; uint256 makes negative prices unrepresentable. Stale/paused → revert in `price()` covered by Foundry `FXStress.t.sol` |
| 5 | FX stress: peso appreciation lowers collateralization and liquidation is enforceable | contracts | ✅ | Live J7 (`StressDemo.s.sol`): 160% position, mock oracle force-set 20 → 13, [liquidated: 1,250 xMXN covered, 100 OUSD seized](https://explore.testnet.tempo.xyz/tx/0x85d0e1c9db14b55490c2525ecb3ca0170ccbc7d8efe33baad509e94073e4f67e); oracle restored to 20, desk unpaused, demo LP stayed at 300% |
| 6 | Swap can't spend CDP collateral, drain more than seeded reserves, or exceed `minOut` slippage | contracts | 🟡 | Live J3: vault OUSD balance unchanged across a swap, minOut enforced. Foundry `Swap.t.sol` (67/67 suite pass, review-verified). Per-address cap pending live check |
| 7 | CreditPool borrow fails for invalid signer, expired attestation, replayed nonce, exceeded cap, insufficient liquidity | contracts | 🟡 | Live J4 sims on the deployed pool: tampered sig → `InvalidSigner`, expired → `AttestationExpired`, over max → `ExceedsAttestedMax`, replay → `NonceAlreadyUsed`. Liquidity/utilization covered in Foundry `LoanAttestation.t.sol` |
| 8 | Lenders can't withdraw xMXN that's currently lent out; repayment updates debt correctly | contracts | 🟡 | Live J4/J6: debt 0 → 510 → 0, outstanding returns to 0, fees realized. Lent-out withdrawal block covered in Foundry tests (live sim pending) |
| 9 | MPP endpoint returns a real 402 when unpaid, verifies payment, records one receipt per order; retries can't fulfill twice | api / qa | 🟡 | Live J5 pull: real `WWW-Authenticate: Payment` 402, on-chain verified transfer, same order/reference on retry, merchant not charged twice. Push-mode primary verification failing (see J5) |
| 10 | Demo data and simulated fulfillment are labeled in both API responses and the frontend | api / web / qa | 🟡 API ✅ | API: `demo:true` + "Demo Uber Data" (driver/score), `simulated:true` + "SIMULATED fulfillment, no real top-up" (quote/pay), fx `isMock`. Frontend: Playwright smoke pending UI |
| 11 | README discloses: testnet prototype, not a real credit product or a redeemable fiat stablecoin | qa | 🟡 | `README.md` § Disclosures |

## C. Pass D robustness (UI / ops)

| # | Check | Owner | Status | Evidence |
|---|---|---|---|---|
| D1 | Playwright smoke test covers every tab | qa / web | ⬜ | |
| D2 | Mobile layout (~390px) usable on every tab | web | ⬜ | |
| D3 | Readable errors: insufficient liquidity, stale oracle, wrong network, revert reasons | web | ⬜ | |
| D4 | Persistent "testnet prototype" banner; mock-oracle and "Testnet OUSD (no real value)" labels visible | web | ⬜ | |

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
