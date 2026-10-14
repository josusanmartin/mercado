# Mercado live demo (2.5–3 min)

**One currency, six products, on Tempo.** This script follows the deck order: Home → Mint (+ Risk) → Remesas → Global → Crédito → Card → Invest → /developers → /contracts.

**Bold** = click. *Italics* = what to say. Numbers below are from the 14 Oct rehearsal at 18.37 MXN/USD; the app always shows live values, so read them off the screen.

## Pre-demo checklist (5 min before)

- [ ] **:3100 is up** and compiles: `curl -s localhost:3100/api/fx` returns 200 (one dev server, tmux `mercado:dev`).
- [ ] **Reset:** `packages/contracts/script/demo-reset` (add `DEMO_RESET_SKIP_ORDERS=1` if a bill order is mid-settlement). Check the state table: Javier owes 0 and his card is active, Familia's card is active, and pool v2 has cash ≥ 10k. The reset never touches the oracle.
- [ ] **FX is fresh:** `/api/fx` label reads "Admin-relayed from Coinbase … fetched <t> · on-chain <t>" within the last ~10 min. If not, ask contracts to restart `fx-relay.mjs`. Don't hand-set the price.
- [ ] **Demo mode is ON** (top bar toggle), so each product uses its own testnet demo account automatically.
- [ ] Browser at 1440×900, no extensions, explorer tab open (https://explore.testnet.tempo.xyz).
- [ ] Nobody else is sending txs with Javier / Familia / the shop (announce in #mercado). Card on-ramp shows "Próximamente" (disabled on purpose).
- [ ] Backups ready: `deck/assets/hero-spend-final.mp4` (Crédito → Card, 44 s), `deck/assets/hero-driver.mp4`, and the tx links in `ACCEPTANCE.md`.

## 0:00 Home: one currency, six products (15 s)

1. Open **/** (HOME). "ONE CURRENCY. SIX PRODUCTS." and the numbered index with live numbers. Point at the footer: *Tempo Moderato 42431 · testnet prototype · sin valor real · xMXN is not redeemable for pesos.*
   - *"Mercado is a parallel financial system for emerging markets on Tempo. One synthetic peso, xMXN, and six products that create it, move it, lend it, spend it and save it. Every number here is read live from the chain."*

## 0:15 Mint: institutions create pesos (25 s)

2. **Mint**. "CREA PESOS." Collateral mix: testnet OUSD (assumed $1.00), sOUSD (demo staked OUSD, mock yield), tTBILL (demo T-bill, not a security), each with its own mint line, liquidation line and ceiling.
3. **Risk** tab. Exchange backing ~270%, system backing ~279%, and the breakpoints: the system only reaches the 135% line if the peso strengthens to ~8.9 MXN/USD. Individual positions liquidate earlier, at their own lines.
   - *"Institutions lock yield-bearing collateral and mint pesos. The collateral keeps its own yield. And we show the one risk that matters for a dollar-backed peso, peso appreciation, with real liquidations on record."*
   - *Fallback:* if the Risk tab is slow, use the deck's `mint-risk-v5` still.

## 0:40 Remesas: dollars in, pesos at home (25 s)

4. **Remesas**. The phone app (Spanish): balance in dollars, "≈ MX$ at today's rate", the live-rate chip. **Enviar** → **Mamá** → amount → send.
   - *"A sender in the US sends dollars; the exchange mints pesos straight into Mamá's wallet in one transaction, with a public memo. On-chain delivery only: no bank cash-out."*
   - Show the desktop panel: what happened, the tx link, the network fee covered by Mercado's sponsor.
   - *Fallback:* skip the send and show the last delivery in the phone's activity (real on-chain row).

## 1:05 Global: businesses and partners (15 s)

5. **Global** → **Pay a supplier**: oracle mid, fee, size impact, minimum received, the exchange's backing. Mention **Partner API**: a signed **indicative** quote, paid per call over MPP.
   - *"Same exchange, B2B: pay a supplier in pesos from dollars, or redeem pesos back, which burns them. Partners buy a signed indicative quote with an HTTP 402. No API key."* (Never say "firm quote".)

## 1:20 Crédito: an advance for a driver (25 s)

6. **Crédito** → **Driver app** (Javier). **Continuar con Uber** → simulated consent → **Permitir**. "Disponible ahora". **Adelanto** → 25% → **Recibir … xMXN** → "Listo. Ya es tuyo." → **Ver mi adelanto** → "Debes".
   - *"Javier connects his gig platform. It's Demo Uber Data with simulated consent, not affiliated, and we never ask for a password. He gets an illustrative score, not a credit model, and a signed eligibility bound to his wallet and this pool. The advance comes from lenders, not from the mint vault. Repayment is manual."*
   - *Fallback:* play `hero-spend-final.mp4` from the start (it covers this beat and the next).

## 1:45 Card: spend it at the corner store (30 s), the proof moment

7. **Card** (Javier, `/card?holder=driver`): "HOLA, JAVIER", his card (demo network), balance, "Adelanto pendiente". Flip **Congelar** on.
8. At **Tienda Doña Mary**: type **150** → **Cobrar con Mercado Card** → phone sheet → **Aprobar** → *declined*: "Tarjeta congelada". Nothing is charged. **Cerrar**.
9. Flip **Congelar** off → **150** → **Cobrar** → **Aprobar** → "Cobrado · Charged 150.00 xMXN" on the terminal and in the phone's Movimientos, with the tx link.
   - *"Every charge needs Javier's own signature for that exact amount and shop: the store can't pull money. A frozen card is declined and nothing moves; after he unfreezes, the retry is charged exactly once, on-chain. The card network is the only simulated part."*
   - *Fallback:* play `hero-spend-final.mp4` (44 s, all real txs) and open the charge tx from `ACCEPTANCE.md`.

## 2:15 Invest: save it (15 s)

10. **Invest**: Ahorro en pesos (supply to the credit pool, earns only realized driver fees, no guaranteed return), Ahorro en dólares (sOUSD), T-bills (buy/sell demo tTBILL on the InvestDesk, then post it as Mint collateral).
    - *"Savers close the loop: pesos fund the drivers, and demo T-bills bought here become collateral that mints new pesos."*

## 2:30 /developers and /contracts: it's all real (20 s)

11. **/developers**: the APIs; the paid ones answer HTTP 402 and settle in xMXN. Mention `scripts/underwriter-agent.ts`: a bot with no API key pays 2 xMXN for a report.
12. **/contracts**: every v2 contract with a **Verified ✓** link (Tempo's Sourcify, exact match), live state and admin powers in plain words.
    - *"Every contract is live on Tempo testnet and source-verified. What's simulated is listed in MOCKS.md and labeled on screen: the gig-platform data, airtime fulfillment, the card network, and the demo collateral's yield and price."*

## Close (10 s)

- *"Mint, Remesas, Global, Crédito, Card, Invest: one currency. Next: real issuers, aggregators, approved platform OAuth and a decentralized oracle, after legal review."*

## If something breaks

| Problem | Do this |
|---|---|
| :3100 down / 500s | Play `hero-spend-final.mp4`, then walk the deck's v5 screenshots; tx links are in `ACCEPTANCE.md` |
| A tx hangs > 15 s | Keep talking; the explorer link appears when it lands. Don't retry a card tap (idempotent taps, but avoid a second charge on stage) |
| FX label stale | Say "admin-relayed rate, refreshing every 10 min"; never force-set it on stage |
| Sponsor quota exhausted | The wallet pays its own fee in AlphaUSD and the UI says "Comisión de red pagada por ti". That's expected |
| Wrong persona | Toggle Demo mode off/on. Each product re-maps to its demo account |
| Need v1 | `NEXT_PUBLIC_MERCADO_PROTOCOL=v1` + restart (one env var; lead only) |

## Disclosures (keep on screen or say)

Testnet prototype · tokens have no value · xMXN isn't redeemable for pesos and has no guaranteed peg · OUSD/sOUSD/tTBILL are testnet/demo (no real yield, not securities) · Demo Uber/DiDi/Rappi Data with simulated consent · illustrative score, not a credit product · SIMULATED airtime/bill fulfillment · demo card network · admin-relayed FX, not a decentralized oracle · no guaranteed returns · manual repayment.
