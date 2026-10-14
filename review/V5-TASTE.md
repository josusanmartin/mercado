# V5 taste critique — make the interface feel finished

Review: 2026-10-14 · reviewer: `review` · requested by lead/josu.

**Verdict: a much stronger identity, still short of top fintech execution.** The cultural typography, product colors and editorial layout give Mercado something memorable. The unfinished feeling comes from competing type scales, utility chrome, generic forms, abrupt data-state replacement and overlapping entrances. Adding more animated components will magnify those problems. The highest-return pass is to make the existing visual language more deliberate.

In three minutes, I remember the striped Mercado wordmark and six colored products. I should also remember how confidently money moves through one coherent application. Global currently feels like a protocol settings page inside an expressive brand; Developers looks like a landing-page headline attached to an internal tool; Mint looks like a statistics overview without an obvious next action.

## Evidence and limits

- Inspected all nine routes at **1440×900 and 390×844, light and dark**. The 36 cases completed with **zero page exceptions, HTTP errors or horizontal document overflow**. These are bounded browser observations, not a general performance certification. [Capture matrix](v5-taste-evidence/stills/browser-matrix.json).
- Recorded four short navigation/interaction clips: [desktop light](v5-taste-evidence/motion/1440-light.webm), [desktop dark](v5-taste-evidence/motion/1440-dark.webm), [phone light](v5-taste-evidence/motion/390-light.webm), [phone dark](v5-taste-evidence/motion/390-dark.webm). They cover Home row hover, navigation to Global, quote amount editing, a backing-tab change and opening Remesas Send. **No payment, signature or transaction was submitted.** Actual payment-success choreography was not exercised in this round.
- Eight additional reduced-motion cases, Home and Global at both sizes/themes: no running animations at the settled observation and no page errors; honesty labels remained visible. This is not exhaustive reduced-motion coverage. [Results](v5-taste-evidence/reduced/motion-present.json).
- Main still captures: **05:59:30–06:01:15 UTC**, starting HEAD `630eb44`, following the shipped `51a92fc..630eb44` web pass. The shared tree remained live; `615fee5`, Crédito `4186992`, shared phone kit `1216eb0` and Remesas `5e6bfb8` arrived during review. Phone observations below describe the captured state and are explicitly provisional. Do not use these screenshots to reject a later skin without recapturing it. [End-of-review source hashes](v5-taste-evidence/source-cutoff.json) record the later checkout, not the earlier browser bundle.
- Motion frame filenames such as `route-90ms` are **nominal capture offsets**. Screenshot overhead changes the actual timing; [event timestamps and animation samples](v5-taste-evidence/motion/inspection.json) are authoritative. Animation counts are not frame-rate or jank measurements.
- This report and its evidence are the only changes made for the taste task. No application code changes, server restart or build.

The external comparison is a taste reference, not an authenticated app benchmark. [Linear's public presentation](https://linear.app/) offers disciplined hierarchy and product-focused composition ([settled capture](v5-taste-evidence/references/linear-settled.png)); [DolarApp currently redirects to ARQ](https://www.arqfinance.com/en-MX), whose public page pairs a human scene with restrained navigation and a clear action. Those are useful standards of finish, not layouts to copy. Revolut's public page was available through web text retrieval, but its browser capture hit a security challenge; I did **not** visually inspect the current native Revolut app. [Revolut](https://www.revolut.com/), [reference capture record](v5-taste-evidence/references/inspection.json).

Coordination at 06:11 UTC: lead has already approved the stable Global slots and single-owner entrance rule in #1/#3. Mobile reports the shared press/success/navigation kit shipped; #7/#8 therefore ask for integration and the remaining web Button parity, not a second phone-kit implementation. Lead also approved a shared LetterReveal accessible-name correction; preserve the complete word for assistive technology when changing the choreography. These are crew-reported changes, not revalidated fixes in this capture set. [IRC record](v5-taste-evidence/irc-final-inbox.txt).

## Ranked upgrades

Effort is relative: S = a bounded component/style pass; M = coordinated layout/state work. Impact estimates concern judge-facing polish, not engineering severity. No visual finding here is classified as a demo-breaking P0.

| Rank | Upgrade | Priority | Impact / effort | Primary owner | Support |
|---|---|---|---|---|---|
| 1 | Keep form and quote geometry stable through connection/loading | P1 | Very high / M | web | api |
| 2 | Give utility pages smaller headers and complete sentences | P1 | High / S | web | api, contracts |
| 3 | Give each entrance one animation owner | P1 | High / S | web | api, contracts, mobile |
| 4 | Rework the phone console's navigation and fixed chrome | P1 | Very high / M | web | mobile |
| 5 | Make Global a money action, with a clear amount hierarchy | P1 | High / M | api | web |
| 6 | Make the Home index scannable in seconds | P1 | High / S | web | — |
| 7 | Finish phone color/theme continuity as a shared system | P1 | High / M, in progress | mobile | mobile2 |
| 8 | Finish control feedback and neutral surface tokens | P2 | Medium / S | web | mobile |
| 9 | Quiet the sidebar and fix its active destination | P1 | Medium / S | web | — |
| 10 | Give Mint's overview a purposeful lower half | P2 | Medium / S | contracts | web |

### 1. Stop the payment form appearing as a second page inside the page

**Evidence:** [early Global frame](v5-taste-evidence/motion/1440-light-route-90ms.png), [form replacement](v5-taste-evidence/motion/1440-light-route-180ms.png), [settled state](v5-taste-evidence/motion/1440-light-global-settled.png). `apps/web/components/shell/connect-gate.tsx:33` returns entirely different content once connected; `apps/web/components/global/global-screen.tsx:176` wraps the form in that gate, and `:265` swaps loading text for the quote block.

**Why it feels unfinished:** the user sees an account-retry card, then a taller form, then a large quote. Meanwhile the heading, panels and sidebar are moving. It looks like pieces of the app are being assembled, even though navigation itself is quick.

**Exact change:** add a form-preserving connection mode to `ConnectGate`. Render the form geometry immediately, disable the relevant fieldset while connecting, and place **“Connecting demo account…”** in a fixed-height status slot beside the action. Retain the explicit wrong-network/error/retry states. Reserve the quote amount and essential rate rows while unknown; use `—` and **“Getting quote…”**, never an invented zero. During requoting, keep the last value labeled **“Updating quote…”** and disable submission until the current quote is valid. Keep the action at the same width and vertical position through pending/ready/error states.

**Acceptance:** a fresh Home→Global arrival does not replace the form with a differently sized card; quote arrival does not move the action. A delayed/error quote remains visibly distinct from an executable quote.

### 2. Stop treating every utility heading as a campaign headline

**Evidence:** [desktop Developers](v5-taste-evidence/stills/1440-light-normal-developers.png), [phone Developers](v5-taste-evidence/stills/390-light-normal-developers.png), [phone Contracts](v5-taste-evidence/stills/390-dark-normal-contracts.png), [phone Mint](v5-taste-evidence/stills/390-light-normal-mint.png). `components/console/settings.tsx:112` gives utility titles up to 80px; `:125` applies `line-clamp-2` to all purpose text. Paths in this report are under `apps/web/` unless otherwise specified.

**Why it feels unfinished:** Developers uses two enormous desktop lines before any API interaction; on phones both utility descriptions end mid-thought. Visible ellipses in introductory prose read like an unresolved responsive layout.

**Exact change:** add `heroVariant="utility"` for Developers/Contracts: Archivo title `clamp(2rem,4vw,3rem)`, 16px body, 24px gap to tabs. Keep the large brand/product titles on Home and the six product bands. Use these complete utility titles and purposes:

- **APIs over HTTP 402** — “Pay per call in xMXN. Inspect the challenge, response and on-chain receipt.”
- **Verified contracts** — “Inspect deployed contracts, source verification and admin powers.”

Remove blanket clamping from purpose copy; write a short responsive sentence and place fuller explanation in the relevant body section. Mint can use **“Create xMXN against OUSD or yield-bearing collateral.”** Preserve testnet disclosures. Move repeated account metadata into the existing account control rather than giving it a second line in the utility hero.

**Acceptance:** no introductory sentence is cut off at 390px; utility tabs and the beginning of useful content are visible substantially earlier. Preserve the bold editorial identity on actual product heroes.

### 3. Choreograph motion instead of layering entrance presets

**Evidence:** [motion samples](v5-taste-evidence/motion/inspection.json); Global reached up to **19 concurrent animations on desktop and 15 on phone**, including letters, route/panel entrances and connection feedback. `components/console/shell.tsx:53` animates the entire route; `components/console/settings.tsx:189` animates each Panel; `lib/motion/index.tsx:70` supplies letter delays; `app/globals.css:344` defines their keyframes. These counts explain overlapping effects; they do not prove dropped frames.

**Exact change:** animate the page's content group once: opacity plus `translateY(6px)`, 220ms, the existing ease-out curve. Add an `animate` option to Panel and disable its independent entrance inside an already animated group. Use letter reveal for the short product word only; keep long utility titles immediately readable. If letters retain 360ms duration, cap their delay budget at **140ms** with `step = min(28, floor(140 / max(letterCount - 1, 1)))` so the last letter finishes by 500ms. Current 260ms delay budgeting can exceed that limit on longer words.

Keep monetary inputs and the primary action fully opaque while entering. Use a single 180ms crossfade for tab content rather than replaying every row. Retain the pure-CSS final-visible behavior and reduced-motion overrides; do not reintroduce JS-gated hidden content. For Home's continuous texture pan and row sweep, profile the paint cost before claiming smoothness; `background-position`/`background-size` are currently animated. A clipped transform-driven decorative layer can provide the same effect if needed.

**Acceptance:** one coherent arrival, every word readable within 500ms, no delayed action reveal, no decorative movement under reduced motion. Keep the useful sidebar movement and shared success motif.

### 4. Give the phone console its usable screen back

**Evidence:** [Home phone](v5-taste-evidence/stills/390-light-normal-home.png), [Global phone](v5-taste-evidence/stills/390-dark-normal-global.png), [Contracts phone](v5-taste-evidence/stills/390-dark-normal-contracts.png). `components/console/shell.tsx:161` renders seven `min-w-16` destinations in a horizontal rail with the scrollbar hidden; Invest is offscreen at 390px. `components/console/hint-bar.tsx:7` fixes a translucent honesty footer above it. Content remains faintly visible underneath the footer.

**Exact change:** replace the seven-slot phone rail with four stable destinations: **Home, Products, Tour, More**. Products opens the six-product list, with the current product marked; More contains Developers, Contracts and Theme. Keep the active product name in the page header. Use four equal columns and a 56px navigation height plus safe area. Retain the existing honesty text and `data-honesty`; make its background opaque and reserve its actual height in the scrolling viewport so text never shows through it. Do not solve this by hiding the testnet warning. On console pages, combine the short hero from #2 with `gap-6` below 640px instead of the repeated 40px section gaps.

**Acceptance:** every product is discoverable without guessing that the rail scrolls; focused fields and actions can scroll fully clear of both fixed layers. Check safe-area and keyboard states at 390×844. Native product-phone skins can retain their own internal navigation.

### 5. Make Global look like a transfer, not a settings form

**Evidence:** [desktop Global](v5-taste-evidence/stills/1440-light-normal-global.png), [phone Global](v5-taste-evidence/stills/390-light-normal-global.png). `components/global/global-screen.tsx:171` starts with a long v1/v2 description; `:178` gives the outgoing amount a conventional small input, while `:278` gives the incoming amount a display treatment in a separate panel. Protocol explanation visually precedes the action.

**Exact change:** compose the primary well in this order: **“You pay” → large editable amount → “Supplier receives” → large quoted amount → recipient → primary button**. Use a 36–40px tabular amount, 14px currency label, and a compact rate/fee/expiry line between the two amounts. On desktop the detailed quote can stay adjacent, but it must be secondary. Keep current validation, minimum-received information and quote expiry explicit before submission. Put optional reference behind **“Add reference”** and move the v1/v2 routing explanation under **“How this payment settles”** below the action. Rename the sample-address action **“Use demo supplier”** with the abbreviated address alongside it.

The existing equal-width layout can become `lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]`, with the payment well using 24px padding and the secondary side using plain rows. Do not introduce another stack of nested cards.

**Acceptance:** within two seconds the user can identify amount, destination, result and action. At 1440×900 the button clears the footer; on phone, amount and recipient begin in the first usable viewport and the action needs at most a short scroll.

### 6. Make the six-product index read as one system

**Evidence:** [desktop Home](v5-taste-evidence/stills/1440-light-normal-home.png), [phone Home](v5-taste-evidence/stills/390-light-normal-home.png). `components/home/ecosystem-home.tsx:154` supplies large row padding; `:162` caps product names at 80px, `:167` uses 18px descriptions, and `:170` makes every metric another bold display. On desktop only the first two products are fully visible initially; phone reaches only the beginning of Mint.

**Exact change:** keep the image-in-type hero and Tour CTA. Reduce the gap before the index from 56px to 32px. For index rows use `py-4`, product name `clamp(1.75rem,3.2vw,2.75rem)`, a 15px sentence, and a 22–24px Inter Tight tabular metric. On phone put name and metric on the same row and let the description span beneath, instead of starting the metric as a third text level. Keep one hairline per row and the product-color cue. Restrict Archivo display to the product name in each row.

**Acceptance:** the index feels like six related choices, not six subsequent hero sections. Aim for at least four complete product rows visible initially on desktop and substantially faster scanning on phone; preserve 44px-or-larger click targets and the existing keyboard behavior.

### 7. Finish the phone skins with explicit theme continuity — in progress

**Evidence:** [dark Invest capture](v5-taste-evidence/stills/390-dark-normal-invest.png) shows a white app below a dark shell, while [dark Card](v5-taste-evidence/stills/390-dark-normal-card.png) uses ink throughout. `components/invest/invest-screen.tsx:134` and `components/remesas/remesas-screen.tsx:81` use the default phone theme; `components/card/card-screen.tsx:172` explicitly selects `ink`. Shared surfaces are defined in `components/mobile/mobile.css:6`. Crédito skin commit `4186992` landed after the baseline captures.

**Exact change:** settle the theme contract in shared `PhoneFrame`/mobile tokens. Native phone surfaces should follow the selected light/dark theme; allow an explicit branded dark treatment for the Card artwork, rather than forcing the entire app into a separate theme. Map `--m-surface`, `--m-surface-1`, outline and text tokens from one light/ink pair. Use one shared AccentField for the product-colored phone header and one shared success component. Keep the existing product hues, the approved live Invest decimals, and honest empty/loading states. Avoid adding separate reveal wrappers to each screen on top of the shared entrance.

**Acceptance:** light/dark switches change phone and outer shell coherently, with no white seam under dark chrome; all four native products share control sizing and transition rules. Recheck after mobile/mobile2 finish. This is an integration target for their current work, not a claim that their new skin has failed.

### 8. Finish the controls and make neutral surfaces intentional

**Evidence:** [Developers action well](v5-taste-evidence/stills/1440-light-normal-developers.png), [Global action well](v5-taste-evidence/stills/1440-light-normal-global.png). `components/ui/button.tsx:7` transitions color/background/shadow but does not include the shared press motion. `app/globals.css:19` uses the old warm `--well: #f4f2ec` across operational panels, including cobalt Global. The application already has a visible global focus outline; this is not a missing-focus claim.

**Exact change:** include transform in shared Button transitions and add `:enabled:active { transform: scale(.97) }` with 120–180ms timing. Preserve focus-visible outlines, remove scale under reduced motion, and do not animate disabled controls. Give pending buttons a fixed icon slot so a spinner never changes their width. Use `--well: #f7f7f5` for neutral light operational surfaces and keep cream as an intentional Card/product accent; retain the current restrained dark well. Keep 8px action-panel corners and pill actions consistent rather than introducing additional radii.

**Acceptance:** hover, press, focus, disabled and pending states feel authored across Home, Global and Developers. The same action does not change shape or width when its state changes. This extends the existing kit; it does not require a new animation library.

### 9. Make navigation quieter and unambiguously correct

**Evidence:** [Developers](v5-taste-evidence/stills/1440-light-normal-developers.png) and [Contracts](v5-taste-evidence/stills/1440-dark-normal-contracts.png) visibly highlight Home while the corresponding utility link is also current. `components/console/products.ts:126` falls back to Home; `components/console/shell.tsx:101` uses that as sidebar selection. `:112` borders every row and `:117` uses the same display family for all labels.

**Exact change:** separate the optional product selection from the route's utility selection. On Developers/Contracts hide the product pill and apply an obvious active background/marker to the utility destination; expose only that link as `aria-current="page"`. Keep the colored pill for product routes. Reduce idle labels to Inter Tight 15px/600, keep the product index number at 11px, remove the border under every individual row, and retain a divider between the product group and utilities. Keep the logo in Archivo.

**Acceptance:** exactly one destination looks active; the rail supports the hero rather than resembling a second list of headlines. No pill glides to Home when opening a utility route.

### 10. Make Mint's negative space purposeful

**Evidence:** [dark Mint overview](v5-taste-evidence/stills/1440-dark-normal-mint.png). `components/mint/mint-dashboard.tsx:101` presents four equal KPIs; `:128` follows with a collapsed detail row. The lower third is nearly empty while the route's main action is only a tab label. The four-KPI overview is an approved direction; preserve it.

**Exact change:** retain the four metrics but add a simple action row below them: **“Issue xMXN”** opens the existing Issue & manage tab; **“View your positions”** opens the existing positions tab. Follow it with one narrow, factual collateral-mix strip using the already loaded book data and labeled proportions; render a neutral placeholder while unknown. Keep detailed collateral and supply tables inside the current disclosure. Remove redundant unit text in labels such as “xMXN in circulation · xMXN.” No decorative invented chart or additional KPI band.

**Acceptance:** the overview answers both “What backs this?” and “What can I do next?” without looking busy or making the judge discover the primary workflow through a small tab.

## Route-level judgment at the capture cutoff

| Route | Keep | Main remaining taste gap |
|---|---|---|
| Home | Image-in-type, six-product palette, prominent Tour | Index scale and repeated headline weight (#6) |
| Mint | Jade band, simple four-number overview | Truncated phone purpose, unproductive lower half (#2, #10) |
| Remesas | Human task language, terracotta actions, clear balances | Phone skin/theme integration still in progress (#7) |
| Global | Cobalt identity, real quoted result | State replacement and generic transfer hierarchy (#1, #5) |
| Crédito | Phone + explanatory desktop pairing; improved fold | Recheck new rosa skin; align shared motion (#3, #7) |
| Card | Strong cream/ink card artwork and POS composition | Shared-control finish; theme behavior should be explicit (#7, #8) |
| Invest | Scannable holdings and expressive live decimals | Dark shell/white phone discontinuity in baseline (#7) |
| Developers | Useful challenge/receipt content and clear price | Oversized utility hero; wrapped dense endpoint values (#2) |
| Contracts | Readable evidence groups and visible admin powers | Utility title overwhelms list; clipped introduction (#2) |

## What I would ship before the next judging rehearsal

1. **One controlled web pass:** #2, #3 and #6 together. Shorter utility headers, fewer layered entrances and a denser Home index produce immediate improvement without changing transaction logic.
2. **One Global pass:** #1 and #5. Stable geometry and a money-first form make the central business payment feel like a finished product.
3. **One responsive integration pass:** #4 and #7, with mobile/mobile2's current skins. Fix navigation discoverability and theme continuity together, then recapture both sizes/themes.

Use #8–#10 as bounded follow-ups. Keep the color bands, cultural typography, flat surfaces and product-specific accents. Do not spend this round adding gradients, generic glass panels, a carousel, a new animation dependency or ornamental charts. The visual identity is already doing its job; the interaction hierarchy needs to catch up.

## Recheck — 2026-10-14, completed v5

**The original verdict has materially improved.** The desktop app now has a coherent visual hierarchy, and the native phone skins belong to the same product family. Home reads as an ecosystem; Global reads as a transfer; Developers exposes useful content immediately on desktop. The remaining work found here was specific interaction behavior, not a reason to redesign the brand again.

This recheck began at `e75d817`. Captures started after web's `c9f9b6d` navigation/animation fix was served, with HEAD `a4ac6b4`. Owners fixed findings while the review ran; the final targeted checks include `f67114d`, `1ece018`, `9d92fe4` and **`fc79ed0`**. **The first capture set and the final verification are different evidence epochs.** Later screenshots/measurements below supersede the relevant earlier failures. [Checkout/source record](v5-recheck-evidence/source-cutoff.json).

**Final disposition: all ten original findings are fixed in the tested cases.** The five important discoveries/residuals below were also closed during this round. No open P0/P1 remains from this bounded visual/interaction recheck; that is not a claim about the entire application's security or transaction behavior.

### What was checked

- All nine routes, **1440×900 and 390×844, light/dark**: 36 completed cases, zero page exceptions, recorded HTTP errors or horizontal document overflow. Two capture processes ended with exit 143 before finishing; the missing cases/clips were resumed without replacing completed evidence. This interruption is not attributed to an app failure. [Matrix](v5-recheck-evidence/stills/browser-matrix.json).
- Four general motion clips: [desktop light](v5-recheck-evidence/motion/1440-light.webm), [desktop dark](v5-recheck-evidence/motion/1440-dark.webm), [phone light](v5-recheck-evidence/motion/390-light.webm), [phone dark](v5-recheck-evidence/motion/390-dark.webm). These include Home hover/navigation, Global quote edits/tab change, Remesas Send, Card activity transition and Invest arrival. Clips span the live fixes; use the final set for Global's current geometry.
- Four **final cold Home→Global clips**, including delayed read-only quotes and formatted/invalid amount entry: [desktop light](v5-recheck-evidence/final-motion/1440-light.webm), [desktop dark](v5-recheck-evidence/final-motion/1440-dark.webm), [phone light](v5-recheck-evidence/final-motion/390-light.webm), [phone dark](v5-recheck-evidence/final-motion/390-dark.webm). [Frame measurements](v5-recheck-evidence/final-motion/inspection.json). No frame-rate certification is implied.
- Sixteen reduced-motion cases across Home, Global, Remesas and Invest, both widths/themes: no page errors or sustained decorative motion observed. Remesas exposes effectively instant **0.01ms CSS transitions**, rather than an entirely empty animation list. [Results](v5-recheck-evidence/reduced/motion-present.json).
- Final menu focus/restore checks, four viewport/theme checks of Developers' action position and both Mint overview actions, and two delayed-quote width checks after `fc79ed0`. **No paid API action, signature or transaction was submitted by review.** Transaction-success verification remains with QA/owners.

### Status of the original ten items

| # | Status | Evidence and remaining qualification |
|---|---|---|
| 1. Stable form/quote geometry | **Fixed after recheck corrections** | The gate replacement and vertical jumps are fixed, including cold connection and delayed quotes. Final Pay bounds after the route transform: desktop **y807.3 / h48**, phone **y890.6 / h64**, both themes. The desktop button-width issue was then closed by `fc79ed0`: **352×48** loading and quoted in both themes. [Cold-route measurements](v5-recheck-evidence/final-motion/inspection.json), [final width measurements](v5-recheck-evidence/width-final/inspection.json). |
| 2. Utility headers and complete copy | **Fixed** | Developers/Contracts now use compact headings and complete purposes; Mint's purpose is short and unclipped. [Phone Contracts](v5-recheck-evidence/stills/390-dark-normal-contracts.png), [final Developers](v5-recheck-evidence/final-ui/390-light-developers.png). |
| 3. Entrance choreography | **Fixed** | Panels no longer replay inside the route entrance; later-mounted content and native phone transitions retain their own motion. The route releases its transform after 220ms, and short product-letter reveals retain their bounded timing. Utility titles do not spell themselves out. Remaining animation counts include color transitions and individual letters, so “19 animations” alone is no longer a useful defect claim. See general clips and `apps/web/app/globals.css:344`. |
| 4. Phone console navigation/chrome | **Fixed after recheck correction** | All six products are discoverable through Products; More exposes utility routes/theme; the footer is opaque. The newly found modal-focus defect was corrected in `f67114d` and verified: focus enters, ten Tabs remain inside, Escape restores the correct opener. [After-fix trace](v5-recheck-evidence/focused-after/inspection.json). Remesas/Card/Invest native navs measure **772–844** in both themes; Crédito's initial onboarding correctly has no bottom nav. |
| 5. Global money hierarchy | **Fixed** | Amount → rate → received amount → recipient → Pay is now the dominant reading order; routing detail is disclosed below. [Desktop](v5-recheck-evidence/final-motion/1440-light-settled.png), [phone](v5-recheck-evidence/final-motion/390-dark-settled.png). |
| 6. Home index | **Fixed** | Four complete rows fit on the desktop's initial viewport; type and live metrics have distinct roles. Phone rows are denser and the new Products menu provides direct access to all six. [Desktop Home](v5-recheck-evidence/stills/1440-light-normal-home.png), [phone Home](v5-recheck-evidence/stills/390-light-normal-home.png). |
| 7. Shared phone color/theme system | **Fixed** | Remesas, Crédito and Invest now follow light/dark surfaces beneath their accent fields. Card's intentional ink/cream treatment remains coherent in both shell themes. [Dark Invest](v5-recheck-evidence/stills/390-dark-normal-invest.png), [dark Crédito](v5-recheck-evidence/stills/390-dark-normal-credito.png), [light Card](v5-recheck-evidence/stills/390-light-normal-card.png). |
| 8. Controls and neutral surfaces | **Fixed in reviewed states** | Shared press feedback, reduced-motion override, neutral wells and reserved spinner slots are present. R5's page-level width constraint now also holds Global's default quoted action steady. Actual paid pending→success behavior was not exercised in this read-only pass. |
| 9. Sidebar hierarchy/current route | **Fixed** | Quiet labels, fewer rules, correct utility selection; Home is no longer simultaneously active. [Developers](v5-recheck-evidence/stills/1440-dark-normal-developers.png), [Contracts](v5-recheck-evidence/stills/1440-light-normal-contracts.png). |
| 10. Mint overview purpose | **Fixed** | The factual collateral strip fills the lower area meaningfully; both action buttons switch to the intended tabs at both widths/themes. [Overview](v5-recheck-evidence/stills/1440-dark-normal-mint.png), [four-case interaction record](v5-recheck-evidence/final-ui/inspection.json). |

### The five findings that mattered most in this recheck

Ranked for a judge's first 30 seconds. All five were fixed during this round; they remain listed with their closure evidence so they are not mistaken for still-open work. R4 is a residual from the original report; R1–R3 were newly demonstrated during this pass. No new P0 was observed.

| Rank | Severity / area / owner | Finding, exact change and latest status |
|---|---|---|
| **R1** | **P1 · phone Developers · api** | **The Run action was at y2666**, beneath the entire challenge/curl reference column; desktop was y424. Reorder below `xl` to compact endpoint+price → Try it/result/ledger → references, preserving desktop columns. **Fixed in `9d92fe4`; verified y551/h48 in both phone themes, desktop unchanged at y424.** [Final screenshots/measurements](v5-recheck-evidence/final-ui/inspection.json). Source: `apps/web/components/developers/developers-screen.tsx:95`. |
| **R2** | **P1 · phone navigation · web** | Products/More declared a modal but left focus on the opener and allowed Tab into the underlying page; Escape did not restore focus. Use Radix Dialog with visible title, focus entry/trap, background isolation and restoration. **Fixed in `f67114d`, independently verified.** [Before](v5-recheck-evidence/focused/inspection.json), [after](v5-recheck-evidence/focused-after/inspection.json), [visible menu/focus](v5-recheck-evidence/focused-after/390-products-focus.png). |
| **R3** | **P1 · amount entry · api** | Entering **`1,000`** was allowed by the input but disabled the quote query, leaving “Pricing…” indefinitely. Normalize valid thousands groups; show an actionable error for malformed grouping. **Fixed in `1ece018`; final browser checks accept `1,000` and reject `1,0,00` with “Use digits with an optional dot for cents, e.g. 1000.50”.** [Original failure](v5-recheck-evidence/focused/390-formatted-amount.png), [final input evidence](v5-recheck-evidence/final-motion/inspection.json). Source: `apps/web/components/global/use-move-quote.ts:13`. |
| **R4** | **P1 · Global arrival/refresh · api** | The inline connection row initially still collapsed: desktop Pay moved **807→751px**; phone connection/quote wrapping also changed height. Preserve a **60px phone / 40px desktop connection slot**, a two-line phone rate slot and a 64px phone action. **Fixed through `9d92fe4`; final cold-route bounding-box samples are constant after the route's deliberate transform.** [Earlier frame series](v5-recheck-evidence/motion/inspection.json), [final series](v5-recheck-evidence/final-motion/inspection.json). Source: `apps/web/components/global/global-screen.tsx:170`. |
| **R5** | **P2 · desktop primary action · api** | The desktop Pay label grew from a **192px** loading button to a **334px** quoted button, despite its stable vertical slot. **Fixed in `fc79ed0`** with a 22rem desktop minimum that overrides PanelActions' child rule; max-width/wrapping are retained. Independently verified **352×48 at y807.3**, loading and quoted, light/dark. Phone width remains **318px**. [Before](v5-recheck-evidence/final-motion/inspection.json), [final measured widths](v5-recheck-evidence/width-final/inspection.json), [final dark capture](v5-recheck-evidence/width-final/dark-quoted.png). Source: `apps/web/components/global/global-screen.tsx:460`. |

The original large visual weaknesses have been addressed. Preserve this version's hierarchy and color identity; put the next block of time into the judging rehearsal and current deck captures. This visual review does not replace QA's transaction gate.
