# Mercado ecosystem: product structure and brand (v3 UI, supersedes DESIGN-SWITCH.md)

josu, 14 Oct: "The site must read as a FULL ECOSYSTEM, with a distinct view per module. Drop the user/persona selector. The current UI looks like a kid built it: it needs more color and more personality."

## 1. Information architecture: four products, one currency

| Route | Product | Who it's for | What's on it |
|---|---|---|---|
| `/` | **Mercado**, the ecosystem home | judges / anyone | The system map: an animated diagram of money flowing through the four products around xMXN, with live on-chain numbers (xMXN supply, collateral by type, AMM reserve and coverage, remittance volume, pool lent / available). Four big product cards lead in. |
| `/mint` | **Mercado Mint**: xMXN issuance | institutions / sophisticated minters | An institutional dashboard: system supply and collateral mix (OUSD · sOUSD demo · tTBILL demo), your positions per collateral (ratio, liquidation line, yield accruing on sOUSD), mint/repay/withdraw, the peso-appreciation stress view, debt ceilings and utilization. |
| `/remesas` | **Mercado Remesas**: remittances | a sender in the US paying family in Mexico | Send money home (OUSD → xMXN through the vAMM, minted straight to the recipient, with the 'para mamá' memo), **plus pay Tiempo Aire and services** (Telcel airtime, CFE light, etc.) for family through MPP 402. Recent transfers and receipts. Everything SIMULATED is labeled. |
| `/global` | **Mercado Global**: cross-border payments | businesses / fintech partners | B2B MXN↔USD through the vAMM: signed indicative quote ("cotización indicativa firmada": rate, oracle mid, spread, size impact, 30s expiry, minimum received), pay a supplier, redeem xMXN → OUSD, an "exchange backing" panel (reserve, liability, coverage, 24h redemption bucket), and the **partner API** (MPP-paid signed indicative quotes; MPP buys the API response, not the supplier payment) with a code snippet and a live 402 trace. |
| `/credito` | **Mercado Crédito**: credit platform | gig drivers, and lenders | Tabs: **Drivers** (Demo Uber Data → score → advance → repay), **Lenders** (supply/withdraw, pool stats, realized fees, exposure: the old /earn), **Underwriting API** (the bot pays per report over MPP). |

Old routes (`/send`, `/pay`, `/credit`, `/earn`) redirect to their new homes.

### Remesas is mobile-first, shown inside an Android phone
Most remittance users are on Android phones, so on desktop `/remesas` renders the remittance experience **inside a generic Android phone frame**: thin bezels, a punch-hole camera, an Android status bar (time, signal, battery) and the gesture navigation bar at the bottom. Do NOT draw an iPhone (no notch/Dynamic Island, no iOS chrome) and no branded device (no Pixel/Samsung logos). Next to the phone sits a "what just happened" panel: the flow of funds (OUSD → vAMM mint → recipient), the on-chain receipt and explorer link, fees and the rate vs. the oracle mid. On a real phone (<640px) the app runs full-screen with no frame. The in-phone UI is a proper mobile app: big amount keypad, recipient cards ("Mamá · Guadalajara"), a "Recargar Tiempo Aire" and "Pagar servicios" grid, and a receipt screen. Spanish-first copy with English sub-labels.

## 2. No persona selector
- Remove the avatar row. The top bar holds the network chip, **Connect wallet** (Tempo Wallet → Passkey → injected) and a **Demo mode** toggle.
- In Demo mode each product auto-uses its own testnet demo account, named as a role rather than a face. Mint = "Institución demo" (LP), Remesas = "Sender (US)" → recipient "Familia (MX)", Global = "Business demo" (merchant), Crédito = "Driver" on the Drivers tab and "Lender" on the Lenders tab. Show it as a small "Demo account · 0x12…ab" chip in the product header.
- The Demo Tour walks the products in order: Mint → Remesas → Global → Crédito.

## 3. Brand v4 (josu, 02:15): CLEAN, Switch-menu-like, clean colors, NO Paradigm visuals in the product
The pitch deck keeps its dark editorial/glitch look. **The PRODUCT does not.** Remove from the app: the glitch/datamosh art, dark hero bands, warm-paper canvas and boxy bordered cards everywhere.

Think "Nintendo Switch HOME menu, grown-up": calm, bright, airy and immediately legible. It must NOT look childish, so avoid tiny grey text, pills everywhere and toy proportions.
- **Canvas:** clean white `#FFFFFF`, with a soft neutral `#F4F5F7` for page background areas. Dark mode is `#0F1115` / `#1A1D23`.
- **Fewer boxes:** separate content by spacing and type hierarchy, not borders. Use cards only for things you act on (tiles, the action panel). No 1px borders around every section. Shadows only on the focused/hovered tile (soft, single layer).
- **Clean product colors** (flat, bright, no gradients):
  - Mint teal `#00A68A`
  - Remesas orange `#FF8A1F`
  - Global blue `#2F6BFF`
  - Crédito pink `#F2357D`

  Use them as solid fills on product tiles and icons, as the active-tab underline, and for key numbers. Text on fills is white. Everything else stays neutral (ink `#111418`, secondary `#5B6270`, hairline `#E6E8EC`).
- **Home = the Switch row:** four big rounded-square product tiles (≈260px, radius 20px, solid product color, white line icon, product name, one live number), selected with the cyan-teal focus ring (`#00C3E3`, 4px, offset 4px, gentle pulse) and keyboard arrows + Enter. Above the row: "Mercado: one currency, four products" in big clean type. Below: the "How money moves" map, redrawn flat (thin colored lines, small dots, live numbers, no boxes).
- **Product pages:** a simple header (colored icon chip + product name + one-line purpose), then the 3 KPIs as big numbers on white with **no box**, then ONE underline tab row, then content laid out with whitespace: an action column (one card) and lists/rows separated by hairlines.
- **Type:** Instrument Sans 400/500/600. Display 40–56px, numbers 32–48px tabular, body 15–16px, nothing under 13px. DM Mono only for hashes/addresses/API.
- **Icons:** one consistent line set (lucide), 1.75px stroke.
- **Motion:** quick 120–180ms. Tile scale 1.03 + ring on focus. Number tick-ups.
- **Remesas:** still a mobile app inside a generic **Android** phone frame on desktop (rules above). Its in-phone UI follows the same clean language with an orange accent.
- **Honesty labels stay visible:** a quiet footer line plus small neutral badges ("Demo", "SIMULATED", "demo token").

## 4. Ownership (rebuild in parallel)
- `web` FIRST (~25 min): re-skin `@/components/console` into the new brand with the **same component APIs** where possible (so existing screens re-skin automatically), the sidebar shell, theme tokens per product (`data-product="mint|remesas|global|credito"` sets `--accent`), removing the persona bar, Demo mode, and the ecosystem home `/`. Then **/remesas** (send + Tiempo Aire/services, reusing api's billpay components).
- `contracts`: **/mint** (institutional dashboard on the v2 MultiCollateralVault).
- `api`: **/global** (cross-border on the v2 MoveAMM + partner API panel; reassigned from contracts).
- `api`: **/credito** (Drivers / Lenders / Underwriting API; fold in contracts' Earn components), plus redirects for the old /credit, /pay and /earn.
- `slides`: deck only (the app no longer uses the glitch art).
- `qa`: e2e for the new routes, recapture screenshots and the hero video once the products land, and keep the v2 journey going.
- `review`: IA/UX pass (does each product make sense to its user? can a judge grasp the ecosystem from `/` in 10 seconds?) plus labels.
- **Target v2:** the new products build against `activeAddresses()`. lead flips to v2 when crew/V2-SWITCH.md is green.

## 5. Crédito v2 (josu, 02:27): driver phone app + back office
`/credito` has two sections (one tab row): **Driver app** (default) and **Back office**.

**Driver app**, shown inside the same generic **Android phone frame** as Remesas (reuse web's PhoneFrame; web exports it from `@/components/console`), with a "what just happened" panel beside it on desktop and full-screen on a real phone. Spanish-first.
1. **Connect your work account:** three buttons, "Continuar con Uber", "Continuar con DiDi" and "Continuar con Rappi". **No official logos or brand marks** (plain neutral buttons with the name, optionally a small generic car/bike/bag icon), and a line under them: "Demo connection: simulated consent, not affiliated with Uber, DiDi or Rappi. We never ask for your password."
2. Tapping one opens a **simulated consent screen** inside the phone (scopes listed: profile, trips, earnings; "Demo" badge), then loads that platform's **Demo earnings** (Demo Uber Data / Demo DiDi Data / Demo Rappi Data: synthetic fixtures, allowed mocks; add them to MOCKS.md).
3. Then: weekly earnings mini-chart → "Tu línea de crédito: 1,500 xMXN" with why (plain language) → **draw advance** (real on-chain borrow with the signed attestation) → **"Tu adelanto"** (owed, fee, repay button, real repay) → a shortcut to pay Tiempo Aire (opens /remesas?screen=aire).

**Back office**: the credit platform (desktop, clean Brand v4, few boxes):
- KPIs: pool liquidity, outstanding advances, utilization vs 80% cap, realized fees, repayment count. All live from chain.
- **Loan book**: a table of advances from Borrowed/Repaid events (borrower short address, platform, amount, fee, status, opened, explorer link). Live.
- **Underwriting**: recent attestations issued by the API (score, cap, platform, expiry, nonce used yes/no), with the scoring rule explained, labeled "illustrative, not a credit model".
- **Lenders**: supply/withdraw and lender positions (contracts' Earn components).
- **Underwriting API**: the MPP pay-per-report panel and bot trace.

Owners: **`web` builds the Driver app** (phone frame, connect + consent screens, credit line, draw, your advance, Tiempo Aire shortcut) in `components/credito/driver-app/**`. **`api` builds the Back office** plus the API side: DemoDidiProvider + DemoRappiProvider fixtures, `/api/driver/*` accepting `platform`, and the platform carried into the attestation dataHash. api owns the `/credito` page shell and mounts web's DriverApp.

## 6. Mercado Card (josu, 02:28): spend xMXN. Fifth product, color violet `#7C5CFF`
The ecosystem becomes **five products**: Mint · Remesas · Global · Crédito · **Card**. Home headline: "Mercado: one currency, five products." The money map adds Card as the spending edge.

**Wire what we can (real), simulate only the card network:**
- **Real (contracts):** `MercadoCard.sol` (v2 xMXN). The holder issues a virtual card with a **spend limit** (via xMXN approve to the card contract plus an on-chain per-card daily limit), and can **freeze/unfreeze** it. An authorized **merchant terminal** calls `charge(cardId, amount, merchantRef)`, which moves xMXN from holder to merchant **on-chain**, checking frozen / limit / daily window / allowlisted merchant, and emits `CardCharged`. Optional: the holder's per-charge EIP-712 signature (tap-to-pay) so the terminal can't charge arbitrarily. Real refunds via `refund(chargeId)` from the merchant. Tests: frozen, over-limit, daily window, replay, non-merchant.
- **Simulated + labeled:** the card network and PAN. The card shows a demo number like `5x•• •••• •••• 4821`, labeled "Demo virtual card: not a Visa/Mastercard, works only at Mercado demo merchants". No physical card, no ATM.

**UI (`/card`, violet):**
- **Cardholder view inside the Android phone** (same PhoneFrame): the virtual card front (clean violet, "Mercado" wordmark, no network logos), xMXN balance, a **freeze toggle (real)**, a **spend limit slider (real)**, and the **transactions list (real CardCharged/refund events)**.
- **Merchant terminal** beside the phone (desktop): a simple POS ("Tienda Doña Mary · CDMX": generic demo merchant, no real brand). Enter an amount → "Cobrar con Mercado Card" → the phone shows a tap/approve prompt → a real on-chain charge → receipt on both sides with an explorer link.
- Live KPIs: cards issued, xMXN spent through Card, merchants.

**Owners:** `contracts` builds MercadoCard.sol + tests + deploy (alongside v2, address under deployments.v2.card) + hooks in lib/contracts. `web` builds /card UI after DriverApp. `slides` adds Card to the ecosystem (5 products). `qa` adds a card journey step. `review` does an adversarial pass on the charge authorization.
