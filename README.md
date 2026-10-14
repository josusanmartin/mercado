# Mercado

**Synthetic local-currency stablecoins on Tempo, used for remittances, gig-worker cash-flow advances and bill payments.**

> ⚠️ **Testnet prototype.** Mercado runs only on **Tempo Moderato testnet (chain 42431)**. It is not a real financial product, not a credit product, and not a redeemable fiat stablecoin. Read the [disclosures](#disclosures) before demoing it.

Mercado lets a liquidity provider lock testnet USD in an overcollateralized vault and mint **xMXN**, a 6-decimal synthetic peso (TIP-20). Others can then use xMXN:

1. **Create pesos:** an LP deposits **Testnet OUSD** (Tempo's faucet OpenUSD, no real value) into the `CollateralVault` and mints xMXN at ≥150% collateralization.
2. **Send money:** a sender swaps testnet OUSD for xMXN on a **separately capitalized** `SwapDesk` and sends it to another wallet (on-chain delivery only, no SPEI cash-out).
3. **Get an advance:** a driver imports **Demo Uber Data**. The backend computes an illustrative score and signs a short-lived EIP-712 attestation, and the driver draws xMXN from a **separately funded** `CreditPool`.
4. **Pay bills:** the driver buys a mock Telcel airtime top-up through a real **MPP HTTP 402** payment flow, settled in xMXN on Tempo. Fulfillment is **SIMULATED**.
5. **Repay and earn:** the driver repays, and the lender sees the repayment and realized fees.

## Disclosures

The demo must keep all of these visible:

- **Testnet prototype.** Everything runs on Tempo Moderato testnet with throwaway keys. Tokens have no monetary value.
- **Not a credit product.** The advance is a demo of on-chain mechanics. Scoring is an illustrative heuristic on synthetic data, not a validated credit model. Repayment is manual, and nothing is automatically deducted from Uber payouts.
- **Not redeemable fiat.** xMXN is a synthetic, collateral-backed testnet token. It can't be redeemed for Mexican pesos, isn't issuer-backed, and has **no guaranteed peg** or market depth.
- **Testnet OUSD only.** The collateral is **"Testnet OUSD (Tempo faucet, no real value)"**: the OpenUSD token instance on Moderato, which anyone can get from the faucet. Testnet balances have no real value and can't be redeemed. Mercado never claims its collateral is issuer-backed. (A self-deployed `dOUSD` test token is kept as a fallback.)
- **Demo data.** Driver earnings are fixtures labeled **"Demo Uber Data"**. No Uber account is connected, and Mercado never asks for Uber credentials.
- **Simulated fulfillment.** Telcel/CFE top-ups are **SIMULATED**. The MPP payment is real on testnet, but no airtime is delivered and no bill is paid.
- **Third-party collateral token.** Testnet OUSD is controlled by its issuer (transfer policy, pause), not by Mercado, so collateral could be frozen outside our control.
- **Open demo eligibility.** Any wallet can request a score for any demo profile. The attestation binds the borrower and the pool caps per-user exposure, but the profile isn't tied to a real identity.
- **Mock oracle.** The MXN/USD price comes from an admin-controlled testnet feed (`isMock() == true`), not a verified market feed.
- **The swap desk isn't a market.** `SwapDesk` is a capped demo liquidity source: finite reserves, oracle price minus spread, a per-swap max and a per-address rolling cap. Because faucet OUSD is free, the desk is reseeded before demos (`scripts/demo-journey.ts --steps J0`). It says nothing about xMXN's market price or depth.
- **No yield promises.** Lender fees come only from repaid loans. There's no guaranteed APY.

## Architecture

```
Next.js app (apps/web) ── wagmi/viem ──► Tempo Moderato (42431)
   │                                       ├─ xMXN (TIP-20 via TIP20Factory; vault holds ISSUER_ROLE)
   │                                       ├─ OUSD (Tempo testnet OpenUSD, faucet-funded collateral)
   │                                       ├─ FXOracleAdapter (mxnPerUsd 8dp, maxAge, sanity band, pause)
   │                                       ├─ CollateralVault (deposit/mint/repayAndBurn/withdraw/liquidate)
   │                                       ├─ SwapDesk (own finite reserves, spread, minOut)
   │                                       └─ CreditPool (lender supply, EIP-712 borrow, caps, fee)
   └─ API routes (apps/web/app/api)
        ├─ /api/fx            reads the on-chain mock oracle
        ├─ /api/driver/demo   Demo Uber Data fixtures
        ├─ /api/driver/score  heuristic score + signed eligibility attestation
        └─ /api/bills/{quote,pay,orders/[id]}  mppx 402 challenge → on-chain verify → SIMULATED fulfillment
```

Repository layout:

| Path | What |
|---|---|
| `packages/contracts` | Foundry project: Solidity contracts, tests, deploy scripts |
| `packages/shared` | `@mercado/shared`: chain config, ABIs, deployments, Zod schemas |
| `apps/web` | Next.js app (UI + API routes) |
| `fixtures/uber` | Demo Uber Data fixtures (steady / irregular / new-driver) |
| `scripts` | `demo-journey.ts`, the end-to-end on-chain journey |
| `INTERFACES.md` | ABIs, API schemas, protocol parameters |
| `ACCEPTANCE.md` | SPEC §6 checklist with evidence |
| `DEMO.md` | 2–3 minute walkthrough script |

Protocol parameters (demo-only) are in [INTERFACES.md](INTERFACES.md#protocol-parameters-demo-only): 150% minimum mint ratio, 135% liquidation threshold, 10% liquidation penalty, oracle max age of 1h, 50 bps swap spread, and a 2% flat borrow fee.

## Network

| | |
|---|---|
| Chain | Tempo Moderato testnet, chain ID `42431` |
| RPC | `https://rpc.moderato.tempo.xyz` |
| Explorer | https://explore.testnet.tempo.xyz |
| Faucet | `cast rpc tempo_fundAddress <address> --rpc-url https://rpc.moderato.tempo.xyz` (pathUSD, AlphaUSD, BetaUSD, ThetaUSD, OUSD) |
| Collateral | Testnet OUSD `0x20c0000000000000000000006a37da5c996874be` |
| Fees | Paid in a USD TIP-20 stablecoin (Tempo has no native gas token) |

## Deployed addresses

<!-- deployments:start -->
_Pending deployment. Source of truth: `packages/shared/src/deployments/42431.json`._
<!-- deployments:end -->

## Running locally

Prerequisites: Node 22, npm (workspaces), Foundry (`forge`).

```bash
npm install                      # npm workspaces (pnpm is not supported here)
cp .env.example .env.local       # fill in testnet throwaway keys
# fund each *_ADDRESS from the faucet (see Network above)

# contracts
cd packages/contracts && forge test && cd -

# app (http://localhost:3000)
npm run dev

# end-to-end journey on Moderato (needs the app running)
npx tsx scripts/demo-journey.ts
```

## Tests

- **Contracts:** `npm run contracts:test` (Foundry: `Vault`, `FXStress`, `Swap`, `LoanAttestation`).
- **API:** vitest in `apps/web` (score determinism, signature recovery, 402 / idempotency).
- **End-to-end:** `scripts/demo-journey.ts` runs SPEC §0 steps 1→6 on Moderato and prints explorer links.
- **UI smoke:** Playwright in `apps/web/e2e`.

The status of each acceptance check, with evidence, is in [ACCEPTANCE.md](ACCEPTANCE.md).

## Future work (explicitly deferred)

Issuer-managed fiat-backed issuance, MXN bank redemption / SPEI, real Telcel/CFE settlement (e.g. via Arcus), Uber OAuth (`partner.accounts`, `partner.trips`, `partner.payments`, which need restricted approval), validated underwriting, collections, KYC/AML, multi-currency rollout. A production launch would need review by Mexican legal and compliance specialists first.
