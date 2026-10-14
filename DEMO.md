# Mercado demo script (2–3 minutes)

A click-by-click walkthrough for the recorded demo. **Bold** marks what to click. *Italics* are talking points. Timings are targets.

The spine of the demo is **one xMXN flow**: the lender funds the pool, the driver draws an advance, and the driver pays a bill through a real HTTP 402 receipt. The tour shows the receipt and the debt change side by side, and keeps SIMULATED airtime visually separate. Create pesos and Send come first because they explain where xMXN comes from.

## Before recording

- [ ] Dev server up at http://localhost:3000. Moderato RPC reachable.
- [ ] Oracle is fresh (updated within the last hour). If it's stale, refresh it with the `contracts` admin `setPrice` script.
- [ ] Pool has liquidity and the driver has no open debt. Check with `npx tsx scripts/demo-journey.ts --steps J0`.
- [ ] Explorer tab open: https://explore.testnet.tempo.xyz
- [ ] Browser at ~1280px wide, zoom 110%. Optionally run a second pass on a phone-width window to show mobile.
- [ ] Fallback: if the live chain misbehaves, play the explorer links from `scripts/out/last-run.json`.

## 0:00 Hook (Home)

1. Open **Home**. Point at the banner: "Testnet prototype, not a real financial product" and the network badge **Tempo Moderato 42431**.
   - *"Mercado creates synthetic local-currency stablecoins on Tempo, starting with xMXN, a synthetic peso, and puts it to work for remittances, gig-worker advances and bill payments."*
2. Point at the three **buckets of money**: vault collateral locked, swap-desk inventory, and pool cash vs. loans out.
   - *"Three separate pots of money. The vault doesn't fund the swap desk or the driver's loan. Each has its own source of funds."*

## 0:20 Create pesos (/mint)

3. **Demo Tour → LP**. Open **Create pesos**. Show the FX quote, labeled **mock oracle**, and the collateral token **"Testnet OUSD (Tempo faucet, no real value)"**.
4. Enter 1,000 OUSD. The UI projects mintable xMXN and the ratio. Pick an amount at ~300% (UI recommends ≥200%, minimum 150%). **Deposit** → **Mint**. Click the explorer link.
   - *"Every peso here is minted against an over-collateralized position. Only the vault can mint, and it won't go past 150%."*
5. Drag the **peso-appreciation slider** (mock scenario, preview-only) from 20 → 13 MXN/USD and watch the ratio fall below the 135% liquidation line.
   - *"A USD-backed peso debt is exposed to peso appreciation. We show that risk instead of hiding it. The slider is preview-only and never touches the shared oracle."*

## 0:50 Send money (/send)

6. **Demo Tour → Sender**. Open **Send money**. Quote 50 OUSD → xMXN; the spread and minOut are visible. **Swap**, then **Send** to the Recipient wallet.
7. Show the recipient's balance and the tx link.
   - *"The swap desk has its own finite reserves, so it can't touch vault collateral. This is on-chain delivery only. There's no SPEI cash-out in this prototype."*

## 1:15 The one flow: lender → driver → bill

8. **Earn** as **Lender**: show pool cash available and loans out (and **Supply** if the pool needs it).
   - *"A lender funded this pool separately from the vault. There's no promised APY; fees come only from repaid loans."*
9. **Get an advance** as **Driver** → **Connect demo driver** (steady profile). Point at the **"Demo Uber Data"** label and the weekly income chart.
10. **Check eligibility** to show the score, the "why this was offered" explanation, the max amount and the attestation expiry. **Draw** the advance.
    - *"The backend scores synthetic earnings with an illustrative heuristic, not a validated credit model, and signs a short-lived EIP-712 attestation bound to this wallet, this pool and this chain. The pool checks the signature and burns the nonce, so a replay fails."*
11. **Pay bills** → **Telcel airtime**, 100 MXN → **Pay**.
    - Status steps: *402 Payment Required* → *payment sent (Tempo tx)* → **PAYMENT_VERIFIED** → **FULFILLED_SIMULATED**.
    - Show the **receipt** (tx hash link) next to the **debt change**, with the **SIMULATED** fulfillment card visually separate.
    - *"This is a real MPP HTTP 402 flow. The server challenged us, we paid in xMXN on Tempo, and the server verified the on-chain receipt before fulfilling. Fulfillment is simulated: no real airtime is delivered. Retrying the same order never charges or fulfills twice."*

## 2:15 Repay and earn

12. **Get an advance → Repay**. Debt goes to zero.
    - *"Repayment is manual in this demo. Nothing is deducted automatically from Uber payouts."*
13. **Earn** as **Lender**: realized fees went up and outstanding exposure went down.

## 2:35 Close

14. **Contracts page**: deployed addresses with explorer links.
    - *"Everything you saw is a real transaction on Tempo Moderato. Uber data, airtime fulfillment and the FX oracle are clearly labeled mocks. Next steps: issuer-backed issuance, a real airtime aggregator, and Uber OAuth with approved scopes."*

## Disclosures to say out loud (or keep on screen)

Testnet prototype · not a credit product · xMXN isn't redeemable for pesos and has no guaranteed peg · collateral is testnet OUSD with no real value · Demo Uber Data · SIMULATED fulfillment · mock admin oracle.
