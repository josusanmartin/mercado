# Mocks register

josu's rule: **mock only what's necessary, wire everything we can.** This file is the complete list of what is *not* real in Mercado. Each entry says why it can't be real on testnet and where it's labeled for users. Anything else the app shows (balances, KPIs, charts, activity tables, receipts, volumes, coverage, pool stats, quotes, fees) must be read from chain (contract views and event logs) or our own real API state.

**Enforcement:** `npx tsx scripts/check-mocks.ts` fails if code contains a mock/fixture/hardcoded-data marker in a file that isn't listed in the **Code** column below, or a hardcoded numeric value rendered as data in a UI row. `ACCEPTANCE.md` check **M1** requires it to pass. Owner: `qa`. `review` audits it against the code (`review/MOCK-AUDIT.md`).

## A. Allowed mocks (external dependencies we truly can't reach on testnet)

| # | Mock | Why it can't be real | Where it's labeled | Code |
|---|---|---|---|---|
| A1 | **Uber earnings data**: 3 driver profiles (steady / irregular / new-driver), 8–12 weeks each | Real data needs driver OAuth with Uber's restricted `partner.*` scopes and commercial approval | "Demo Uber Data" badge on Crédito; `demo: true` + `label` in `/api/driver/demo` and `/api/driver/score` | `fixtures/uber/*.json`, `apps/web/lib/server/credit/provider.ts`, `apps/web/app/api/driver/demo/route.ts` |
| A2 | **Uber OAuth adapter**: a stub that documents the scopes and throws | Same as A1 | Copy on Crédito ("A real integration would use driver OAuth…") | `apps/web/lib/server/credit/provider.ts` |
| A3 | **Telcel airtime / CFE bill fulfillment**: mock providers return a reference; phones ending `0000` simulate a provider failure | Real top-ups need a contracted aggregator (e.g. Arcus) with fiat working balances | `SIMULATED` badge and "SIMULATED fulfillment, no real top-up" on quote, stepper, receipt and history; `simulated: true` in API responses | `apps/web/lib/server/bills/providers.ts`, `apps/web/components/billpay/*` |
| A4 | **Arcus aggregator adapter**: a stub | No commercial onboarding | Code comment only (never shown as working) | `apps/web/lib/server/bills/providers.ts` |
| A5 | **sOUSD yield**: admin-set APR (≤20%), paid from an OUSD reserve the owner pre-funds | No real staked-OUSD product on Moderato | Token name "Demo staked OUSD (mock yield, testnet)"; Mint collateral picker ("mock APR, admin-set") | `packages/contracts/src/v2/StakedOUSD.sol`, `apps/web/lib/v2/collaterals.ts` |
| A6 | **tTBILL (and tEQX) price**: admin price feed; the tokens themselves are demo ERC-20s with a capped faucet | No tokenized T-bill/equity issuer on Moderato | "Demo tokenized T-bill (testnet, not a security)" in the manifest, the feed `label()` and the Mint picker | `packages/contracts/src/v2/DemoRWA.sol`, `packages/contracts/src/v2/AdminPriceFeed.sol`, `apps/web/lib/v2/collaterals.ts` |

## B. Testnet constructs that are real code but not market reality (disclosed, not hidden)

| # | Item | Why | Where it's labeled | Code |
|---|---|---|---|---|
| B1 | **MXN/USD oracle**: an admin-controlled `FXOracleAdapter` (`isMock() == true`). Being upgraded to an *admin-relayed* reference rate from a public FX API (contracts). The stress demo uses `forceSet` + restore | No verified USD/MXN feed on Moderato. A relayed daily reference rate isn't tick-level market data or a decentralized oracle | "Mock admin oracle" badge on Mint/Remesas/Global. Must show **source rate date · fetch time · on-chain update time** once relayed. `/api/fx` returns `isMock`, `source`, `label` | `packages/contracts/src/FXOracleAdapter.sol`, `apps/web/lib/server/fx.ts`, `apps/web/components/shell/labels.tsx`, `apps/web/components/vault/*`, `apps/web/components/transfer/*`, `apps/web/lib/server/move/quote.ts` |
| B2 | **OUSD valued at exactly $1.00** (`FixedPriceFeed`) in v2 collateral math | Testnet OUSD has no market. A fixed price is an assumption | On-chain `label()`. ⚠ **Not yet shown in the UI** (gap G3) | `packages/contracts/src/v2/FixedPriceFeed.sol`, `apps/web/lib/vault-math.ts` |
| B3 | **Credit score**: a deterministic heuristic with fake underwriting parameters | No validated credit model (out of scope, needs a regulated lender) | "Illustrative score, not a credit model" on Crédito and in every score response | `apps/web/lib/server/credit/score.ts` |
| B4 | **Demo personas / Demo mode**: throwaway testnet keys that auto-map each product to a role account | One-click demo without wallet setup | "Testnet demo keys, no real value" in the wallet/Demo mode UI | `apps/web/components/wallet/*` |
| B5 | **Repayment top-ups in scripts**: the LP sends the driver xMXN to repay | There's no real Uber payout to repay from | Journey log: "stand-in for next week's earnings" | `scripts/demo-journey*.ts` |
| B6 | **Mock-rate notes in copy**: the peso-appreciation slider and "≈ USD at the mock rate" | Preview math on the user's real position at hypothetical/mock rates; never writes the oracle | "mock scenario" / "mock rate" in the copy | `apps/web/components/vault/peso-slider.tsx`, `apps/web/components/home/*` |

Not mocks (real): every balance, position, ratio, quote, fee, reserve, coverage and pool stat (contract views); activity tables and flow counters (event logs via the contracts indexer); bill orders and MPP receipts (real 402 + on-chain verification, `.data/` order store); paid-API ledger (`apps/web/lib/mpp/ledger.ts`, recorded on verified payment). Fixed protocol parameters (ratios, fees, caps) are contract constants or owner-set values and should be *read* from chain where the UI shows them.

## D. Label and plumbing locations (carry the labels above; not mocks themselves)

| Mock(s) | Files |
|---|---|
| A1–A3, B3 labels in Crédito / Pay / tour | `apps/web/components/credit/credit-screen.tsx`, `apps/web/components/credito/`, `apps/web/components/earn/earn-screen.tsx`, `apps/web/components/tour/demo-tour.tsx`, `apps/web/components/ui/badge.tsx` (the `mock` badge variant) |
| A3 bills API + order state | `apps/web/app/api/bills/pay/route.ts`, `apps/web/app/api/bills/quote/route.ts`, `apps/web/lib/server/bills/service.ts` |
| B1 oracle flags/labels | `apps/web/app/api/fx/route.ts`, `apps/web/lib/contracts/reads.ts`, `apps/web/lib/contracts/errors.ts`, `packages/contracts/src/interfaces/IFXOracleAdapter.sol`, `packages/shared/src/protocol.ts` |
| Shared schemas/types for the flags (`simulated`, `isMock`, `demo`, fixture shape) | `packages/shared/src/schemas.ts`, `packages/shared/src/types.ts` |
| The wiring rule itself (comment) | `apps/web/components/console/settings.tsx` |

## C. Open gaps (violations of the rule, to fix or list)

| # | Gap | Owner | Status |
|---|---|---|---|
| G1 | `earn-screen.tsx:175` renders "Per-driver cap 1,500.00 xMXN" as a literal. Read `CreditPool.perUserCap()` | contracts / api | open |
| G2 | `agent-api-panel.tsx` renders a **static recorded trace** of `underwriter-agent.ts`. Replace with live rows from the paid-API ledger, or label it "recorded trace" with its timestamp + tx link (currently labeled "Recorded trace") | api | open (labeled) |
| G3 | OUSD = $1.00 assumption (B2) isn't visible in the UI. Show "OUSD valued at $1.00 (testnet assumption)" wherever collateral value is shown | web / contracts | open |
| G4 | FX relay label must show source rate date + fetch time + on-chain time (B1) once the relay ships | contracts / web | pending relay |
