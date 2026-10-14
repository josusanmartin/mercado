# Mercado live demo (2.5–3 min)

**One currency, six products, on Tempo.** Six beats plus one 45 s spending proof, in the deck's order: cover → problem → system map → **spending proof** → compounds/risk → close.

**Bold** = click. *Italics* = what to say. Numbers below are from the 14 Oct rehearsal at 18.37 MXN/USD; the app always shows live values, so read them off the screen.

## Pre-demo checklist (5 min before)

- [ ] **:3100 is up** and compiles: `curl -s localhost:3100/api/fx` returns 200 (one dev server, tmux `mercado:dev`).
- [ ] **Reset:** `packages/contracts/script/demo-reset` (add `DEMO_RESET_SKIP_ORDERS=1` if a bill order is mid-settlement). Check the state table: Javier owes 0 and his card is active, Familia's card is active, and pool v2 has cash ≥ 10k. The reset never touches the oracle.
- [ ] **FX is fresh:** `/api/fx` label reads "Admin-relayed from Coinbase … fetched <t> · on-chain <t>" within the last ~10 min. If not, ask contracts to restart `fx-relay.mjs`. Don't hand-set the price.
- [ ] **Demo mode is ON** (top bar toggle), so each product uses its own testnet demo account automatically.
- [ ] Browser at 1440×900, no extensions, explorer tab open (https://explore.testnet.tempo.xyz).
- [ ] Nobody else is sending txs with Javier / Familia / the shop (announce in #mercado). Card on-ramp shows "Próximamente" (disabled on purpose).
- [ ] Backups ready: `deck/assets/hero-spend-final.mp4` (Crédito → Card, 41 s), `deck/assets/hero-driver.mp4`, and the tx links in `ACCEPTANCE.md`.

## Stage flow (CR-03, lead-approved): 6 beats + one 45 s spending proof, ≤230 spoken words

Follows the deck's main flow: cover → problem → system map → **spending proof** → why it compounds / risk → close. Say only the *italic* lines (the deck's speaker notes are the source of truth if they differ). The per-product slides and the live walkthrough below are **appendix**: use them only for Q&A.

### 1 · 0:00 Cover (10 s)

- *"Mercado is a parallel financial system. One peso balance: earn, send, borrow, spend and save."*

### 2 · 0:10 Problem (25 s)

- *"In Mexico, money arrives in dollars, credit goes to people with a file, and savings sit in cash. Each step is a different company, and each one takes a cut."*

### 3 · 0:35 System map: all six products (30 s)

Optional live: **/** shows "ONE CURRENCY. SIX PRODUCTS." with live numbers.
- *"One synthetic peso, xMXN, on Tempo. Mint creates it, Remesas and Global move it, Crédito lends it, Card spends it, Invest saves it. Every number in the app is read live from the chain."*

### ★ · 1:05 The spending proof: one person, one peso (45 s)

Play `deck/assets/hero-spend-final.mp4` (41 s, all real txs). Live alternative: **/card?holder=driver** → **Congelar** on → **Tienda Doña Mary** **150** → **Cobrar con Mercado Card** → **Aprobar** → "Tarjeta congelada" → **Cerrar** → **Congelar** off → **150** → **Cobrar** → **Aprobar** → "Cobrado · Charged 150.00 xMXN".
- *"Javier drives for a gig platform. He gets an advance funded by lenders, freezes his card, and the shop's charge is declined: nothing moves. He unfreezes, and the retry is charged exactly once, signed by Javier for that amount and that shop."*

### 5 · 1:50 Why it compounds, and the risk (30 s)

Optional live: **/mint** → **Risk** tab (or the deck's `panel-mint-risk`).
- *"Every product feeds the next: savings fund drivers, T-bills become collateral, collateral mints pesos. The one risk that matters is the peso strengthening, and we show exactly where the system breaks."*

### 6 · 2:20 Close (15 s)

Optional live: **/contracts**, every v2 contract "Verified ✓ exact match".
- *"Every contract is source-verified. Built and running end-to-end on Tempo testnet."*

## Appendix: live product walkthrough (Q&A only)

- **Mint** → **Risk**: exchange and system backing, the breakpoint FX rate.
- **Remesas** → **Enviar** → **Mamá** → amount → send; the desktop panel has the tx link. *Fallback:* show the last delivery in the phone's activity.
- **Global** → **Pay a supplier**: oracle mid, fee, size impact, minimum received. **Partner API**: a signed **indicative** quote paid per call with HTTP 402 (never say "firm quote").
- **Crédito** → **Driver app** → **Continuar con Uber** → **Permitir** → **Adelanto** → 25% → **Recibir**. Demo Uber Data, simulated consent, illustrative score.
- **Invest**: Ahorro en pesos, Ahorro en dólares, T-bills.
- **/developers**: the paid APIs answer HTTP 402 and settle in xMXN; `scripts/underwriter-agent.ts` pays 2 xMXN for a report with no API key.
- **Bills**: fulfillment is SIMULATED.

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
