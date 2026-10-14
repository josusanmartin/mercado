# Mercado demo script (2–3 minutes), v0.2

**Pitch:** *A parallel financial system for emerging markets, on Tempo.* Four modules around one synthetic local currency, xMXN: **Create · Move · Lend · Spend**.

**Bold** = click/key. *Italics* = talking points. Timings are targets. The aha is the *connection*: money created by institutions circulates to a family, funds a driver's advance, and gets spent through a real HTTP 402 payment. These aren't four separate finance demos.

> **Which version is live?** Check the Home "System" view. **If v2 is flipped** (`NEXT_PUBLIC_MERCADO_PROTOCOL=v2`, gate in `crew/V2-SWITCH.md`), Create uses the multi-collateral vault and Move uses the vault-integrated vAMM. **If not**, run the lines marked *(v1)*: OUSD-only vault and the separately seeded swap desk. Present sOUSD/tTBILL and the vAMM as the approved next version. Never switch versions just to match the slides.

## Before recording

- [ ] `npm run demo:reset` (or `npx tsx scripts/demo-journey.ts --steps J0` to heal oracle, desk and pool), then check that the Driver is debt-free.
- [ ] Dev server on http://localhost:3100. Moderato RPC reachable. No dev error badge on `/`, `/credit` or `/pay`.
- [ ] Oracle fresh (`J0` prints its age); desk/AMM reserves and pool cash above the floors.
- [ ] Nobody else is driving a demo persona (announce in #mercado).
- [ ] Explorer tab open: https://explore.testnet.tempo.xyz
- [ ] Backup: `deck/assets/hero-driver.mp4` (Lend → Spend, 48s) and the explorer links in `ACCEPTANCE.md`.

Personas (top-bar avatars, testnet demo keys): **Lucía** (LP / institution), **Miguel** (sender in Houston), **Rosa** (recipient in Puebla), **Javier** (driver in CDMX), **Elena** (lender).

## 0:00 System (Home)

1. Open **Home**. Point at the footer: *Tempo Moderato 42431 · Testnet prototype · OUSD has no real value · xMXN is not redeemable for pesos.*
2. The **System** view: Create → Move → Lend → Spend around xMXN, with live numbers. The three **buckets** stay separate: vault collateral, exchange reserve, and pool cash vs. loans.
   - *"One synthetic peso, four things you can do with it. Each pot of money has its own balance sheet: the vault never funds the exchange or the loans."*

## 0:20 Create (institutions mint xMXN)

3. Avatar **Lucía** → **Create pesos**. Show the FX card (**mock admin oracle**, age).
4. **v2:** pick collateral **sOUSD** (*demo staked OUSD, mock yield*) and show its LTV, liquidation line, debt ceiling and accruing share value. Deposit, then **mint** at ≥250%. Explorer link. Mention **tTBILL** (*demo tokenized T-bill, not a security*, bigger haircut).
   *(v1)* Deposit 1,000 **Testnet OUSD**, mint **8,000 xMXN** (250%).
   - *"The minters are institutions. They lock collateral that keeps earning inside the token, here a demo staked stablecoin, and create pesos that enter circulation. On testnet every yield and RWA price is admin-set and labeled."*
5. Drag the **peso-appreciation slider** (preview only, on this position) until it **goes red at ~10.8**: the dollar falls 46% against the peso (≈85% peso appreciation).
   - *"A dollar-backed peso is exposed to peso appreciation. We show where this position would be liquidated instead of hiding it."*

## 0:50 Move (remittance: the vault is the exchange)

6. Avatar **Miguel** → **Send money**: 50 OUSD → Rosa, memo **"para mamá"**. Show the quote: **oracle mid, spread, size impact, min received**.
   **v2:** the vAMM **mints** xMXN straight to Rosa in one tx, and shows reserve coverage. *(v1)* The seeded swap desk sells inventory, then a transfer with memo.
7. The **Send receipt**: xMXN delivered, OUSD spent, fee, recipient, the public memo, explorer link.
   - *"OUSD in mints pesos; pesos out burn and redeem OUSD. Pricing is anchored to the oracle with size-dependent impact, and coverage limits are enforced on-chain. This is on-chain delivery only: no bank cash-out."* (Say "mints/burns" only once v2 is live; on v1 say "a capped exchange desk".)

## 1:15 Lend (gig-economy credit)

8. Avatar **Elena** → **Earn**: pool cash vs. loans out, realized fees, *no guaranteed return*.
9. Avatar **Javier** → **Get an advance** → **Steady driver** (**Demo Uber Data** chart) → **Check eligibility**: score, *why you get a credit line*, line vs. available now, offer expiry → **Draw an advance** → 300 → **Draw advance**.
   - *"Synthetic driver earnings, an illustrative score, not a credit model. The backend signs a short-lived attestation bound to this wallet, pool and chain; a replay fails on-chain. The money comes from lenders, not from the peso vault."*

## 1:40 Spend (MPP: bills and agents)

10. **Pay bills** → Telcel **$100** → **Get quote** → **Pay 100.00 xMXN**. Stepper: *402 Payment Required → paid on Tempo → verified on-chain → SIMULATED top-up*.
11. **Receipt** panel: the real testnet payment (tx link) | **Top-up SIMULATED** (reference) | **Still owed** 306 xMXN, side by side.
    - *"A real HTTP 402. The server challenged the request, the driver paid in xMXN, and the server verified the on-chain transfer before fulfilling. The airtime is simulated. Retries never charge twice."*
12. The **Agent API** panel on Get an advance (recorded trace), *or* run `npx tsx scripts/underwriter-agent.ts` live: a bot with no API key gets a 402, pays 2 xMXN, and receives an underwriting report plus receipt.
    - *"Machines pay for APIs the same way: no keys, no accounts, just a 402 and a stablecoin."*

## 2:10 Risk and close

13. Repay is manual (**Get an advance → Repay**). Nothing is deducted from Uber payouts, and the repayment funds come from a separately disclosed source.
14. **v2:** the vAMM's coverage stop: below 100% coverage mints pause and redemptions go pro-rata (NAV), so there's no first-mover run. Optional on-chain proof after the take: `npx tsx scripts/demo-journey.ts --steps J7` (a dedicated stress position is liquidated at 14 MXN/USD, then the oracle is restored).
15. **Contracts** page: addresses, verified sources, explorer links.
    - *"Everything you saw settled on Tempo testnet. Uber data, airtime, the FX oracle and the demo collateral are labeled mocks. Next: real issuers, aggregator partners and approved Uber OAuth, after legal review."*

## Disclosures (say out loud or keep on screen)

Testnet prototype · tokens have no value · xMXN isn't redeemable for pesos and has no guaranteed peg · OUSD / sOUSD / tTBILL are testnet or demo tokens (no real yield, not securities) · Demo Uber Data · illustrative score, not a credit product · SIMULATED fulfillment · mock admin oracle · manual repayment.
