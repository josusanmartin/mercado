# Ecosystem IA and UX review

Started02:09 UTC,14 Oct2026. Authority: `crew/DESIGN-ECOSYSTEM.md` plus josu's02:08 “mock only necessary; wire everything” rule. This supersedes console-menu acceptance as the current UI target. V2 contracts/deployed accounting are checked; ecosystem routes/shell are being rebuilt. No reviewer commits or live broadcasts.

PRINCIPLES.md at02:58 supersedes every earlier visual brief: paper/ink, Archivo Black or Anton + Inter Tight, cultural accents, one image-in-type hero and a numbered editorial six-product index. Phone fintech structure stays; Card uses ink/cream. Josu also removed the generic KPI strip: numbers belong beside the relevant action. Compact no-value/simulation labels must remain visible and contrast-safe, including cropped phone views.

## Home in ten seconds

A judge should immediately see **six named products, one active xMXN** and know where to click: Mint (institutions), Remesas (families), Global (businesses), Crédito (drivers/lenders), Card (spending), Invest (savers). Product names and purposes beat internal contract names. The six product accents identify destinations; money-flow arrows explain real operations rather than generic decorative motion.

Correct flow semantics: Mint/CDP issuance creates supply; Global/Remesas OUSD exchange also mints through the AMM; transfers and credit draws move existing supply. Credit repayment returns xMXN to pool liquidity and does not burn. CDP repayment and AMM xMXN redemption burn. Do not merge the two kinds of repayment into a credit→burn arrow.

KPIs need units, scope and provenance. Supply is a stock; reserve is tracked OUSD; collateral mix must use explicit token units or oracle-normalized value; AMM liability is not total xMXN supply. Cumulative remittances are confirmed event totals over a stated range, not recipient balance, merchant balance or browser history. Credit principal out, collectible fees and realized fees are different quantities. An unreadable query is unavailable, never zero.

## Product acceptance

| Product | User should be able to do | Critical evidence / failure case |
|---|---|---|
| Mint | Inspect each collateral position; deposit/mint, repay/burn, withdraw; understand ceilings and FX stress | Token-specific params/price/ratio, actual funded sOUSD growth, demo RWA labels, receipt and supply change; no old one-argument vault reads |
| Remesas | Send to family and buy supported airtime/services, then find the exact receipt | Spanish-first recipient/input/quote/confirm/receipt; exact delivery; no cashout claim; separate xMXN settlement from SIMULATED fulfillment; interrupted memo flow can send already-minted tokens without minting again |
| Global | Quote either direction, pay a supplier or redeem, and buy an API quote | Signed indicative quote, expiry/min received, actual execution receipt; reserve/haircut/cap; API fee is separate from trade principal. No firm-fill promise |
| Crédito | Driver phone + back office: draw/repay, lenders and underwriting | Uber/DiDi/Rappi simulated consent and platform-specific fixtures; live loan book/terms; illustrative score, unsecured manual repayment |
| Card | Holder approves a payment; demo merchant charges or refunds | Real v2 issuance/freeze/limits, holder tap signature and charge/refund receipts; simulated PAN/network; Mercado demo merchants only |
| Invest | Save through lending/staking or trade demo tTBILL | Variable realized fees, demo-funded yield, admin-priced finite inventory; marked portfolio value differs from withdrawable cash |

Demo mode must pin the initiating account through confirmation. Route/tab changes cannot auto-switch accounts mid-flow. With Demo off, product navigation must preserve the external wallet. Header shows role and shortened account; receipt freezes the payer, recipient, token/version and actual amount. Business demo requires actual OUSD/xMXN and lender tab must use the lender, not the driver.

Remesas funding must be coherent: sending freshly minted xMXN straight to family leaves the sender with none of that mint to buy airtime. Either sender already has a disclosed real testnet balance, or the flow offers an actual OUSD→xMXN funding action. A fee sponsor pays network fees, not the bill principal. Never hide a faucet top-up behind a purchase success.

Android frame appears only on desktop; under640px it disappears. Verify no nested horizontal scroll, no clipped receipt/CTA, keyboard reachable actions, readable product-color contrast and fixed bottom navigation that does not cover the honesty footer. Generic Android chrome only; no iOS/notch or device brand.

Old routes must preserve intent: `/earn`→`/credito?tab=lenders`; `/credit`→Drivers; `/pay`→Remesas airtime/order recovery; `/send`→Remesas Send. Saved unpaid orders must remain recoverable under the correct payer/token; redirects must never auto-pay. The tour becomes Mint→Remesas→Global→Crédito→Card→Invest and must target real route sections after redirects.

## Carry-forward findings and owner handoff

- R-030: shared switch and complete product wiring. Source gate now rejects missing required addresses;7 gate cases/15 sponsor boundaries pass. API's independent standalone read-only17 checks also pass; current ecosystem UI/e2e still pending.
- R-031: backing labels. Net contributed capital is not remaining equity; leaky-bucket usage is not “Redeemed today”; remove “no one can run first.” Owner now contracts for Global, web for any reused Remesas panel.
- R-032: memo helper validates recipient before mint and handles undefined decoded amount. Owner web (Remesas).
- R-033: old mobile Send connect CTA overflow. Recheck in Android/full-screen Remesas; old-route acceptance does not close the new layout.
- R-034: direct xMXN Send must use its own tx state and lock both hooks while either is busy. Owner web.
- R-035: Crédito fee/utilization/per-user cap must come from configurable chain params. Owner api with contracts hook support.
- The original console regressions/receipts remain preserved as historical evidence; new routes need fresh checks.

## Next check sequence

1. Read IRC, MOCKS.md and changed owners' code; review/MOCK-AUDIT.md tracks every data source and exception.
2. Review new shared shell/Home first; verify all six product identities and correct mint/transfer/repay/burn arrows.
3. Browser test all new routes on3100 (active default) and isolated3101 v2 preview if owner keeps it running. No reviewer writes to chain. Test redirects, demo-role changes and unpaid recovery; leave paid/chain actions to QA evidence or isolated adapters.
4. Compare each financial KPI/activity row to active-version pinned chain/API state; don't mix v1/v2 or count events twice.
5. Recheck owner fixes and update FINDINGS/PRODUCT continuously. Lead alone flips and commits.

## Fifth product / Crédito expansion (02:30)

Card requires a fresh authorization gate; see CARD-REVIEW.md. Source not yet present at this snapshot. Global ownership moved to api. Current Crédito Lenders redirect must continue to reach lending after the new Driver app/Back office split. Brand v4 mobile shell initially overflowed, owner reports fixed; fresh check pending. Remesas unpaid saved-order recovery now independently passes; failed direct-delivery retry still drops stranded state (R-039).

Invest queued02:33 after Card; pricing/inventory/returns checklist in INVEST-REVIEW.md. Six destinations supersede earlier four/five-product snapshots.
