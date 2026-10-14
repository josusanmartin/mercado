# Necessary-mock and live-wiring audit

Started02:10 UTC against josu's02:08 rule. `MOCKS.md` was posted by qa at02:12 and is now reconciled below (it was absent at the initial scan). Search output (327 matches) is preserved in `evidence/mock-wiring-search.txt`; this is an audit queue, not327 findings. Test fixtures, form placeholders, explanatory scenario previews and comments are not automatically fabricated product data.

## Inventory / current evidence

| Surface | Actual source now | Status and required check |
|---|---|---|
| OUSD/xMXN balances, pool cash/debt/fees | Active contract reads | Real testnet state, independently checked. Keep failure→unavailable and version binding. |
| v2 reserve/coverage/liability, CDP totals | MultiCollateralVault/MoveAMM views | Deployed runtime/accounting checked atblock39491154. Live charts must derive from these views/events, not the numerical example in design docs. |
| Driver income/history | DemoEarningsProvider / fixtures/uber | Necessary mock; retain Demo Uber Data beside all income/chart/eligibility views. Model is actual deterministic code but illustrative, not validated credit underwriting. |
| Driver OAuth | Demo connection / prepared profile | Allowed external mock; must never suggest real Uber authorization or request a driver's password. |
| Bill fulfillment | Demo provider after verified MPP settlement | Necessary mock; SIMULATED must remain beside completion. Actual quote/order/payment/receipt state cannot be mocked. Only show actionable providers with a working adapter. |
| sOUSD yield | Owner-funded reserve + admin APR | Necessary demo source, actual funded contract accounting. Donation/late funding fixes verified. Label mock yield; never describe it as real staking income. |
| tTBILL price/backing | AdminPriceFeed / DemoRWA | Necessary mock. Label demo token with no real T-bill backing. Haircut and debt ceiling are real on-chain controls, not proof of underlying assets. |
| FX rate | Public Coinbase / open.er-api → admin relay → oracle | Implemented; R-036 jump bypass and R-037 source-age/provenance defects locally reproduced. Keep M1 yellow pending fixes. |
| Crédito fee/cap/utilization | Live active CreditPool reads | R-035 source fix verified02:21; fee rounds up like the contract, unavailable params have no invented fallback. |
| Browser recent receipts | mercado.activity.v1 localStorage, filled on confirmed writes | Real local convenience history, not authoritative global product activity or volume. New event indexer needed for ecosystem tables/counters. Scope/filter by token/protocol/account. |
| Underwriter trace | Literal playback of a previously recorded real run, labeled Recorded trace | Historical proof can remain labeled playback with actual tx/source; must not be substituted for current activity/KPIs. New API panel should use real run/state for live claims. |
| Stress slider | Derived counterfactual from real position/rate | Scenario preview, not history or an actual oracle write. Label preview and never fabricate a liquidated receipt. |
| Default phone/amount/recipient | Prepared form inputs | Defaults are not settlement evidence. Distinguish prepared demo accounts/funding from real income and successful delivery. |

## FX relay provenance

[Frankfurter's official documentation](https://frankfurter.dev/) describes daily reference-rate updates and says the API is not designed for live trading. It is a possible real external data source, not a decentralized or continuously executable FX feed. Preserve source name, source rate date, fetch time and transaction/block update separately. An on-chain keeper heartbeat does not refresh the underlying market observation. Reject invalid units, stale/missing/future dates and failed fetches; never silently fall back to20 or renew stale data as current. Follow the relay owner's explicit weekend/reference-age policy rather than inventing fresh market ticks.

Stress uses admin forceSet and must restore the chosen external observation without racing the normal keeper. Existing `isMock()` is hardcoded true in the v1 adapter; an off-chain provenance record should distinguish normal external relay from stress/admin mode without pretending the source is decentralized.

## Event/indexer checks when it lands

Use the active token/contracts and deployment start block. Handle provider getLogs range limits with chunks and stable cursors; deduplicate by chain/blockHash/transactionHash/logIndex and handle reorgs or label confirmation depth. Snapshot/history coverage must be visible if scans truncate or fail. Keep token units/directions distinct. Transfers can emit both Transfer and TransferWithMemo: one delivery cannot count twice. AMM mint-to-recipient can also produce Swapped+Transfer; select the semantic event once for product volume. Pool Borrowed principal and fee/debt changes are not the same unit of “volume.”

A transfer to the merchant proves a token transfer, not necessarily an MPP order. Match to real verified order/payment state before labeling “MPP payments”; otherwise say merchant inflows. Merchant balance is not cumulative revenue. Pool repayment circulates supply; only CDP repayment/AMM redemption burn it.

## Pending

Reconcile every row with qa's MOCKS.md once posted; identify omissions with exact code path and visible label. Inspect new Home/product code as it lands; no fabricated fallback chart/history/count is acceptable. Keep intended future wiring separate from current implemented evidence.

## MOCKS.md reconciliation (02:13)

A1–A6 and B1–B6 cover the necessary external mocks and disclosed testnet assumptions found in the first source pass. G1 is incomplete: it lists only1500 cap, but R-035 also includes the mutable2% fee/debt preview and80% utilization literal. Owner notified; contracts is exposing the reads, api consumes them. G2 already labels its historical trace; the new Crédito API panel is replacing it with actual paid-ledger rows. G3 ($1 OUSD valuation assumption) is correctly open. G4 must await verified relay provenance, not just a new label.

The code-marker checker is heuristic: it allowlists whole paths and scans a narrow numeric JSX pattern, so a clean exit proves listed-marker coverage, not live sourcing of derived constants, histories or charts. Independent output is in `evidence/check-mocks-independent.txt`; keep ACCEPTANCE M1 yellow while semantic gaps are open. No production file or registry changed by reviewer.

## Relay/indexer landing review (02:21)

QA reconciled indexer supply and loan totals on both protocols; manually checked CreditPool event signatures match. Recipient args with viem events are applied locally, not encoded into RPC topics; this is extra scan cost rather than inclusion of unrelated recipients. R-038 remains a semantic attribution issue: merchant inflows cannot be called MPP payments without verified settlement records.

Actual relay functions were executed with local adapters only (`fx-relay-1791944443248.json`). They accept source dates2020/2099 and walk20→10 through four synthetic prices despite the20% jump guard. Record freshness must separate source observation, fetch and block time, and must bind to the actual oracle update. R-036/R-037 posted to contracts/api/lead.

## Verified fixes / new exceptions (02:30)

R-036/R-037 actual-function recheck `fx-relay-1791944691686.json`: outsize jumps and2020/2099 dates write nothing, Coinbase observation time stays null and receipt block time supplies onchainAt. API read-only200 on both previews has corrected provenance (`fx-api-live2.json`). R-038 now says Transfer to merchant / merchantInflows and filters by RPC topic. R-035 mutable pool terms are sourced correctly.

New authorized mocks to register: Demo DiDi/Rappi earnings and simulated consent alongside Uber; Card PAN/network and demo merchant identity. Card token movement, limits, freeze, charges, refunds, activity and KPIs must be real. Platform-specific labels may never conceal an Uber fallback. Record pending implementations as pending, not accepted live data.
