# Brief: `mobile` (Android app realism)

josu: "For the Phone UI use real logos, and make it as realistic as possible." You own making every in-phone experience look and feel like a real, polished **Android** app (Remesas, Crédito driver app, Card cardholder, Invest saver).

## You own
- `apps/web/components/mobile/**`: a mobile UI kit (Material 3-inspired: top app bar, bottom sheet, list items, FAB, chips, snackbar/toast, numeric keypad, bottom navigation, skeletons, ripple/press states, page transitions).
- The phone frame (`PhoneFrame` in `@/components/console`, coordinate with @web who exported it). Make the device realistic: a generic modern Android (no Pixel/Samsung branding, no iPhone cues), punch-hole camera, accurate Android 15-style status bar (live clock, signal/wifi/battery), gesture nav handle, subtle bezel/shadow and screen glare, Roboto or Google Sans-like system font **inside the phone only** (Roboto/Roboto Flex from Google Fonts), and 48dp touch targets.
- The in-phone screens of **Remesas** (from @web) and the **Crédito DriverApp** (`components/credito/driver-app/**`, from @web). For **Card** (@web) and **Invest** (@api), provide the kit plus review, and they integrate.

## Real logos (josu approved), with guardrails
- Use the real **Uber, DiDi and Rappi** logos on the "Continuar con …" buttons. Uber: the simple-icons SVG (npm `simple-icons`, or the jsdelivr CDN). DiDi and Rappi: official SVG/PNG from their press/brand pages or Wikimedia Commons. Save under `apps/web/public/brands/` with a `SOURCES.md` (url + license/trademark note). Follow each brand's basic logo rules (no recoloring/distortion, clear space).
- Keep the "not affiliated" line visible under the buttons.
- **The consent step must NOT replicate Uber's/DiDi's/Rappi's own login or consent pages, and must NEVER show a username/password field.** It's a Mercado bottom sheet: the platform logo + "Mercado quiere acceder a: perfil, viajes, ganancias" + Permitir/Cancelar + a "Demo: consentimiento simulado" badge. Realistic as an in-app OAuth hand-off sheet, honest about being simulated.
- Same idea elsewhere: Telcel/CFE may show their real logos on the Tiempo Aire/servicios tiles, with SIMULATED fulfillment still labeled. Never put Visa/Mastercard marks on the Mercado Card.

## Realism checklist
Spanish-first copy (es-MX), MXN formatting (`$1,234.56`), realistic content (recipient avatars as initials, "Mamá · Guadalajara"), loading/empty/error states, haptic-like press feedback, smooth 200–250ms Material motion, a keyboard sheet for amounts, a success screen with a check animation, and the honesty labels kept (small, but present on every money screen).

Read crew/COMMON.md, crew/DESIGN-ECOSYSTEM.md (§3 Brand v4, §5 Crédito, §6 Card, §7 Invest) first. Announce in #mercado. Coordinate file handoffs with @web and @api before editing their files.

## v2 direction (josu, 02:55): "still horrible, copy the design of top clean fintech apps like DolarApp"
Adopt the **design language** of top Latin American fintech apps like DolarApp/Revolut. Do NOT copy their logos, names, illustrations or exact screens.
- **Dark-first:** near-black canvas `#0B0B0C`, surfaces `#16171A`/`#1E2024`, white primary text, `#9BA1A6` secondary. The product accent is used sparingly (Remesas orange, Crédito pink, Card violet, Invest gold) for the primary action and key highlights only.
- **One huge balance:** "Saldo total" small label, then **US$1,250.00** in 44–52px semibold with tabular figures. Under it, a small accent chip (e.g. "+$3.20 este mes" from REAL data only, or the rate chip "1 USD = 18.37 MXN").
- **Currency cards side by side:** USD (🇺🇸) and MXN (🇲🇽) mini-cards with their own balances (the MXN card = the xMXN balance).
- **Round action row:** 4–5 circular 56px icon buttons with a short label underneath (Agregar · Enviar · Recibir · Tiempo Aire · Servicios). No boxy tiles.
- **Lists like a bank app:** 56–64px rows with a round avatar/brand logo, title + subtitle, and the amount right-aligned (+green / −white). Grouped by "Hoy / Ayer".
- **Kill the clutter:** NO bilingual duplication inside the phone (Spanish only in-app; English belongs in the desktop "what just happened" panel). NO explanatory paragraphs inside the phone. Honesty stays, but compact: ONE tiny "Testnet · sin valor real" pill near the balance, "Demo"/"Simulado" chips where relevant, and the full explanations move to the desktop panel beside the phone.
- **Typography:** Inter (or Roboto Flex) inside the phone, weights 400/500/600, generous line height, 16px body, 13px captions.
- **Motion:** spring-y sheet presentation, number tick-ups, a success screen with a big check.
- **Bottom nav:** 4 icons (Inicio · Tarjeta · Actividad · Perfil) with a small active dot.
Apply to ALL in-phone apps: **Remesas, Crédito DriverApp, Card holder, Invest** (coordinate with @web for Card and @api for Invest, or take the visual layer yourself with their OK). Remesas first, then Card, Crédito, Invest.

## Split (lead, 02:56)
- `mobile`: the kit (`components/mobile/**`), PhoneFrame, **Remesas** and **Card** phone apps.
- `mobile2`: **Crédito DriverApp** (`components/credito/driver-app/**`) and **Invest** phone app (`components/invest/**` phone parts, with @api's OK). Uses mobile's kit; for missing kit pieces, ask @mobile or add them under `components/mobile/extra/**`.
