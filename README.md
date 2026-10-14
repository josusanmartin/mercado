# Mercado

**A parallel financial system for emerging markets, on Tempo. One currency, six products.**

> ⚠️ **Testnet prototype.** Everything runs on **Tempo Moderato testnet (chain 42431)** with throwaway keys. It isn't a financial product, a credit product, an investment product or a redeemable fiat stablecoin. Read the [disclosures](#disclosures) before demoing it.

Mercado is built around **xMXN**, a 6-decimal synthetic Mexican peso (a native TIP-20 token on Tempo). Six products use the same currency:

| # | Product | Who it's for | What happens on-chain |
|---|---|---|---|
| 01 | **Mint** (`/mint`) | Institutions | Lock collateral (testnet OUSD, demo staked OUSD, demo tokenized T-bills) in a multi-collateral vault and mint xMXN against it. Each collateral has its own mint line, liquidation line, penalty and debt ceiling. The **Risk** tab shows live exchange and system backing and the FX levels where they'd break. |
| 02 | **Remesas** (`/remesas`) | A sender in the US and family in Mexico | A phone app: dollars in become pesos in the family's wallet in **one transaction**. The vault-integrated exchange (MoveAMM) mints xMXN straight to the recipient, with a public memo ("para mamá"). Also Tiempo Aire and bill payments over HTTP 402. |
| 03 | **Global** (`/global`) | Businesses and partners | Pay a supplier in pesos from dollars, or redeem xMXN back to OUSD (burns it). The price is the oracle mid ± fee + size impact, and partners can buy a signed **indicative** quote over MPP. |
| 04 | **Crédito** (`/credito`) | Gig drivers, lenders, underwriters | Driver app: connect a gig platform (simulated consent), get an illustrative score and an EIP-712 eligibility attestation, draw an xMXN advance from a lender-funded pool, repay manually. Back office: live loan book, lenders, paid Underwriting API. |
| 05 | **Card** (`/card`) | Anyone holding xMXN, and the corner store | A virtual Mercado Card: real freeze, real calendar-day limit, and every charge needs the **holder's EIP-712 tap signature** for that exact amount and shop. The "Tienda Doña Mary" terminal charges on-chain and can refund. |
| 06 | **Invest** (`/invest`) | Savers | Ahorro en pesos (supply xMXN to the credit pool; earns only realized driver fees), Ahorro en dólares (stake OUSD into sOUSD), and demo T-bills bought and sold on the InvestDesk, which can then be used as Mint collateral. |

Plus `/developers` (the APIs, including the MPP-paid endpoints) and `/contracts` (every contract, live state, verification links). Old routes redirect: `/credit`, `/earn` → `/credito`; `/pay`, `/send` → `/remesas`.

## Disclosures

These must stay visible in the demo; the app shows them in a persistent footer and on each product.

- **Testnet prototype. Tokens have no value.** Every balance is testnet-only.
- **xMXN isn't redeemable for pesos** and has **no guaranteed peg** or market depth. Redemption to OUSD through Global is bounded by the exchange's reserve and its 24h redemption bucket.
- **Collateral is testnet / demo.** Testnet OUSD is Tempo's faucet OpenUSD (no real value), valued at an **assumed $1.00**. **sOUSD** is demo staked OUSD with an admin-set mock APR. **tTBILL** is a demo tokenized T-bill on an admin price feed: **not a security**, with no real T-bill behind it.
- **Not a credit product.** Driver earnings are **Demo Uber/DiDi/Rappi Data** behind a **simulated consent** screen (not affiliated; Mercado never asks for a password). The score is an **illustrative heuristic, not a credit model**. Repayment is manual; nothing is deducted from any platform payout.
- **No guaranteed returns.** Pool savers earn only realized driver fees, which vary. sOUSD yield is demo-funded.
- **Simulated fulfillment.** Telcel/CFE top-ups are **SIMULATED**. The MPP 402 payment is real; the top-up isn't.
- **Simulated card network.** The Mercado Card's number and network are a demo (not Visa/Mastercard; works only at Mercado demo merchants). Charges, refunds, limits and freezes are real on-chain.
- **Admin-relayed FX.** USD/MXN is relayed on-chain by our keeper from Coinbase's exchange-rates API (intraday indicative, every ~10 min, within band and jump limits). It's **not a decentralized oracle**, and the label shows fetch and on-chain times. Stress demos use an explicit force-set + restore.
- **Card on-ramp is simulated and currently disabled.** "Agregar dólares con tarjeta" accepts only the test card 4242 (no card is ever charged); it's turned off until its security review passes.

The full list of mocks, why each can't be real on testnet, and where each is labeled is in **[MOCKS.md](MOCKS.md)** (enforced by `scripts/check-mocks.ts`).

## What's real vs. mocked (summary)

**Real (on Tempo or in our own API state):** every balance, position, ratio, fee, reserve, coverage and pool stat (contract views); activity tables and flow counters (event logs, reconciled against `totalSupply` by `scripts/check-indexer.ts`); swaps, mints, burns, borrows, repays, card charges and refunds, InvestDesk trades; MPP 402 challenges, on-chain payment verification and receipts; EIP-712 attestations and taps; the relayed FX rate; fee sponsorship.

**Mocked (and labeled):** gig-platform earnings + consent, Telcel/CFE fulfillment, the Arcus/Uber adapters (stubs), sOUSD yield source, tTBILL price + issuer, the card network/PAN, the card on-ramp checkout. See [MOCKS.md](MOCKS.md).

## Architecture

```
Next.js app (apps/web, :3100) ── wagmi/viem ──► Tempo Moderato (42431)       [v2, live]
 │  Demo mode: each product auto-uses its     ├─ xMXN v2 (TIP-20 via TIP20Factory; issuers = vault + AMM, locked)
 │  testnet demo account (no persona picker)  ├─ MultiCollateralVault   Mint: per-collateral CDPs (OUSD, sOUSD, tTBILL)
 │                                            ├─ MoveAMM                 Remesas/Global: OUSD in mints, xMXN out burns;
 │                                            │                          own OUSD reserve + equity, coverage stop, 24h bucket
 │                                            ├─ CreditPool v2           Crédito: lender supply, EIP-712 borrow, caps, fee
 │                                            ├─ MercadoCard             Card: holder-signed taps, limits, freeze, refunds
 │                                            ├─ InvestDesk              Invest: tTBILL buy/sell vs OUSD at feed ± spread
 │                                            ├─ StakedOUSD (sOUSD)      demo ERC-4626, accrual-based (donation-proof)
 │                                            └─ FXOracleAdapter + price feeds (OUSD fixed $1, sOUSD 4626, tTBILL admin)
 └─ API routes (apps/web/app/api)
     ├─ /api/fx                 relayed USD/MXN with provenance
     ├─ /api/driver/{demo,score}  demo platform data → score → EIP-712 attestation (?access=underwriter is MPP-paid)
     ├─ /api/bills/{quote,pay,orders}  MPP 402 → on-chain verify → SIMULATED fulfillment (crash-safe recovery)
     ├─ /api/move/quote         exchange quote (?access=partner: MPP-paid, signed indicative quote)
     ├─ /api/mpp/pricing        prices of the paid endpoints
     ├─ /api/sponsor            Tempo fee-payer relay (Mercado calls only, rate-limited)
     └─ /api/onramp             simulated card checkout → real OUSD delivery (DISABLED)
```

**Tempo-native:** xMXN is a native TIP-20 from the `TIP20Factory` precompile. Fees are paid in a USD stablecoin, and the fee-payer relay means drivers, savers, cardholders and the shop never need fee tokens. Remittances use `transferWithMemo`. Bills and paid APIs use the MPP `tempo` charge method, with transfers memo-bound to the 402 challenge. Agents pay per call with no API key (`scripts/underwriter-agent.ts`).

**Two balance sheets, one currency:** CDP collateral (vault) and the exchange reserve (MoveAMM) are separate contracts. Neither can spend the other's funds, and `xMXN.totalSupply == Σ vault debt + AMM liability` is checked after every mint/burn in the journey.

## Deployed contracts (Tempo Moderato, chain 42431)

**v2 is live** (the app switched at 02:37 UTC on 14 Oct 2026). Every contract below is **source-verified on Tempo's Sourcify (`contracts.tempo.xyz`) with an exact match** (checked by qa at 03:17 UTC). Source of truth: `packages/shared/src/deployments/42431.json` → `activeAddresses()` in `@mercado/shared`.

| Contract | Address | Verified |
|---|---|---|
| xMXN v2 (TIP-20) | [`0x20C0…4fE3A8219136ca54`](https://explore.testnet.tempo.xyz/address/0x20C0000000000000000000004fE3A8219136ca54) | TIP-20 precompile token |
| MercadoFactoryV2 | [`0xC1e0FDFAFBdf14cFa8357095AAae6490CA625E59`](https://explore.testnet.tempo.xyz/address/0xC1e0FDFAFBdf14cFa8357095AAae6490CA625E59) | [exact match](https://contracts.tempo.xyz/v2/contract/42431/0xC1e0FDFAFBdf14cFa8357095AAae6490CA625E59) |
| MultiCollateralVault (Mint) | [`0xc6c63803874d41132CFe437C183Ac401e4aF2577`](https://explore.testnet.tempo.xyz/address/0xc6c63803874d41132CFe437C183Ac401e4aF2577) | [exact match](https://contracts.tempo.xyz/v2/contract/42431/0xc6c63803874d41132CFe437C183Ac401e4aF2577) |
| MoveAMM (Remesas/Global) | [`0x9ecD19ebd398E73C2E1C196b8f7845CDD9872b7F`](https://explore.testnet.tempo.xyz/address/0x9ecD19ebd398E73C2E1C196b8f7845CDD9872b7F) | [exact match](https://contracts.tempo.xyz/v2/contract/42431/0x9ecD19ebd398E73C2E1C196b8f7845CDD9872b7F) |
| CreditPool v2 (Crédito) | [`0xaB32daeF142B442d24589D2161967a843720C6D7`](https://explore.testnet.tempo.xyz/address/0xaB32daeF142B442d24589D2161967a843720C6D7) | [exact match](https://contracts.tempo.xyz/v2/contract/42431/0xaB32daeF142B442d24589D2161967a843720C6D7) |
| MercadoCard (Card) | [`0x052081d43f9A1e3637c2bBFC3b571b49d0C1F8b6`](https://explore.testnet.tempo.xyz/address/0x052081d43f9A1e3637c2bBFC3b571b49d0C1F8b6) | [exact match](https://contracts.tempo.xyz/v2/contract/42431/0x052081d43f9A1e3637c2bBFC3b571b49d0C1F8b6) |
| InvestDesk (Invest) | [`0xD4662343deeE28B4d4a9E4be8E718d9C7d5E4c32`](https://explore.testnet.tempo.xyz/address/0xD4662343deeE28B4d4a9E4be8E718d9C7d5E4c32) | [exact match](https://contracts.tempo.xyz/v2/contract/42431/0xD4662343deeE28B4d4a9E4be8E718d9C7d5E4c32) |
| StakedOUSD (sOUSD, demo) | [`0xC00d9A247F11749FAa3797c5C6fD1944BDc919d2`](https://explore.testnet.tempo.xyz/address/0xC00d9A247F11749FAa3797c5C6fD1944BDc919d2) | [exact match](https://contracts.tempo.xyz/v2/contract/42431/0xC00d9A247F11749FAa3797c5C6fD1944BDc919d2) |
| tTBILL (demo RWA, gated) | [`0x4D2c7dE11782614759800d5d58AFfDFc23BdA342`](https://explore.testnet.tempo.xyz/address/0x4D2c7dE11782614759800d5d58AFfDFc23BdA342) | [exact match](https://contracts.tempo.xyz/v2/contract/42431/0x4D2c7dE11782614759800d5d58AFfDFc23BdA342) |
| FXOracleAdapter (USD/MXN, relayed) | [`0xe5Be428047904C5aB50C38EeeBF8645D0E11f14B`](https://explore.testnet.tempo.xyz/address/0xe5Be428047904C5aB50C38EeeBF8645D0E11f14B) | [exact match](https://contracts.tempo.xyz/v2/contract/42431/0xe5Be428047904C5aB50C38EeeBF8645D0E11f14B) |
| OUSD feed (fixed $1.00) | [`0x69a678782902b491594Fb7455b2AD787c0397AB2`](https://explore.testnet.tempo.xyz/address/0x69a678782902b491594Fb7455b2AD787c0397AB2) | [exact match](https://contracts.tempo.xyz/v2/contract/42431/0x69a678782902b491594Fb7455b2AD787c0397AB2) |
| sOUSD feed (ERC-4626) | [`0x66a13069272166667044bF6D8B9313Ec8d3b6bE5`](https://explore.testnet.tempo.xyz/address/0x66a13069272166667044bF6D8B9313Ec8d3b6bE5) | [exact match](https://contracts.tempo.xyz/v2/contract/42431/0x66a13069272166667044bF6D8B9313Ec8d3b6bE5) |
| tTBILL feed (admin) | [`0xC10F6283be77689B7D403AF9974d9842f2c7d6A0`](https://explore.testnet.tempo.xyz/address/0xC10F6283be77689B7D403AF9974d9842f2c7d6A0) | [exact match](https://contracts.tempo.xyz/v2/contract/42431/0xC10F6283be77689B7D403AF9974d9842f2c7d6A0) |
| Collateral: Testnet OUSD (Tempo faucet) | [`0x20c0…6a37DA5C996874BE`](https://explore.testnet.tempo.xyz/address/0x20c0000000000000000000006a37DA5C996874BE) | Tempo's token |

**v1 (legacy, still deployed, all exact-match verified):** vault `0xDB8dF7a0a8cDEB2A125717B4a3f7d292f8241Ca2`, CreditPool `0xbda927135f23a96aa0FD8411617F01Ffa9f063A4`, SwapDesk `0x038296fdE32fD87EB89A6113339aD426484abec5`, factory `0x0F11AbDFa4e0cA43AC9CE075d700FbF33B6B5591`, xMXN v1 `0x20C0000000000000000000002486D8487268a6dd`. Also deployed: `tTBILL-legacy` `0xD2A09BECEBD7bD9e23B0fc6FE1e89616D413b33b` (the original public-faucet token, superseded by the gated one).

Network: RPC `https://rpc.moderato.tempo.xyz` · explorer https://explore.testnet.tempo.xyz · faucet `cast rpc tempo_fundAddress <addr> --rpc-url https://rpc.moderato.tempo.xyz`. Always pay fees in a USD TIP-20 (we use AlphaUSD `0x20c0…0001`): with no fee token set, a call to xMXN fails with `FeeTokenNotUsdError` (`cast … --tempo.fee-token 0x20c0000000000000000000000000000000000001`).

## Running it

Prerequisites: Node 22, npm (workspaces; pnpm isn't supported here), Foundry ≥ 1.8 at `~/.foundry/bin` (Tempo network support).

```bash
npm install
cp .env.example .env.local            # testnet throwaway keys; fund each *_ADDRESS from the faucet
# apps/web/.env.local holds the NEXT_PUBLIC_DEMO_* persona keys and NEXT_PUBLIC_MERCADO_PROTOCOL=v2

npm run dev                           # http://localhost:3100 (one server; Demo mode is on by default)
packages/contracts/script/demo-reset  # one-command reset: pool v2 cash, driver debt, cards unfrozen, personas;
                                      # NEVER touches the oracle (the FX relay owns it). DEMO_RESET_SKIP_ORDERS=1 skips bill-order archiving
```

Rollback to v1: set `NEXT_PUBLIC_MERCADO_PROTOCOL=v1` in `apps/web/.env.local` and restart the dev server. Scripts take `MERCADO_PROTOCOL=v1|v2`.

## Tests and evidence

| What | Command | Result |
|---|---|---|
| Contracts (Foundry, real TIP-20 precompiles) | `cd packages/contracts && ~/.foundry/bin/forge test` | **136/136** across 9 suites (`scripts/evidence/forge-test.txt`) |
| v2 end-to-end journey on Moderato | `PROTOCOL=v2 npx tsx scripts/demo-journey.ts` | V0–V10 + VS green: Create, Move, Lend, Spend 402, underwriter bot, Card, Invest, stress + restore |
| v1 journey (legacy) | `npx tsx scripts/demo-journey.ts` | J0–J7 green before the flip (API steps now need a v1 server) |
| Bills crash/restart safety | `npx tsx scripts/bills-crash-proof.ts` | SIGKILL after/before broadcast → no double charge or fulfillment |
| Indexer correctness | `MERCADO_PROTOCOL=v2 npx tsx scripts/check-indexer.ts` | minted − burned == totalSupply; pool flows reconcile |
| Mocks register | `npx tsx scripts/check-mocks.ts` | no unlisted mocks |
| Machine-to-machine MPP | `MERCADO_PROTOCOL=v2 npx tsx scripts/underwriter-agent.ts` | 402 → 2 xMXN → report + receipt |
| UI smoke (Playwright) | `npx playwright test -c apps/web/e2e ecosystem` | routes, honesty labels, redirects, mobile |
| API (vitest) | `npx vitest run --config apps/web/lib/server/__tests__/vitest.config.mts` | score, signatures, 402, idempotency, recovery |

Every check, with tx links, is in **[ACCEPTANCE.md](ACCEPTANCE.md)**. The live script is **[DEMO.md](DEMO.md)**.

## Repository

| Path | What |
|---|---|
| `packages/contracts` | Foundry: v1 + v2 contracts, tests, deploy/stress/reset/verify scripts, FX relay |
| `packages/shared` | `@mercado/shared`: chain, ABIs, deployments, `protocol.ts` (`activeAddresses()`), Zod schemas |
| `apps/web` | Next.js app: six products, API routes, phone apps, e2e specs |
| `fixtures/{uber,didi,rappi}` | Demo platform earnings (labeled) |
| `scripts` | journeys, crash proof, checkers, underwriter agent, evidence |
| `SPEC.md` · `INTERFACES.md` · `MOCKS.md` · `ACCEPTANCE.md` · `DEMO.md` | spec, interfaces, mock register, acceptance evidence, demo script |

## Deferred / production gate

Issuer-backed fiat issuance and peso redemption (SPEI), real airtime/bill aggregators (e.g. Arcus), gig-platform OAuth with approved scopes, validated underwriting and collections, KYC/AML, a decentralized FX oracle, real tokenized T-bills, a card issuer/BIN, and timelocked governance. A real launch needs review by Mexican legal and compliance specialists first (lending, money transmission, securities, digital assets, consumer protection, data privacy).
