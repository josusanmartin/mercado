# Mercado: acceptance checklist

Tracks every check from SPEC §6 (plus the §0 journey). `qa` maintains this file. Each row lists who owns it, where it stands, and the evidence: a test name, an explorer link, or a curl transcript.

**Status key:** ⬜ not started · 🟡 in progress / partial · ✅ verified (evidence linked) · ❌ failing (issue filed)

Explorer: https://explore.testnet.tempo.xyz (Tempo Moderato, chain 42431)

## A. SPEC §0 end-to-end journey (on Moderato, `scripts/demo-journey.ts`)

| # | Step | Owner | Status | Evidence |
|---|---|---|---|---|
| J1 | LP deposits testnet OUSD into CollateralVault | contracts / qa | ⬜ | |
| J2 | Vault mints xMXN to LP (6dp TIP-20) | contracts / qa | ⬜ | |
| J3 | Sender swaps OUSD→xMXN on SwapDesk and transfers xMXN to Recipient | contracts / qa | ⬜ | |
| J4 | Driver loads Demo Uber Data, gets a signed, expiring attestation, borrows from CreditPool | api / contracts / qa | ⬜ | |
| J5 | Driver pays Telcel airtime via a real MPP 402 flow in xMXN; response is SIMULATED and carries a receipt | api / qa | ⬜ | |
| J6 | Driver repays; pool shows the repayment and realized fees | contracts / qa | ⬜ | |

## B. SPEC §6 required checks

| # | Check | Owner | Status | Evidence |
|---|---|---|---|---|
| 1 | Contract txs are visible on the Tempo testnet explorer, not only in a simulated UI | contracts / qa | ⬜ | |
| 2 | Only the vault may mint/burn xMXN; deposits can't mint above the configured ratio (150%) | contracts | ⬜ | |
| 3 | Collateral withdrawal can't make a vault unhealthy | contracts | ⬜ | |
| 4 | Stale / zero / negative / outlier prices can't be used for minting or liquidation | contracts | ⬜ | |
| 5 | FX stress: peso appreciation lowers collateralization and liquidation is enforceable | contracts | ⬜ | |
| 6 | Swap can't spend CDP collateral, drain more than seeded reserves, or exceed `minOut` slippage | contracts | ⬜ | |
| 7 | CreditPool borrow fails for invalid signer, expired attestation, replayed nonce, exceeded cap, insufficient liquidity | contracts | ⬜ | |
| 8 | Lenders can't withdraw xMXN that's currently lent out; repayment updates debt correctly | contracts | ⬜ | |
| 9 | MPP endpoint returns a real 402 when unpaid, verifies payment, records one receipt per order; retries can't fulfill twice | api / qa | ⬜ | |
| 10 | Demo data and simulated fulfillment are labeled in both API responses and the frontend | api / web / qa | ⬜ | |
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
| Q-002 | api `/api/driver/score` | Caller chooses profile for any borrower, so any wallet can claim "steady". Mitigated by borrower binding + 1,500 per-user cap; demo-acceptable, disclosed | api / qa | accepted (P3) |
