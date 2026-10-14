# Mercado — final critical review

**Reviewer:** review · **Date:** 14 October 2026 · **Scope:** the running localhost:3100 app, all product routes and the Demo Tour, the local deck and asset manifest, contracts, API and payment code. This is an improvement round, not a security certification. Owners implemented changes during the review; original failures and subsequent checks are retained separately below. No implementation files were edited by review, and no reviewer transaction was broadcast.

**Judgment:** The initial presentation sold breadth before demonstrating a reason for the breadth. A judge would remember enormous typography, six finance products and a synthetic peso; they would struggle to repeat the customer wedge or explain which movement of money they had actually witnessed. The revised six-beat story is much stronger. The product now needs a frozen, rehearsed spending proof and explicit recovery states more than another feature.

**The sentence to earn in the judge's memory:** “Mercado lets a driver borrow and spend the same local-currency balance on Tempo; six modules share that infrastructure.” The emerging-markets thesis is credible as a direction. Actual cash-out, income access, repayment quality and distribution remain unproved. Showing more tabs cannot close those gaps.

## Evidence and limits

- **72 initial browser cases:** nine routes × desktop **1440×900** / phone **390×844** × light/dark × ordinary/`?present=1`. All returned 200; no page exceptions or horizontal document overflow. These are rendering checks, not completed financial transactions. [Initial matrix](final-evidence/browser-matrix.json).
- **36 post-fix browser cases:** all nine routes at both sizes and themes. Again 200/no page exceptions/no horizontal overflow. The initial matrix recorded **48 public-RPC 403s and 23 429s**; this recheck recorded **zero 403/429 responses**. Expected unpaid HTTP 402 challenges are not errors in the payment protocol. [Recheck](final-evidence/recheck/browser-matrix.json).
- **Final v5 shared-shell check:** another 36 route/size/theme cases returned 200, with no page exceptions, HTTP errors or horizontal overflow. Eight reduced-motion/`?present=1` samples had no sustained animation; Remesas had only 0.01ms one-frame transitions. These samples cover the shared skin visible after the 05:03 restart, not later owner page redesigns or transaction correctness. [V5 matrix](final-evidence/v5/browser-matrix.json), [motion/presentation samples](final-evidence/v5/motion-present.json).
- **76 interactive states:** Mint tabs, Remesas send quote/services/activity/profile, Global tabs, driver consent/score/advance sheet/back office, Card holder controls/activity, Invest trade sheets/activity, Developers endpoints and Contracts tabs. No financial confirmation buttons were submitted. The first instrumentation attempt used the wrong roles for tabs and was stopped; it is preserved and is **not** a product failure. [Interaction evidence](final-evidence/interactions.json).
- **Eight complete Tour navigation runs:** both sizes × themes × presentation settings, all six steps and summary. No transfers were made by review; reaching the summary is not proof of an executed money journey. [Tour evidence](final-evidence/tour.json).
- **Code checks:** 141 contract tests passed; 56 API tests passed after the paid-result fix; 11 sponsor/error tests passed. Current-module fault probes separately reproduced transfer-recovery and paid-result defects, then checked fixes. [Contract log](final-evidence/forge-tests.log), [API log](final-evidence/api-tests-recheck.log), [policy log](final-evidence/policy-tests.log).
- **Deck:** every ordered HTML slide, speaker note and `deck/assets.json` was inspected and locally rendered. The initial 14 main slides had **519 spoken words**; the revised six main slides have **224**. The 40.56-second proof asset decodes and plays locally. Local rendering maps blob references to local assets; it does **not** certify the published presentation player's `data-video` behavior. [Initial deck](final-evidence/deck-baseline/inspection.json), [final 20-slide inspection](final-evidence/deck-final/deck-inspection.json), [media check](final-evidence/video-local-check.json).
- **Read-only preflight:** the owner's new 38-check script was independently run and returned **GO with one amber**. This checks resources and HTTP health, not a successful card approval through the newly changed dialog. The first launcher attempt failed because the default npm cache was read-only; rerunning with a `/tmp` cache succeeded. [Preflight](final-evidence/preflight-retry.log).

The initial screenshots are time-specific. Contracts later identified `account_getOperation` HTTP 403 / JSON-RPC -32601 as an unsupported-method response, not a rate limit; the raw 403/429 counts above intentionally do not equate the two. The browser matrix did not capture response bodies. [Owner diagnosis and proxy fix](final-evidence/irc-progress21.txt). QA subsequently changed Javier's card limit and performed further rehearsals. Reported crew transactions are distinguished from reviewer observations. `?present=1` is an explicitly approved capture mode; its hidden disclosures are intentional, not a newly discovered default-app bug.

## Ranked findings

Ranks reflect demo and judging impact. **P0** = blocks the intended live demo; **P1** = important; **P2** = polish. CR identifiers match the ten short messages posted individually to `@lead` as evidence arrived.

### 1. CR-08 — P0 — Card state, silent failure and unsafe recovery threaten the spending proof

**Area:** demo readiness / Card payments · **Owner:** qa (web/mobile for approval and recovery; contracts for transport).

**Evidence:** the independent 04:29 capture shows Javier with **MX$600 balance, MX$900 of MX$1,000 spent, only MX$100 available today**. A 150- or 450-peso stage payment would fail. [Screenshot](final-evidence/interaction-1440-card-driver-state.png); [preserved state](final-evidence/interactions-instrumentation-attempt.json), case `1440-card-driver-state`. QA separately reported an actual declined rehearsal. Later QA also reported an approval sheet closing without a transaction during the Radix migration; that is a crew-reported regression, not an independently reproduced successful/failed charge by review.

**Further source/reproduction evidence:** the terminal originally created its merchant wallet with `http(TEMPO_RPC_URL)`, bypassing the shared proxy. [Preserved source](final-evidence/card-screen-0906a0e.txt), line 164. More seriously, `useTerminal.send` returned its broadcast hash only after the receipt read succeeded. The actual function, with a stubbed successful broadcast followed by a receipt-read 429, threw a generic error with **no hash or cause**. [Focused probe](final-evidence/card-receipt-probe.json), [function snapshot](final-evidence/card-terminal-before.txt). A fresh tap/nonce after unknown settlement would authorize another charge; nonce replay protection only protects the original nonce. This is a demonstrated state-loss path and a source-supported duplicate-charge risk, not a claim that review double-charged a live account.

**Concrete fix:** keep `scripts/preflight.ts` mandatory after the last rehearsal and immediately before stage. Gate on `balance`, `allowance`, `availableToday`, `frozen`, debt/capacity, oracle freshness and sponsor resources. Reserve headroom for **two takes**, not one. Have the holder change their own limit if necessary; funding alone does not restore the daily limit. For the modal regression, require an observed signing → pending → paid/error transition, exact matching receipt, and updated balance/limit before approving a live take. Route the merchant wallet through the shared `rpcTransport`. Persist the exact tap and hash immediately; reconcile receipt / matching CardCharged / nonce before any new authorization. Show **“Verificando cobro…”** while unknown. Only a confirmed revert, signature rejection or established non-broadcast permits a fresh tap; a receipt timeout does not. Inject a post-broadcast receipt timeout and assert one charge, no new tap. Keep the recorded proof ready.

**Status:** the holder limit was raised; the independent resource preflight is green. At 04:47 QA reported two clean approve → Pagado → receipt runs, plus a prior silent dismissal associated with HTTP 429. Successful runs do not close the intermittent error path. Lead requires visible error/retry, a retained POS amount, injected sign/charge failure coverage and five consecutive post-fix runs. Lead subsequently corrected the retry plan to preserve/reconcile original settlement instead of blindly issuing a fresh nonce; the direct merchant transport is already changed in source. [Crew evidence](final-evidence/irc-progress10.txt). This is still a live-demo gate until that evidence arrives.

### 2. CR-01 — P1 — Remesas could authorize another delivery while settlement was unknown

**Area:** payments / recovery · **Owner:** web.

**Evidence:** the actual original `lib/remesas/reconcile-delivery.ts` returned `clear` after 11 minutes when receipt/transaction reads threw 429/timeout errors. An unrelated same-amount transfer also overrode a recorded pending delivery hash. [Original reproduction](final-evidence/recovery-probe-before.json), `review/final-evidence/recovery-probe-before.json:11`.

**Concrete fix:** remove time-based clearance; follow the exact recorded hash, distinguish NotFound from transport errors, retain nonce/nonce-key/validity evidence, and require the exact memo for the no-hash fallback. Unknown status stays pending with **“Estamos comprobando tu envío anterior. No lo enviaremos otra vez.”**

**Status:** fixed by the owner and independently checked in six focused cases. [Recheck](final-evidence/recovery-recheck.json). Residual: a page killed between wallet broadcast and recording the hash still needs the no-hash recovery path. This was not a fresh live crash/restart certification.

### 3. CR-06 — P1 — A paid quote could fail without a receipt; the first repair allowed unlimited refreshed results

**Area:** API / MPP settlement · **Owner:** api.

**Evidence:** the original partner route verified one payment, failed its second quote read, and returned **502, no Payment-Receipt, zero ledger entries**. [Route probe](final-evidence/paid-quote-probe.json), `review/final-evidence/paid-quote-probe.json:9`. The first `paidOnce` revision preserved the payment but re-executed completed requests: one paid credential returned generations 2 and 3. [First repair probe](final-evidence/paid-once-probe-first-fix.json).

**Concrete fix:** precheck the signer before charging; persist the verified paid intent and receipt before post-payment work; expose `PAID_RESULT_PENDING` with its receipt on failure; recover before unpaid preflight checks; persist the completed HTTP response and replay it unchanged. Only unfinished work may execute again. Serialize the whole challenge lifecycle and preserve reconciliation information before settlement if hardening crash/concurrency behavior further.

**Status:** the focused failure → recovery → completed-replay check now passes with **one charge, one ledger row and identical final response**; 56 API tests pass. [Latest sequential probe](final-evidence/paid-once-probe.json). A later actual-mutex check sent ten concurrent identical credentials: one charge, one ledger row, one production and ten identical responses. [Concurrency probe](final-evidence/paid-once-concurrent.json), [final API suite](final-evidence/api-tests-final.log). Still no independent kill-between-chain-settlement-and-intent-write or multi-process durability proof. Do not call this universal exactly-once settlement.

### 4. CR-03 — P1 — The original pitch could not fit the three-minute slot

**Area:** deck / rehearsal · **Owner:** slides.

**Evidence:** 519 words across 14 main slides equals about **3m28 at 150 words/minute**, before any app or video. [Initial notes](final-evidence/deck-baseline/inspection.json), starting at `review/final-evidence/deck-baseline/inspection.json:100`.

**Concrete fix:** six main beats: cover → problem → six-product map → one spending proof → circulation/risk → close. Keep ≤230 spoken words and use the 40.56-second video within a 45-second allocation. Product detail belongs in the appendix. No live tour of all six products during the pitch.

**Status:** shipped: six beats and 224 words. At the same speaking rate that is approximately 90 seconds of narration plus approximately 41 seconds of video, leaving useful transition margin. Rehearse the actual player and clicks, not just a word count.

### 5. CR-04 — P1 — Product headers pushed the first action off the desktop screen

**Area:** UX / hierarchy · **Owner:** web (mobile/mobile2 for phone layout).

**Evidence:** at 1440×900, Remesas' Enviar began at **y=876**, Crédito's Uber action at **y=989**, and Global Pay at **y=941**, against a footer starting at y=868. [Original Remesas](final-evidence/1440-light-normal-remesas.png), [matrix geometry](final-evidence/browser-matrix.json).

**Concrete fix:** cap product titles at 64–80px and header blocks at 170px; keep primary action above the footer. Use a compact product header plus the existing instructional side panel. Avoid solving every space problem by shrinking all phone text. Lift Global's action further so browser zoom and validation text do not cover it. On mobile replace the v1/v2 implementation paragraph above its form with **“Pay OUSD. Your supplier receives xMXN.”** Put protocol mechanics in Exchange backing; the current phone form wastes its first screen explaining versions.

**Status:** substantially fixed. [Rechecked Remesas](final-evidence/recheck/1440-light-normal-remesas.png). Primary actions fit; Crédito's complete desktop device still extends below the viewport, and some scaled phone microcopy is very small. The v5 shared-shell pass places Enviar at bottom y=707, Uber at y=678 and Global Pay at y=854; the footer starts at 868, leaving Global only 14px. [Final Global](final-evidence/v5/1440-dark-normal-global.png).

### 6. CR-02 — P1 — The first ten seconds did not communicate the thesis

**Area:** deck / positioning · **Owner:** slides.

**Evidence:** the original cover said **“Put your money to work”**, a claim almost any finance app could use. The emerging-markets/shared-money argument lived in background documents. [Original cover](final-evidence/deck-baseline/deck-cover.png).

**Concrete fix:** **“A parallel financial system.”** / **“One peso balance. Earn, send, borrow, spend, and save.”** Explain Mexico first and use the map to show the six jobs around xMXN. Describe a shared balance and verifiable transfers before naming contracts.

**Status:** shipped. Still earn the geographic claim through the Mexico scenario and partner ask; “parallel financial system” alone is ambitious but abstract.

### 7. CR-05 — P1 — The Q&A material contradicted the deployed architecture

**Area:** deck / technical credibility · **Owner:** slides.

**Evidence:** initial architecture/formula slides described v1 `CollateralVault` + `SwapDesk`, a sole issuer and universal 150/135 thresholds. Even after those two slides changed, `judge-qa.html` notes still said **“v1 is live” / “v2 proposed.”** Live v2 has MultiCollateralVault **and MoveAMM** issuance, separate CDP debt/AMM liability, and collateral-specific ratios. Source: `packages/contracts/src/v2/MoveAMM.sol:142`, `packages/contracts/src/v2/MultiCollateralVault.sol:141`; [initial appendix](final-evidence/deck-baseline/inspection.json).

**Concrete fix:** update the diagram, formula **and every Q&A answer** from the active deployment. Name sOUSD / sxMXN / mIDX correctly. Separate source verification, test results, live receipts and an audit. Explain admin powers, NAV haircut and leaky-bucket redemption without calling it a strict daily maximum.

**Status:** architecture/formula and Q&A corrections were shipped during review. Retain the current answer sheet below; no “audited” claim is supported by this review.

### 8. CR-10 — P1 — The visual proof was too small to read, and playback remains a separate gate

**Area:** deck / visual proof · **Owner:** slides (qa for published playback).

**Evidence:** initial 1920px slides used **256px-wide phones** and **1664×229px strips** for Mint/Risk; detailed UI text shrank to roughly 6–9px at 1440 projection. [Original Invest](final-evidence/deck-baseline/deck-p-invest.png), [asset geometry](final-evidence/deck-baseline/inspection.json).

**Concrete fix:** one enlarged action or receipt crop per main proof beat, with a visible amount and result. Keep full product screens in the appendix. Match poster, video and receipt amounts. For `spend-video.html`, verify the **published** `img[data-video]` transition actually plays; prepare a receipt still if it does not. Never describe a moving quote as a completed transfer.

**Status:** main proof and risk crops enlarged; local 40.56s asset plays. Published player/autoplay behavior remains outside the independent check. The main risk beat still mixes circulation and solvency: reveal the risk panel after the money-flow sentence rather than asking the audience to read both at once.

### 9. CR-07 — P1 — There was no concrete commercial ask or launch wedge

**Area:** strategy / close · **Owner:** slides.

**Evidence:** **“Put Mercado to work”** closed the original story; the six products implied six customers and six launch plans. [Original close](final-evidence/deck-baseline/deck-close.png), `deck/project/slides/next.html`.

**Concrete fix:** **“One corridor. One driver platform. One merchant pilot.”** Ask for a licensed MXN payout partner and a driver-platform pilot. Measure completed cash-outs, repeat spending and repayment. Present six modules as shared infrastructure, not six simultaneous go-to-market motions.

**Status:** shipped in the close and notes. No demand, distribution, default-rate or unit-economics evidence was found; those remain questions, not traction claims.

### 10. CR-09 — P1 — Capture-mode simplicity can make the assets and outcomes sound more real than they are

**Area:** deck / financial copy · **Owner:** slides.

**Evidence:** initial slides combined **“stocks,” “Five percent a year in dollars,”** and **“pesos delivered/received”** with quote crops. sOUSD/sxMXN rates are configured and reserve-funded; mIDX has no underlying equities; the transfer examples were quotes. Source: `packages/contracts/src/v2/StakedOUSD.sol:12`, `packages/contracts/src/v2/InvestDesk.sol:12`; [original Invest](final-evidence/deck-baseline/deck-p-invest.png), [deck copy evidence](DECK-COPY.md).

**Concrete fix:** use **“pesos quoted”** for quoted outputs and “delivered” only beside actual receipts. The clearest Invest wording would be **“Save in dollars or pesos”**, **“Explore a demo equity index”**, **“5% configured demo rate.”** In Q&A, say explicitly where returns come from and what the token does not own.

**Status:** quoted-versus-delivered wording fixed. Lead retained the prior presentation policy: keep “stocks,” no added opening disclaimer or demo-rate text, and the single testnet close line. This is an accepted presentation tradeoff, not a hidden default-app defect. The credibility risk remains; notes/Q&A must answer it immediately when asked.

### 11. P1 — Bottom sheets allowed keyboard focus behind a modal

**Area:** accessibility / all phone apps · **Owner:** mobile.

**Evidence:** Shift+Tab from Agregar dólares moved focus outside the open `aria-modal` sheet. `apps/web/components/mobile/sheet.tsx` originally focused its panel without a focus trap. [Original focus screenshot](final-evidence/interaction-1440-sheet-focus-after-shifttab.png); [focus state](final-evidence/interactions-instrumentation-attempt.json), case `1440-sheet-focus-after-shifttab`.

**Concrete fix:** Radix Dialog focus scope, accessible title, visible close button, non-interactive background and focus restoration. Keep dismissal disabled while signing/submitting, but never swallow the action or its error.

**Status:** independently rechecked at both sizes: focus remains inside and Escape returns it to Agregar. [Recheck](final-evidence/sheet-recheck.json). The separate QA-reported card-approval behavior is tracked in rank 1; keyboard acceptance does not prove payment acceptance.

### 12. P1 — Failed reads could look like an endless load or a real zero

**Area:** data states / trust · **Owner:** web (mobile2 for history lists).

**Evidence:** forcing Invest history to 503 left an `aria-busy` skeleton without an error action. With RPC blocked, Home displayed **0 xMXN collateral locked** while other metrics correctly showed unavailable. Source: `components/invest/phone-app.tsx:493`, `lib/contracts/reads.ts:300` — reducing an empty result array produces zero. [Fault record](final-evidence/faults-before.json), [Home fault](final-evidence/fault-tour-rpc.png).

**Concrete fix:** render **“No pudimos cargar tus movimientos” + “Reintentar”**; preserve last good rows with an age label on refresh failure. Treat missing/partial collateral reads as undefined, not zero. Display **“Unavailable”** instead of a financial amount until every required input is present.

**Status:** independently fixed in the browser. History now exits the skeleton into “No pudimos cargar tus movimientos” / “Reintentar”; Home collateral renders “—” with RPC blocked. [History recheck](final-evidence/history-error-recheck.json), [Home recheck](final-evidence/fault-home-recheck.png). Never infer a loss, empty account or healthy system from missing reads.

### 13. P1 — Tour navigation depended on a healthy RPC

**Area:** demo / resilience · **Owner:** web.

**Evidence:** under a fresh-context RPC outage, Start Demo Tour remained on Home with `active:false` after 22 seconds. `components/tour/demo-tour.tsx:154` awaited a block number before navigating. [Injected outage](final-evidence/faults.json), `review/final-evidence/faults.json:13`.

**Concrete fix:** open the instructions and navigate immediately. Fetch the proof anchor independently; show **“Proof unavailable — retry”** until a block can be pinned. Never create an invented trace or label unanchored activity as this step's proof. The live action should still respect its own safety checks.

**Status:** initial offline navigation is independently fixed: Home → Mint in 190 ms with every RPC read blocked, visible instructions, explicit unavailable proof and Retry. [Recheck](final-evidence/tour-outage-recheck.json). The asynchronous repair introduced a separate boundary concern: `demo-tour.tsx:160` closes the previous visit only when a new anchor succeeds, while `:201` retains an open visit when stop/finish cannot read the chain. Exclude or explicitly mark the unanchored interval instead of attributing later activity to the previous step. A fresh-context test reproduced a still-open Mint visit while the visible step was Remesas after 22 seconds. [Boundary evidence](final-evidence/tour-boundary.json). This follow-up was routed to web; normal navigation acceptance does not close it.

### 14. P1 — Dark Global contrast and the Home word mask weaken the visual signature

**Area:** visual accessibility · **Owner:** web.

**Evidence:** Global's `#2448c8` heading on `#0a0a0a` measured **2.67:1**, below the 3:1 large-text threshold. [Computed colors](final-evidence/contrast.json), `review/final-evidence/contrast.json:15`. Black bands in Home's image-in-type disappear against the dark canvas and make the caps look sliced. [Dark Home](final-evidence/recheck/1440-dark-normal-home.png).

**Concrete fix:** use a lighter dark-mode blue such as `#8ea8ff`; check the other accents independently. Give the dark texture a cream/light replacement for its ink bands, or use solid white type in dark mode. Do not leave the brand's first sentence partly invisible.

**Status:** independently fixed after the CSS restart. Global now uses ink on the light-blue dark-mode field (about 8.67:1), with readable active navigation; Home’s dark word mask is legible. [Global](final-evidence/v5/1440-dark-normal-global.png), [Home](final-evidence/v5/1440-dark-normal-home.png), [computed colors](final-evidence/v5/motion-present.json). Small v5 follow-up: `lib/motion/index.tsx:70` permits 260ms stagger plus a 360ms letter animation, exceeding the specified 500ms total for longer words. Cap stagger at 140ms; this was sent to web.

### 15. P1 — “Depth” and aggregate coverage can invite the wrong financial inference

**Area:** economics / Global / Mint · **Owner:** contracts (api for copy).

**Evidence:** `MoveAMM.sol:45` has `depthUsd=250,000e6`, a **virtual pricing parameter**, while the read-only reserve snapshot held about **3,922.57 OUSD** and immediate redemption capacity about **980.64 OUSD**. At $10,000, size impact is around 385 bps before the 20-bps fee. Mint's aggregate coverage is dominated by demo-valued collateral and does not determine each position's liquidation threshold. [Live state](final-evidence/live-state.json), `components/global/global-screen.tsx`, `components/mint/mint-dashboard.tsx`.

**Concrete fix:** label **“Virtual pricing depth — not reserves.”** Show funded reserve and **“Available to redeem now”** separately. Use a $500–$1,000 stage example; retain its full fee/impact. Do not raise D merely to beautify a quote. On risk, say **“Aggregate CDP coverage; positions have separate liquidation limits.”** Never call the refill bucket “25% maximum per rolling day.”

**Status:** lead kept D=250k and changed the Global example to $1,000. The explicit virtual-depth / reserve / aggregate-risk labels are now implemented in Mint source (`mint-dashboard.tsx:207`); Global still needs its matching labels checked in the final skin. This preserves an honest example without claiming competitive real-world pricing.

### 16. P1 — Demo collateral is not a demonstrated liquidation market

**Area:** contracts / credit risk · **Owner:** contracts.

**Evidence:** `packages/contracts/src/v2/InvestDesk.sol:145` grants `bought[address]` buyback rights and rejects sales above them. Those rights do not travel with transferred/seized mIDX or tTBILL. `packages/contracts/src/v2/MultiCollateralVault.sol:192` can seize collateral in liquidation; that does not establish a liquidator's ability to exit it at the displayed admin price. The Invest UI already acknowledges this restriction.

**Concrete fix:** add **“Demo-only collateral: seized tokens have no automatic desk buyback right”** beside Mint's relevant collateral/risk rows. Use OUSD/sOUSD for the principal solvency explanation. Keep RWA price/liquidity assumptions explicit in Q&A; do not imply real equity/Treasury liquidation depth. A production fix needs transferable, enforceable redemption rights or a separately funded liquidation venue, not just a different label.

**Status:** implemented in Mint source (`mint-dashboard.tsx:52`), with final v5 rendering still to check. This is an economic limitation, not a newly proved exploitable contract drain. Do not count demo asset valuation as evidence of realizable collateral liquidity.

### 17. P1 — The server/payment threat model is narrower than a deployable fintech backend

**Area:** API / sponsor / operations · **Owner:** api (contracts for sponsor).

**Evidence:** `lib/server/bills/lock.ts` and `store.ts` serialize within one process; `lib/mpp/store.ts` is file-backed; `paid-once.ts` initially locked only store mutations; its final repair also serializes the complete per-challenge lifecycle within one process. Sponsor quotas are process-local and unsigned eligible-sender requests can consume quota. [Live policy](final-evidence/live-state.json), `app/api/sponsor/policy.ts:302`.

**Concrete fix:** for judging, keep one writer/server, stable storage/secrets, no order resets or restarts during payment, and funded fee-token fallback. Keep the on-ramp **disabled** as confirmed by `/api/onramp`. For hardening, use transactional durable storage with unique order/payment constraints, preserve complete per-challenge serialization across workers, preserve pre-settlement intents, and authenticate sponsor preparation before consuming another sender's quota.

**Status:** known limits, not a claim of a current live loss. Home’s “so users never hold a gas token” should be narrowed to **“Mercado sponsors eligible calls; otherwise a supported USD token pays the network fee.”** The supported-USD fallback is part of the actual transport contract. [Current Home](final-evidence/v5/1440-dark-normal-home.png). The review found no new demonstrated P0 contract exploit; it did find and repair important payment failure paths. Source verification and 141 tests are not an audit.

### 18. P2 — Home still puts technology ahead of the six products

**Area:** information architecture · **Owner:** web.

**Evidence:** the desktop first viewport shows the hero and **Built on Tempo** technical grid; the six-product index begins below it. On phone, most of the first screen is the long ecosystem paragraph. [Home](final-evidence/1440-light-normal-home.png), `components/home/ecosystem-home.tsx`.

**Concrete fix:** order Home as hero → Start Demo Tour + compact six-product index → money map → technical proof. Shorten the paragraph to **“Create pesos. Send them home. Borrow, spend, and save on Tempo.”** Keep native TIP-20/402/sponsor details one scroll lower or in Developers. The main deck's new map already does this job better than Home. Also fix auxiliary-route selection: `/developers` and `/contracts` should retain their own sidebar link’s existing `aria-current="page"` and leave Home inactive; the current `productForPath` fallback also highlights Home. [Developers capture](final-evidence/v5/1440-light-normal-developers.png), `components/console/shell.tsx:109`.

### 19. P2 — Small money values and unfinished controls diminish polish

**Area:** Remesas / phone polish · **Owner:** mobile.

**Evidence:** the desktop Remesas dollar tile clips its amount at the smaller device width; Agregar opens a disabled-service explanation, and the side panel shows many dashes before a quote. [Current Remesas](final-evidence/recheck/1440-light-normal-remesas.png), `components/remesas/phone-app.tsx:206`, `onramp-sheet.tsx`.

**Concrete fix:** fit or wrap the entire currency amount, including decimals; never ellipsize money. The final v5 sample fits the current US$1,243.00 tile after the fit-text change. [Latest Remesas](final-evidence/v5/1440-light-normal-remesas.png). Disable or mark Agregar **“Próximamente”** at the entry point. Before a quote, replace the six empty rate rows with **“Elige un monto para ver cuánto recibe tu familia.”** Expand the full breakdown only after an amount exists.

### 20. P2 — Evidence assets and executable instructions need a release snapshot

**Area:** QA / delivery · **Owner:** qa (slides for manifest).

**Evidence:** same-named v7 crops were repeatedly overwritten and re-uploaded while the deck was being rebuilt; note counts, quote outputs and card capacity changed within this review. The preflight's `npx tsx` launcher also needed an available npm cache in this environment. [IRC evidence](final-evidence/irc-progress7.txt), [launcher failure](final-evidence/preflight.log), `review/final-evidence/preflight.log:5`.

**Concrete fix:** freeze a timestamped deck/app/asset manifest with hashes and one matching talk track; record one command that works without an on-stage dependency download. Use immutable evidence filenames for the final proof, and retain the old failure/receipt artifacts. Make a five-minute release freeze before recording/presenting; no live UI refactors during a take.

## Every product, as a first-time judge sees it

| Product | What lands | What still costs attention | Concrete next change |
|---|---|---|---|
| Home | Distinct identity; a visible Tour entry; six products share a currency. | “Built on Tempo” still arrives before the product index; six jobs take a paragraph to explain. The dark title mask is now fixed. | Move product index above technical grid; use the approved short action sentence. |
| Mint | Separate collateral, debt, issuance and risk views; real configurable limits. All five tabs were opened. | Legacy tTBILL dominates collateral; aggregate healthy numbers can hide per-position and liquidation-market assumptions. | Default judge explanation to OUSD/sOUSD; label legacy repay/withdraw and mock liquidation rights; show one position's threshold. |
| Remesas | The strongest consumer layout; amount → family → review is legible on 390px; quote is clear before sending. | Disabled top-up entry, blank desktop breakdown, two-step memo recovery complexity. The latest dollar tile fits its amount. | Preview amount/recipient immediately; make recovery exact; hide unavailable top-up behind a clearly disabled entry. |
| Global | Quote, min-out, rate, fee/impact and backing are inspectable; partner API is distinct from supplier payment. All five tabs opened. | Technical prose and “depth” distract; Pay barely clears desktop footer; $10k quote makes economics look poor. | Use $1k example; name virtual pricing parameter accurately; lift Pay; keep signed indicative quote separate from settlement. |
| Crédito | Consent → synthetic income → offered capacity → fee/total debt gives a coherent driver journey. Back office opened. | Driver onboarding plus back-office tabs is a second hierarchy; device still long on desktop; “what you've earned” could imply payroll collection. | Keep one driver/take; say “Advance based on earnings history”; make manual repayment and offered vs drawable amount visible at the action. |
| Card | Exact merchant/amount authorization, real freeze/limit controls and receipts are the best short proof. | Shared mutable rehearsal state; default family account differs from tour's Javier; approval regression needs closure. | Stage must open `/card?holder=driver`; preflight balance AND daily allowance; validate the real approval after modal edits. |
| Invest | Clear dollar/peso/index choices; sheets fit phone; position and source-of-return details exist. | Index and configured returns invite overinterpretation; history failure initially hung. | Retain josu’s approved live eight-decimal counters; make their source clear, respect reduced motion, and preserve error/retry and stale-data states. |
| Developers | Real 402 challenge inspection, paid-call history and useful snippets; all endpoint tabs opened. | Very tall heading, no short explanation of the difference between API fee and principal movement; replay originally incomplete. | Lead with “Pay per API response”; show request → fee → response/receipt in one view; replay paid outputs unchanged. |
| Contracts | Useful address/state/admin-power inventory with verified-source links; all tabs opened. | Verification language can be mistaken for security assurance; huge heading delays evidence. | Keep “Source verified; not audited” in the proof explanation; show active v2 first and group legacy/history separately. |
| Demo Tour | All eight navigation combinations work; roles are named; visits now use closed block intervals. | It is a guided explorer, not an automatic three-minute demo; summary initially waits for reads; offline entry was gated by RPC. | Use it for Q&A; main stage uses the one proof. Open instructions without RPC and clearly distinguish unanchored proof. |

**Comparison with polished fintech experiences:** the typography and cultural treatment are recognizable; the financial action paths still contain more explanation, role switching, hidden controls and ambiguous loading than the visual finish suggests. The gap is primarily state handling and product focus, not lack of decorative design. Phone layouts are substantially clearer than the original desktop pages. Light/dark shell themes work; the consumer phone themes are intentionally paper/ink by product rather than fully inverted with the shell.

## Deck, slide by slide

The first three main beats now establish thesis → problem → system before the proof. The remaining issue is making the mechanism believable without turning it back into a feature catalog.

| Slide | Critical assessment / exact action |
|---|---|
| Cover | Revised thesis is memorable. Keep the Mexico use case in the opening narration. Static 18.37 meta is a captured example, not a live feed. |
| Problem | Readable and simple, but generic. Ground it in one person: **“Javier gets paid on Friday. Doña Mary’s shop wants payment today.”** Avoid unsupported claims that everyone saves in cash or every provider takes a cut. |
| System | All six products are visible. Say **“Balances, transfers, and debt reconcile to Tempo.”** Keep collateral, exchange reserves, loans and savings separate; no pooled-money illusion. |
| Spending proof | Strongest beat. Advance → declined frozen card → approved amount → receipt proves an inspectable path. Card is not MPP: retain the separate HTTP 402 sentence and an appendix trace. Verify published playback. |
| Compounds/risk | Better crop, but two ideas compete. Reveal circulation first and risk second. Correct subline: **“The same currency connects payments, credit, and savings.”** Aggregate ratios are not per-position liquidation promises. |
| Close | Concrete pilot ask is much better. Finish with it; do not spend the remaining seconds enumerating every future integration. Keep the approved testnet close line. |
| Mint appendix | Use a position/action crop, not only a system risk strip under “Deposit collateral.” Explain debt and liquidation. |
| Remesas appendix | Match the rounded number to the captured quote; label **quoted**, not received. One quote phone is sufficient. |
| Global appendix | $1,000 / ~18,261 quoted is a better representative example than $10,000 / ~4% cost. Do not imply market competitiveness. |
| Crédito appendix | “Up to 1,500” is the line, not unconditional available cash. The advance sheet should supply live fee and repayment total. |
| Card appendix | Keep merchant, amount, driver and receipt consistent with the video. Avoid a different 450-peso screenshot being narrated as the 150-peso recorded transaction. |
| Invest appendix | “Stocks” needs immediate Q&A qualification: mIDX owns no equities and earns neither savings rate. Demo rates stop when their funded reserve is exhausted. |
| Bills appendix | The 402 panel proves a payable endpoint, not actual CFE/Telcel fulfillment. Show the settled receipt separately from simulated provider completion. |
| Risk appendix | Show one actionable threshold and haircut/bucket semantics. Virtual D, aggregate CDP ratio and real reserve are different numbers. |
| Architecture appendix | Current v2 diagram is required: two issuers, separate obligations, independent lender capital and savings vaults. |
| xMXN formula appendix | Keep collateral-specific ratios and fixed-point units correct; the formula is not a guarantee of peso redemption or a peg. |
| Next appendix | Too many simultaneous futures. Lead with one MXN corridor and one approved income/payout integration. Other roadmap items are Q&A only. |
| Judge Q&A | Now update-aware; rehearse the answers below without reverting to “v2 proposed” or “audited.” |
| Agent appendix | Good Tempo/MPP differentiation: an agent buys a report. It must not imply the report grants borrowing authority to that caller. |
| Proof appendix | Source and receipt inspection is useful; do not equate a verified contract, a green test count or an HTTP response with independent financial/security assurance. |

## Three-minute live risk plan

| Failure trigger | Evidence / consequence | Owner and mitigation |
|---|---|---|
| Rehearsal consumes card cap or borrower capacity | Rank 1: money in wallet did not make Card spendable. | **qa:** run final preflight after all recaptures, use exact stage wallet/amount, preserve two-take capacity. |
| Modal action dismisses or loses a submitted hash | QA reported a silent 429-path dismissal; review reproduced post-broadcast hash loss with stubs. | **web/mobile/qa:** preserve the tap/hash, show errors, reconcile before retry, inject a receipt timeout and demonstrate the fixed browser flow; otherwise play the recording. |
| RPC 403/429 or lost read | Baseline 71 such HTTP responses; post-proxy 36-case recheck has zero. | **contracts/api:** cached shared proxy + bounded client queue; one browser; retain last good data with age; never turn missing data into zero. |
| Oracle stale, paused or stressed | Reads/quotes/issuance/redemption can refuse; live maxAge is 3,600s. | **qa/contracts:** preflight age <15 minutes, validity/pause checks, keeper health, restore stress state before stage. Never force a rate just to make a take succeed. |
| Sponsor quota/balance exhausted | 30 sender / 500 global hourly quotas, process-local; unsigned quota grief remains. | **contracts/qa:** funded own fee token fallback, real fee-payer receipt, preserve quota headroom; no unconditional “gasless” claim. |
| AMM/desk cap, coverage or quote expiry | Finite reserve, NAV haircut, redemption bucket, 30-second indicative quote. | **api/contracts:** check exact amount; keep D unchanged; refresh quote and min-out; no guarantee that paid quote reserves inventory. |
| Submitted transfer/MPP request times out | Original recovery defects reproduced; focused repairs now pass. | **web/api:** keep original transfer intent/order/credential; reconcile before retry; show pending/receipt, never create a new paid intent casually. |
| New wallet or wrong demo role | Fresh passkey is not automatically funded; Card default can be family rather than driver. | **web/qa:** prepared profile and explicit role links. Do not switch wallet or network during a pending transaction. |
| Build/HMR or two writers | Earlier crew reload loop; payment stores have a single-process scope. | **web/api:** freeze edits, one server/writer, no `next build` against the live dev server, no resets/restarts during a take. No sustained reload loop reproduced in this review. |
| Video fails in published presentation | Local asset playback does not test `data-video` presentation handling. The published deck is private to josu’s account. | **slides:** prepare the receipt still; lead has assigned the actual autoplay/click/sound check to josu. Independent review cannot certify private-player behavior. |

**Timing:** roughly 10s thesis, 15s problem, 20s map, 45s proof, 25s circulation/risk, 20s ask. Keep the remaining ~45s for transitions or one recovery. If a live action has not resolved after 8–10 seconds, say it is pending and switch to the labeled recorded proof; do not repeatedly resubmit.

## Q&A answers to have ready

1. **Why Tempo and MPP?** Native TIP-20 transfers, fee sponsorship and shared settlement connect the modules. A separate HTTP 402 flow lets software pay for an API response. The card demo alone does not prove MPP or better real-world economics.
2. **Is xMXN a peso, and where is cash-out?** A synthetic MXN-denominated test token. There is no guaranteed peg, SPEI payout or bank redemption in this build.
3. **What is actually live?** Deployed v2 issuance/exchange/credit/card/savings transactions and MPP settlement. Income, asset-price/yield inputs and provider fulfillment have explicit demo limits; integration plumbing is not production readiness.
4. **What if the peso appreciates?** Collateral coverage falls; positions have individual thresholds. MoveAMM mints only within coverage/liability bounds, redeems at the lower of oracle value and NAV, and applies a refill bucket. Halting or haircutting does not create missing assets.
5. **Where does yield come from?** sOUSD/sxMXN configured accrual is funded by demo reserves; it is not market investment income. mIDX has an admin-set price, no underlying equities, and earns neither savings rate. Lender fees are a different pool.
6. **Who can change the system?** Owners/admins control prices, collateral listings/feeds, risk parameters, pool signer, desk liquidity and pauses. Haircuts cannot make invented prices or synthetic income true. Sponsor policy does not remove those trust assumptions.
7. **Can a retry charge twice?** The checked failure paths retain payment intent/receipt and replay the completed paid response. There are explicit single-process and crash-window limits; there is no universal exactly-once claim.
8. **What are you asking for?** One licensed MXN payout partner, one driver-platform pilot and one merchant pilot, with actual cash-out completion, repeat spend and repayment measured before expansion.

## Three highest-leverage improvements, ranked by impact/effort

| Rank | Ship | Impact / effort | Acceptance |
|---|---|---|---|
| 1 | **Freeze and prove one spending journey**: exact Javier state, working approval, one receipt, final preflight, matching video/still. | Very high / small once the modal issue is closed. | Five post-change successful owner/QA charges, exact receipts and balance/limit deltas; an injected receipt timeout produces no second tap/charge; green preflight after final rehearsal. |
| 2 | **Finish the six-beat pitch and pilot ask**, with a legible money proof and current v2 Q&A. | Very high / small; most changes shipped during this round. | 224-word script, <3-minute published-player rehearsal, matching quote/receipt numbers, no v1-era answers or unsecured-loan backing claim. |
| 3 | **Make degraded operation credible**: exact paid replay, no unknown-as-zero, visible retry/stale states, RPC-independent Tour instructions. | High / medium; payment and proxy repairs are largely in place. | Fault injection preserves uncertainty and existing intent; no extra charge; no endless skeleton; tour can explain itself during an RPC outage. |

Do not spend the remaining window adding another product, raising virtual depth to improve screenshots, or promising a new real-world integration. The highest return is a coherent claim with a reliable, inspectable demonstration.

## Final status updates

**Final review cutoff: 05:07 UTC, 14 October 2026. The shared workspace still contains in-flight crew changes; this is a review checkpoint, not a frozen release.**

- **Independently closed:** Remesas known-hash/memo recovery cases; paid-result failure/recovery/completed replay and ten-way single-process concurrency; history error/retry; modal focus containment; Home unknown-as-zero; Tour first navigation during RPC outage. These are the bounded checks described above, not broader financial or security assurance.
- **Card remains a P0 gate:** successful QA charges exist, but a prior silent failure and the independently reproduced lost-hash path require the corrected reconciliation logic, fault injection and five consecutive post-fix browser runs. The in-flight retry repair still offers a fresh tap five seconds **before** expiry (`card-screen.tsx:160` at cutoff); review requested chain timestamp strictly beyond expiry plus fresh nonce/event reconciliation. [Preserved in-flight source](final-evidence/card-screen-inflight-final.txt). Hash persistence and the final fault test are still outstanding at cutoff. No duplicate live charge was executed by review.
- **Tour boundary remains a P1 follow-up:** preserve instant navigation, but mark unknown boundaries and exclude ambiguous activity. A visit from an earlier step must not remain eligible to collect later events after the user leaves it.
- **Presentation:** 20 ordered slides rendered, all local images loaded and no element exceeded the slide boundary; six main notes total 224 words. Q&A now describes deployed v2 and the exact paid-intent/response distinction. Local playback passes. The private published-player check is assigned by lead to josu and remains outside this review.
- **v5 scope:** josu requested more color and motion during this round. Baseline acceptance does not cover that new skin. Review prepared a bounded desktop/phone, theme, presentation and reduced-motion check; QA owns the subsequent complete v5 matrix and `review/RELEASE.md`. The planned 05:03 restart resolved stale CSS; the resulting 36-case shared-shell pass and eight motion/presentation samples are clean within their stated scope. Primary actions fit; Global has only 14px spare. Dark Global and Home fixes are visually verified. Later page skins still require QA’s final gate. Preserve the approved 50ms/eight-decimal counters, with the specified reduced-motion behavior.

**Release judgment:** the six-beat pitch is materially more focused and the major reproducible payment defects have actionable fixes. Do not call the live spending path ready until the Card gate closes. A verified recording plus an inspectable receipt remains the reliable fallback. The commercial claims still require the pilot and cash-out evidence described in the ask.
