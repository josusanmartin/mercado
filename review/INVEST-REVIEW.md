# Mercado Invest review queue

Queued 2026-10-14 02:33 UTC after Card charge authorization review. Authority: DESIGN-ECOSYSTEM §7 / lead's02:32 assignment. Six products: Mint, Remesas, Global, Crédito, Card, Invest. At the initial snapshot source/deployment were pending. Source is now reviewed; local results below. Deployed/UI acceptance remains separate.

## Contract pricing and inventory gate

- Read actual token decimals and price scale. Buy uses a conservative rounded-up payment; sell rounds payout down. Verify spread direction and small-amount rounding, zero input/output, fee bounds, exact inventory and inventory+1, and repeated buy/sell round trips. No free mint or positive-profit round trip at unchanged price.
- Buy/sell tTBILL moves existing inventory and actual OUSD; it cannot silently mint demo assets or refill liquidity. Quotes must expose inventory/cash constraints and minimum output/maximum input protection. A successful quote is not a reserved fill.
- Admin price feeds and the FX oracle must reject invalid/stale/paused observations as applicable. Keep the price provider, update time, assumed OUSD $1 value and trust boundary visible. Cross-source price changes require current checks during execution.
- xMXN buys routed through vAMM redemption inherit its liability, NAV haircut, size limit, fee and refill-bucket constraints. Determine atomic versus multi-transaction execution. If redemption succeeds and asset purchase fails, show/recover the OUSD proceeds without redeeming again. Do not label an unrealizable oracle-mid estimate as withdrawable value.
- Test both token directions, transfer/allowance failure rollback, inventory/cash isolation, owner price/config scope, reentrancy and explicit quote execution bounds. Confirm active v2 token/desk bindings and sponsor selectors/spenders; admin inventory or pricing functions must not be sponsored as user trades.

## Savings and portfolio gate

| Product | Real source | Honest user meaning |
|---|---|---|
| Ahorro en pesos | CreditPool v2 shares/claims, idle cash, outstanding principal and realized fees | Historical variable lender fees, no guaranteed return; claim is not all immediately withdrawable; unsecured credit/default risk |
| Ahorro en dólares | ERC-4626 shares, total accounted assets and funded demo yield | Demo yield source, admin-funded on testnet; assets/shares conversions use current on-chain math; future displayed APR is not a promise of funded future earnings |
| Demo tTBILL | InvestDesk trades at admin feed price/spread and finite inventory | Simulated asset/backing; no real Treasury/custody/redemption rights; no real Treasury/custody/redemption rights |

Total portfolio value needs a named unit/rate/time and a distinction between marked value and executable liquidation value. Avoid adding xMXN, OUSD and tTBILL raw units. Accrued return since deposit requires actual cost basis, deposits/withdrawals and fee/yield accounting; current balance minus principal is wrong after transfers or multiple entries unless those are tracked. If cost basis is unavailable, show current claim/share price rather than fabricate profit.

## UX acceptance

Android phone on desktop/full-screen mobile, Spanish-first, gold accent with ink text, network/testnet disclosure and per-product yield source. Deposit/withdraw/trade sheets show token, balance, expected execution, constraints and actual receipt. Linking held tTBILL to Mint must preserve active account/token and state the collateral haircut, ceiling and liquidation risk; borrowing against it does not multiply safe guaranteed yield.

Next: inspect InvestDesk when contracts posts source, write bounded independent local adversarial probes under review/contracts/, read deployed runtime/receipts without broadcasting, then review the /invest UI as api lands it. Review commits nothing.

## First source/local pass (02:38)

InvestDesk routes xMXN trades atomically through MoveAMM; outer minOut protects the combined trade, and a failed buy restores the AMM burn/reserve/liability in the local probe. Both direct OUSD directions use6dp tokens,8dp price, conservative downward output and upward fee rounding. Inventory is tracked independently from donations; admin can seed/withdraw/change spread. Existing stale/paused-feed tests pass.

14 tests pass (10 owner+4 independent,256 round-trip fuzz runs), evidence invest-review-tests.log. Two findings: R-042 public DemoRWA faucet→sell allows an unfunded wallet to drain9975 of10000 OUSD in one local sequence; R-043 paused desk still quotes while trade reverts. Both posted. This is testnet reserve liveness/economic interpretation, not a claim of real-value theft. No live trade or exploit executed by reviewer.

## Replacement accepted at bounded contract/source scope (02:43–02:52)

17 local tests pass (12 owner+5 independent,256 fuzz). Faucet-only sale rejects, paused quote rejects, and transferred tokens do not convey bought[wallet] eligibility. New desk0xDacE8de24876Dc52930B3f986C4c9427d124EfEd matches the reviewed runtime; active v2 token/feed/AMM bindings and inventory funding pass atblock39495410, unbought sell eth_call gives ExceedsBoughtBalance,5 manifest receipts succeed (`invest-live-1791945774666.json`).

UI source fixes: personal withdrawable is min(claim,cash); sOUSD/tTBILL return is unavailable if holdings do not match own event-derived units; sell maximum uses personal buyback right and explains transfers/liquidations do not inherit that right. No guaranteed-return claim observed. Browser Card/Invest/Driver routes200 with no page errors or horizontal overflow at390/1440 (`extensions-1791945841528.json`). User-driven browser trade proof remains API/QA's evidence, no reviewer transactions.
