# Platform redesign: "console menu" language (inspired by the Nintendo Switch HOME menu)

josu: the platform looks too "vibecoded". He loves how clean the Switch menu is, so we adopt its *language* and build our own components.
**No Nintendo assets:** no logos, Joy-Con art, Mii art, system sounds or the "Nintendo Switch" name in the UI. Original components only.

## What makes that menu feel clean (copy these principles)
- **Flat, bright canvas.** A "basic white" theme (#ebebeb page, #ffffff tiles) and a "basic black" theme (#2d2d2d page, #3c3c3c tiles), and nothing else. No gradients, glassmorphism, blobs, noise or decorative illustrations. Shadows are soft and single-layer.
- **One accent: the selection ring.** The focused element gets a thick (4–5px) cyan/teal ring (~#00c3e3) with a slow pulse (opacity 1 ↔ 0.55, ~1.2s), offset 3–4px from the element, following the element's radius. Nothing else is colored. Status colors only in tiny dots/badges.
- **Big rounded-square tiles in one horizontal row** on Home: ~240–280px squares, radius ~14px, 16–20px gaps, scrolling horizontally. The selected tile shows its **title above the row** in the accent color (like the game title over the selected icon).
- **Top bar:** left, the persona avatars as round profile circles (Lupita/Driver, Elena/Lender, LP, Sender, Recipient). The active one is ringed, and clicking one switches persona (the Demo Tour personas). Right, small status: network "Moderato 42431" chip, a wallet-balance "battery" readout (xMXN), and a clock.
- **Bottom row of circular icon buttons** (~64px circles, thin line icons): Receipts, Contracts/Explorer, Wallet, Network & honesty info, Settings (theme toggle).
- **Bottom hint bar:** thin 1px rule above, with right-aligned button hints: "(A) Open  (B) Back  (+) Demo Tour". Real keyboard support: arrow keys move focus across tiles and lists, Enter = A, Esc/Backspace = B, `+`/`t` = Demo Tour.
- **Inner screens = System-Settings layout:** a left vertical list of sections (selected row has a thin accent bar on the left and the same cyan ring when focused), and a right content panel with plain rows: label on the left, value on the right, 1px dividers, generous 64–72px row height. Primary actions are wide pill buttons at the bottom of the panel.
- **Type:** one clean geometric/rounded sans, regular plus medium, with nothing heavier than 600 (e.g. "Nunito Sans" or "Rubik"). Sizes: 15–17px body, 20–24px titles, big numbers 40–56px. No serifs, no monospace except tx hashes.
- **Motion:** quick and snappy (120–180ms ease-out). Tiles scale 1.0 → 1.04 when selected. Panels slide in 12px. No bouncy or overshoot animation, no confetti.
- **Copy:** short, friendly and literal. Use sentence case.

## Mercado mapping
- **Home** = the tile row: Create pesos · Send money · Get an advance · Pay bills · Earn · Demo Tour. Each tile shows a simple flat glyph plus one live number (e.g. "1,400 available"). Under the row are the three money buckets as quiet System-Settings-style rows.
- Each journey screen uses the Settings layout (left list = steps or sections, right = panel).
- **Honesty labels stay visible on every screen** (SPEC §6): a quiet persistent line in the hint bar on the left, "Testnet prototype · OUSD has no real value · not redeemable", and the Demo/SIMULATED badges inside the panels. Never hide them on mobile.
- **Mobile:** the tile row becomes a 2-column grid, the bottom circles shrink to 48px, and the hint bar becomes a sticky footer with the honesty line.

## Ownership
- `web` builds the design system FIRST and commits it within ~20 min: theme tokens (light/dark), `Tile`, `TileRow`, `SelectionRing`, `ProfileBar`, `CircleButton`, `HintBar`, `SettingsLayout` (`ListPane` + `Panel` + `Row`), and keyboard focus handling. Then Home, Mint, Send, Tour and the shell.
- `api` restyles /credit and /pay, `contracts` restyles /earn, all on web's components. No one-off styling.
- `review` checks the labels and keyboard flow afterwards. `qa` and `slides` recapture screenshots once it lands.
