# Mercado — Hackathon Build Spec

**Status:** Implementation brief (v0.1, 13 October 2026)  
**Working name:** Mercado  
**One-line pitch:** Create synthetic local-currency stablecoins backed by Open USD (OUSD), then use them for remittances, gig-worker cash-flow advances, and bill payments on Tempo.

## 0. Scope and definition of done

Ship a single demonstrable journey on **Tempo Moderato testnet (chain ID 42431)**:

1. A liquidity provider deposits a **demo OUSD-equivalent** token in an overcollateralized vault.
2. The vault mints **xMXN**, a six-decimal synthetic peso TIP-20 token.
3. A sender swaps demo OUSD for xMXN through a **separately capitalized** swap desk and transfers xMXN to another wallet.
4. A driver imports **clearly marked synthetic Uber earnings data**, receives a signed and expiring underwriting attestation, and draws an xMXN advance from a **separately funded credit pool**.
5. The driver pays for a mock mobile-airtime recharge through an actual **MPP HTTP 402 payment flow**, settled with a Tempo token. The response is labeled **simulated fulfillment** and contains a transaction receipt.
6. The driver repays the advance; the lender pool records the repayment and any fees.

**Must be real:** deployed contracts, token transfers, collateral/debt accounting, swap transfers, pool borrowing and repayment, and MPP payment verification.  
**Must be labeled as mocked:** Uber account/earnings if production scopes are not approved, utility provider fulfillment, forex oracle when using an admin-controlled testnet feed, and any fiat offramp.  
**Do not promise:** actual electricity-bill payment, fiat peso redemption, automatic deductions from Uber payouts, creditworthiness validation, guaranteed yield, or a guaranteed xMXN market peg.

## 1. Asset model

**OUSD means Open USD**, issued by Bridge for Open Standard and live on Tempo since September 30, 2026. **Do not confuse this with Origin Protocol's older Origin Dollar, also ticker OUSD.** In the hackathon, a properly labeled test token is acceptable if native OUSD is not accessible on Moderato. Do not imply it is issuer-backed.

**Issuance types:**
- **Synthetic, implement now:** collateral-backed, xMXN denominated, permissionless mint/burn subject to collateral and oracle constraints.
- **Issuer-managed fiat-backed, future:** reserve-backed issuance with bank/issuer verification, permissions, attestations and redemption integration. Provide only a UI architecture stub, not a fake claim of collateral backing.

**Initial protocol parameters (demo-only):**
- Collateral: demo OUSD-equivalent USD token (TIP-20, 6 decimals).
- Debt currency: xMXN (TIP-20, 6 decimals).
- FX oracle: `mxnPerUsd` with normalized fixed precision and `updatedAt`.
- Mint collateral ratio: >=150%; UI recommends >=200%.
- Liquidation threshold: <135%, with an explicit liquidation penalty; separate from initial mint limit.
- Example for understanding, not a current FX quotation: 1,000 OUSD x 20 MXN/USD / 1.5 = up to 13,333.33 xMXN of debt.
- No yield strategies on locked CDP collateral in v0.
- No unchecked minting or withdrawal when data is stale, zero, or inconsistent.

Important economic note: a USD-collateralized debt denominated in pesos is exposed to **peso appreciation**. The collateral ratio falls when USD/MXN falls. A price feed does not provide a peg or executable liquidity. A valid token still needs market depth, redemption incentives and liquidation capacity.

## 2. Architecture

```
Next.js app / wagmi / viem
   | wallet + view calls
   v
Tempo Moderato testnet
   |-- TIP20Factory --> xMXN
   |-- CollateralVault (OUSD escrow; authorized xMXN mint/burn)
   |-- FXOracleAdapter (updatedAt, sanity limits, pause)
   |-- SwapDesk (EXTRA independently supplied OUSD and xMXN inventory)
   |-- CreditPool (independently deposited xMXN)
   '-- Payment transfer (xMXN or agreed payment token)

Next.js API routes (server-side)
   |-- /api/driver/demo         synthetic consented income series
   |-- /api/driver/score        reproducible heuristic; signed short-lived attestation
   |-- /api/fx                 data adapter; admin mock oracle ONLY on testnet
   '-- /api/bills/pay           mppx charge / 402 verification / mock fulfillment
```

Keep PII and driver income reports **offchain**. Only borrower address, max loan, expiry, nonce, and data hash or signed score proof are placed onchain. Separate HTTP processing and the MPP receipt from merchant confirmation.

### Contracts and minimum functions

1. **LocalStableFactory.sol** — initializes a market and uses Tempo's native `TIP20Factory.createToken(name, symbol, currency, quoteToken, admin, salt)` for xMXN. Grant the vault the TIP-20 `ISSUER_ROLE`, and minimize admin permissions. Prefer one hardcoded xMXN market now, with a registry interface prepared for future currencies.
2. **FXOracleAdapter.sol** — `price() -> (mxnPerUsd, updatedAt)`. Price precision clearly documented. Use verified feeds where available; no unverified claim that USD/MXN is live on Moderato. Stale and invalid values revert. Mock can support deterministic FX stress tests.
3. **CollateralVault.sol** — `depositCollateral`, `mint`, `repayAndBurn`, `withdrawCollateral`, `liquidate`, `getPosition`, `collateralRatio`. Each user's USD collateral and MXN debt is tracked independently. Use 6-decimal token math and checked fixed-point FX conversions. Token supply is minted only to actual debt positions. Repayment must burn supply.
4. **SwapDesk.sol** — independently seeded balances; `quote`, `swapOusdForXmxn(amountIn, minOut)`, `swapXmxnForOusd(amountIn, minOut)`. Use oracle-informed capped quotes, fee/spread, finite reserves, slippage checks and no access to vault collateral. If a real xMXN Tempo DEX market proves available and liquid, replace the desk with its adapter rather than hard-coding an assumption.
5. **CreditPool.sol** — `supply(xMXN)`, `withdrawAvailable`, `borrow(amount, expiry, nonce, signature)`, `repay(amount)`, `getDebt`. Pool lending is undercollateralized and *separate* from the stablecoin CDP. A trusted backend signs EIP-712 eligibility, binding signer, borrower, chain ID, pool, amount limit, expiry and nonce; reject reuse. Cap total and per-user exposures. Repayment is manual in demo, no claim of automatic Uber paycheck collection.

### Credit-score service

Create an `EarningsProvider` interface with `getDriverProfile`, `getTrips`, `getPayments`.
- **Demo provider:** deterministic 8–12-week fixtures (high/medium/low consistency) with an explicit `Demo Uber Data` label.
- **Future Uber adapter:** driver OAuth with `partner.accounts`, `partner.trips`, `partner.payments`; production access is restricted and must be approved. Never solicit the driver's password or scrape their app.

Calculate an illustrative rule from median weekly net earnings, earnings volatility, active weeks, and trip consistency; log the input features and explanation. Example cap: min(15% of median net weekly earnings, MXN 1,500 equivalent), subject to score floor and pool liquidity. These are fake underwriting parameters, not an empirically validated credit model. Return signed eligibility only if all tests pass.

### Payments service

Build a `BillProvider` interface: `quote`, `execute`, `getStatus`.
- **Demo provider:** a mock Telcel top-up (and optionally mock CFE bill) with a believable reference number and explicit `SIMULATED` flag.
- **Future providers:** Arcus or another contractually integrated Mexican airtime/bill aggregator; providers generally require commercial onboarding and fiat working balances.

Use `mppx` from `mppx/server` to challenge `POST /api/bills/pay` with a signed, amount-bound HTTP 402 payment request on Tempo. The consumer fulfills payment; the backend verifies an authoritative receipt and binds it to a unique order. Only then should the provider adapter be invoked. Store idempotency keys and state transitions: `CREATED -> PAYMENT_VERIFIED -> FULFILLED_SIMULATED`, or `FAILED` with clear handling for paid-but-unfulfilled orders. Never assert a real CFE bill is paid without provider confirmation.

MPP provides HTTP payments. It is **not** itself a bill-payment provider. MPP should be used for *an actual paid endpoint*, not just for presenting a static payment badge. As a follow-on, make `/api/driver/score` a paid MPP API for third-party micro-underwriting.

## 3. Frontend

**Stack:** Next.js (TypeScript), Tailwind, shadcn/ui, wagmi + viem; simple API routes for demo data and MPP; Foundry + Solidity + OpenZeppelin for contracts. Keep app monorepo small. Support connected wallet and a one-click **Demo Tour** using test accounts or prepared fixtures; display network, contract addresses and explorer transaction links.

**Screens/tabs:**
1. **Home:** wallet balance OUSD/xMXN, collateral health, loan outstanding, recent receipts.
2. **Create pesos:** deposit OUSD, FX quote, xMXN mint amount, projected ratio, stress indicator; burn debt and withdraw.
3. **Send money:** sender OUSD -> xMXN swap, second wallet recipient, amount received and transaction proof; show **onchain delivery only**, not SPEI cashout.
4. **Get an advance:** demo driver connection, weekly income chart, why a credit line was offered, draw and repay actions; lender liquidity visible separately.
5. **Pay bills:** Telcel airtime then optional CFE mock; checkout through MPP with clear completion/payment/fulfillment statuses.
6. **Earn:** supply xMXN to credit pool, display realized interest from repaid loans, open exposure and outstanding debt; do not promise guaranteed APY.

Avoid building a full banking onboarding funnel, production KYC flow, mobile native app, or custom charting framework. Optimize for a 2–3 minute recorded walkthrough.

## 4. Monorepo layout

```text
mercado/
├── apps/web/
│   ├── app/(dashboard)/{mint,send,credit,pay,earn}/
│   ├── app/api/{driver,fx,bills}/
│   ├── components/{wallet,vault,transfer,credit,billpay}/
│   └── lib/{tempo,contracts,mpp,format}/
├── packages/contracts/
│   ├── src/{LocalStableFactory,CollateralVault,FXOracleAdapter,SwapDesk,CreditPool}.sol
│   ├── test/{Vault,FXStress,Swap,LoanAttestation}.t.sol
│   └── script/Deploy.s.sol
├── packages/shared/
│   └── src/{types,schemas,abi}/
├── fixtures/uber/{steady,irregular,new-driver}.json
├── .env.example
├── README.md
└── DEMO.md
```

## 5. Development passes / parallel agents

**Pass A — settlement foundation (hard gate):** configure Moderato RPC / faucet, deploy test collateral TIP-20, create xMXN TIP-20 and vault, set issuer permissions, test deposit/mint/repay/withdraw, show transactions in a simple wallet UI.

**Pass B — payment network:** create separate swap desk, seed finite reserves, implement quote/swap/send UI, implement MPP 402 with a mock mobile recharge provider and reconcile confirmed payment vs simulated fulfillment.

**Pass C — financial inclusion:** build earnings fixtures, deterministic score with signatures, credit pool with lender supply/borrow/repay, front-end advance tab, and full integration demo.

**Pass D — robustness/polish:** oracle stress tests, signature replay tests, insufficient liquidity, stale data, transaction errors, mobile responsive layout, source links and demo video.

Parallelizable responsibilities: smart-contract engineer, frontend engineer, API/MPP engineer, and integration/test/demo engineer. Define ABIs and server schemas before parallelizing.

## 6. Required tests / acceptance checks

- [ ] Contract transactions are visible on Tempo testnet explorer, not only a simulated UI.
- [ ] Only vault may mint/burn xMXN; deposits cannot mint above the configured ratio.
- [ ] Collateral withdrawal cannot make a vault unhealthy.
- [ ] Stale/zero/negative/outlier price cannot be used for minting or liquidation.
- [ ] FX stress test: peso appreciation reduces vault collateralization and liquidation is enforceable.
- [ ] Swap cannot spend CDP collateral, drain more than seeded reserves, or exceed `minOut` slippage.
- [ ] CreditPool borrow fails for invalid signer, expired attestation, replayed nonce, exceeded cap, or insufficient liquidity.
- [ ] Lender withdrawal cannot withdraw xMXN currently lent out; loan repayment updates debt correctly.
- [ ] MPP endpoint returns a real 402 for an unpaid request, verifies payment and records one receipt for one order; duplicate fulfillment cannot occur on retries.
- [ ] Demo data and simulated fulfillment are labeled in both API responses and frontend.
- [ ] README discloses that this is a testnet prototype, not a real credit product or redeemable fiat stablecoin.

## 7. Explicitly deferred

Real fiat-backed issuance, MXN bank redemption, SPEI rails, vendor settlement with CFE/Telcel, actual Uber income OAuth for general users, underwriting model validation, loan collections/payroll assignment, production KYC/AML, automatic yield on locked collateral, DAO governance, cross-chain bridges, generalized multi-currency rollout, and live-money deployment.

## 8. Links / verification starting points

- Tempo protocol and Moderato RPC: https://github.com/tempoxyz/tempo
- Tempo TIP20 factory + role requirements: https://docs.chain.link/ccip/v1/evm/tools-resources/network-specific/tempo-integration-guide
- MPP docs: https://mpp.dev/ and https://mpp.dev/sdk/typescript/server/Mppx.create
- Uber scopes / restricted approval: https://developer.uber.com/docs/drivers/guides/scopes
- Uber payments: https://developer.uber.com/docs/drivers/references/api/v1/partners-payments-get
- Mexican utility API reference: https://docs.arcusfi.com/es/api/
- Chainlink feed inventory: https://docs.chain.link/data-feeds/price-feeds/addresses
- Open USD issuer: https://withbridge.com/blog/ousd-is-live-issued-by-bridge

**Production gate:** Have Mexican legal and compliance specialists review lending, money transmission, digital assets, AML/KYC, consumer disclosures and data privacy, and verify actual contractual permissions and cash-settlement flows before dealing with real customers or money.

---

## v0.2 product direction (josu, 14 Oct 2026, supersedes §0–§2 where they conflict)

**Pitch:** *A parallel financial system for emerging markets, built on Tempo.* Mercado is an ecosystem of modules around one synthetic local currency (xMXN first):

1. **Create: institutional money creation.** The minters are institutions and sophisticated players, not retail. They mint xMXN by depositing **yield-bearing collateral**: staked OUSD and other staked stablecoins, plus **RWAs** (tokenized T-bills and equities). Because the collateral keeps earning its native yield while it's locked, holders are incentivised to put idle collateral to work creating money that enters circulation. (Yield accrues *inside* the collateral token, e.g. ERC-4626 share price growth. The vault runs no strategies of its own; this replaces the old "no yield on locked collateral" rule.)
2. **Move: remittances and cross-border payments through a vault-integrated vAMM.** The same mint/redeem vault is also the exchange. OUSD coming in (e.g. a US sender) **mints** xMXN directly. xMXN going out (cross-border payment back to USD) is **burned** and redeems OUSD. Pricing is oracle-anchored with a virtual-reserve curve, giving competitive, size-dependent rates. This replaces the separately capitalized SwapDesk as the main path (the desk can remain as a fallback).
3. **Lend: uncollateralized credit through the gig economy.** Driver advances from the credit pool (existing).
4. **Spend: MPP payments** (bills, and agents paying for APIs) settle in xMXN (existing).

**Honesty constraints still apply (testnet):** "staked OUSD" and any RWA on Moderato are **demo tokens** with admin-set yield/prices, labeled as such. No claim of real T-bill or stock backing, real yield, a peg, or fiat redemption. The vAMM's solvency limits (e.g. OUSD reserve vs. xMXN outstanding when the peso appreciates) must be enforced on-chain and explained, not hidden.

**Build rule:** v2 contracts deploy **alongside** v1. The v1 demo stays live and green until v2 passes tests and the e2e journey, then the app switches over.
