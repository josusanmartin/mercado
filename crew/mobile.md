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
