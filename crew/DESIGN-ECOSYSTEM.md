# Mercado ecosystem: product structure and brand (v3 UI, supersedes DESIGN-SWITCH.md)

josu, 14 Oct: "The site must read as a FULL ECOSYSTEM, with a distinct view per module. Drop the user/persona selector. The current UI looks like a kid built it: it needs more color and more personality."

## 1. Information architecture: four products, one currency

| Route | Product | Who it's for | What's on it |
|---|---|---|---|
| `/` | **Mercado**, the ecosystem home | judges / anyone | The system map: an animated diagram of money flowing through the four products around xMXN, with live on-chain numbers (xMXN supply, collateral by type, AMM reserve and coverage, remittance volume, pool lent / available). Four big product cards lead in. |
| `/mint` | **Mercado Mint**: xMXN issuance | institutions / sophisticated minters | An institutional dashboard: system supply and collateral mix (OUSD · sOUSD demo · tTBILL demo), your positions per collateral (ratio, liquidation line, yield accruing on sOUSD), mint/repay/withdraw, the peso-appreciation stress view, debt ceilings and utilization. |
| `/remesas` | **Mercado Remesas**: remittances | a sender in the US paying family in Mexico | Send money home (OUSD → xMXN through the vAMM, minted straight to the recipient, with the 'para mamá' memo), **plus pay Tiempo Aire and services** (Telcel airtime, CFE light, etc.) for family through MPP 402. Recent transfers and receipts. Everything SIMULATED is labeled. |
| `/global` | **Mercado Global**: cross-border payments | businesses / fintech partners | B2B MXN↔USD through the vAMM: firm quote (rate, oracle mid, spread, size impact), pay a supplier, redeem xMXN → OUSD, an "exchange backing" panel (reserve, liability, coverage, 24h redemption bucket), and the **partner API** (MPP-paid firm quotes) with a code snippet and a live 402 trace. |
| `/credito` | **Mercado Crédito**: credit platform | gig drivers, and lenders | Tabs: **Drivers** (Demo Uber Data → score → advance → repay), **Lenders** (supply/withdraw, pool stats, realized fees, exposure: the old /earn), **Underwriting API** (the bot pays per report over MPP). |

Old routes (`/send`, `/pay`, `/credit`, `/earn`) redirect to their new homes.

### Remesas is mobile-first, shown inside an Android phone
Most remittance users are on Android phones, so on desktop `/remesas` renders the remittance experience **inside a generic Android phone frame**: thin bezels, a punch-hole camera, an Android status bar (time, signal, battery) and the gesture navigation bar at the bottom. Do NOT draw an iPhone (no notch/Dynamic Island, no iOS chrome) and no branded device (no Pixel/Samsung logos). Next to the phone sits a "what just happened" panel: the flow of funds (OUSD → vAMM mint → recipient), the on-chain receipt and explorer link, fees and the rate vs. the oracle mid. On a real phone (<640px) the app runs full-screen with no frame. The in-phone UI is a proper mobile app: big amount keypad, recipient cards ("Mamá · Guadalajara"), a "Recargar Tiempo Aire" and "Pagar servicios" grid, and a receipt screen. Spanish-first copy with English sub-labels.

## 2. No persona selector
- Remove the avatar row. The top bar holds the network chip, **Connect wallet** (Tempo Wallet → Passkey → injected) and a **Demo mode** toggle.
- In Demo mode each product auto-uses its own testnet demo account, named as a role rather than a face. Mint = "Institución demo" (LP), Remesas = "Sender (US)" → recipient "Familia (MX)", Global = "Business demo" (merchant), Crédito = "Driver" on the Drivers tab and "Lender" on the Lenders tab. Show it as a small "Demo account · 0x12…ab" chip in the product header.
- The Demo Tour walks the products in order: Mint → Remesas → Global → Crédito.

## 3. Brand: Mexican-modern fintech, confident and colorful (NOT toy-like)
**Kill the kid look:** no oversized pills everywhere, no toy-like rounded tiles, no flat grey canvas with tiny text, no cartoon icons or emoji. Personality comes from color, type, art and data density.

- **Canvas:** warm paper `#F5EFE4` (light) / deep ink `#15110E` (dark). Cards are `#FFFDF8` with 1px `#E7DCCB` borders and radius 12–14px. Shadows stay subtle.
- **Each product has a signature color**, used for its hero band, active nav, charts, key numbers and primary buttons:
  - Mint: **jade** `#0E7C66`
  - Remesas: **cempasúchil (marigold)** `#F08C00`
  - Global: **talavera cobalt** `#1E4FD6`
  - Crédito: **rosa mexicano** `#E4007C`
  - The Mercado home uses all four together.
  - Ink `#15110E` for text and a status set (success `#1F9D55`, warning `#C77700`, danger `#C4352B`).
- **Type** (shared with the pitch deck): Instrument Sans (400/500/600/700) for UI and display. Big confident numbers at 48–72px with tabular figures. DM Mono for hashes, addresses, API snippets and the 402 trace. Tight tracking on display sizes.
- **Art:** each product's hero band carries generated glitch/datamosh art in its color (same generator as the deck: deck/art/make_art.py, so app and deck look like one brand). `slides` renders the banners into `apps/web/public/art/` (mint, remesas, global, credito, home), 2400×480 plus a square.
- **Layout:** a left sidebar with the product switcher (Mercado home + four products, each with its color dot and short name), collapsing to a bottom tab bar on mobile. The product page is a hero band (name, one-line purpose, 3 live KPIs over the art), then a grid of cards: action panel(s), charts (simple SVG: no new chart framework), and an activity table with explorer links.
- **Motion:** purposeful only: number tick-ups, the home flow diagram's moving particles, a 150ms panel transition.
- **Honesty stays visible everywhere:** the footer line ("Testnet prototype · OUSD has no real value · xMXN not redeemable for pesos") and the in-panel Demo / SIMULATED / demo-token badges.

## 4. Ownership (rebuild in parallel)
- `web` FIRST (~25 min): re-skin `@/components/console` into the new brand with the **same component APIs** where possible (so existing screens re-skin automatically), the sidebar shell, theme tokens per product (`data-product="mint|remesas|global|credito"` sets `--accent`), removing the persona bar, Demo mode, and the ecosystem home `/`. Then **/remesas** (send + Tiempo Aire/services, reusing api's billpay components).
- `contracts`: **/mint** (institutional dashboard on the v2 MultiCollateralVault) and **/global** (cross-border on the v2 MoveAMM + partner API panel).
- `api`: **/credito** (Drivers / Lenders / Underwriting API; fold in contracts' Earn components), plus redirects for the old /credit, /pay and /earn.
- `slides`: the app hero art (above), then the deck's ecosystem story.
- `qa`: e2e for the new routes, recapture screenshots and the hero video once the products land, and keep the v2 journey going.
- `review`: IA/UX pass (does each product make sense to its user? can a judge grasp the ecosystem from `/` in 10 seconds?) plus labels.
- **Target v2:** the new products build against `activeAddresses()`. lead flips to v2 when crew/V2-SWITCH.md is green.
