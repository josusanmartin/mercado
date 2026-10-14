# V2 adversarial review

Snapshot: 2026-10-14 approximately 01:57 UTC. Scope: `crew/V2-DESIGN.md` and first WIP implementation. This is **not deployment acceptance**. Reviewer writes only under review/, uses local tests and read-only live checks, and commits nothing. See FINDINGS for owner/status tracking.

## Decision

Separate CDP and AMM reserves are the right accounting boundary. Local review now verifies the donation, paused-quote and no-floor bucket fixes plus the bounded invariants listed below. V2 must remain behind the explicit version gate until deployment and the atomic R-030 integration pass; stale design/UI claims also need updating. Lead's redemption rule `amountIn <= AMM liability` is present in source; source presence is not yet deployment proof.

## Solvency and accounting

Let R be tracked OUSD reserve, L AMM-issued xMXN liability, and m MXN per USD. Coverage is R*m/L. CDP debt is separate. Accept a system-wide identity `totalSupply = sum(CDP debt) + L`; cross-origin fungible repayments must preserve it without tracking which minter created an individual token.

The original proposal floored L at zero on arbitrary redemptions. Lead correctly required amountIn<=L before coding: otherwise CDP issuance could access residual AMM equity at zero liability. Current source rejects the excess and subtracts exactly the burned amount. Require tests at L=0, L, L+1, with CDP tokens and after intervening CDP repayments.

With R=1,250 OUSD and L=20,000 xMXN, coverage at m=20 is125%, at16 is100%, and at12.8 is80%. The move20→16 is a20% decline in MXN-per-USD and a25% appreciation of the peso versus USD. The25% seed buffer is **initial**, not a perpetual cushion: accepting mints down to100% dilutes it as issuance grows. Disclose this, and show current coverage rather than a fixed protection percentage.

Under stress, the formula bounds a redemption by its pro-rata NAV before fee/size deductions. This can preserve nonnegative reserves without promising par redemption. Haircuts transfer loss to holders; the per-window budget can make later holders wait. Fees and retained curve impact change coverage between calls, so “no bank run/no first-mover advantage” is too absolute. Owner equity withdrawal and mint admission need their own post-state checks; no pricing curve substitutes for funded capital.

The initial curve is a stateless per-call oracle discount: splitting one large trade into smaller trades lowers aggregate size impact. It does not maintain constant-product virtual reserves across swaps. Treat depth as a quote parameter, not evidence of market liquidity; test split/round-trip paths and state this limitation if retained. The max liability and collateral ceilings must cover aggregate issuance across addresses, not just each swap.

R-028: initial `_window` is a fixed24h epoch, not a rolling-day bound. Test a late-epoch redemption followed by a reset-boundary redemption. A documented fixed-window burst is a different policy from “at most25% in any rolling24h.” R-029: quote must reject a known paused venue before a paid endpoint sells it.

## ERC-4626 collateral

R-027 is reproduced locally: deposit100 OUSD, no yield reserve, wait365days at20% APR, then donate20 OUSD. `convertToAssets(1e6)` moves1,000,000→1,199,999 without advancing time. Fresh donations do not reprice, so the naive donation test passes. Evidence: `evidence/v2-staked-donation.log`, `contracts/ReviewV2Staked.t.sol` and initial source hashes.

`min(accrued,balance)` retains old unfunded accrual, permitting later transfers to recognize it immediately. New backing is present, so this is not a demonstrated unbacked-mint exploit; it breaks the stronger donation-independent, rate-bounded valuation assumption stated by the feed/design. Require accounted funded yield, checkpoint-before-funding, and no retrospective realization on permissionless direct transfer.

Also require first depositor/dust, complete withdrawal/redeposit, exhausted reserve/refill, deposit/withdraw checkpoints, share/asset decimal normalization, and rounding-to-zero checks. Only whitelist the audited demo implementation. Interface compliance alone is not safe collateral pricing. The [ERC-4626 standard](https://eips.ethereum.org/EIPS/eip-4626) distinguishes conversion estimates from guaranteed redemption and warns that preview values may be manipulated; [OpenZeppelin's ERC-4626 guidance](https://docs.openzeppelin.com/contracts/5.x/erc4626) explains first-deposit inflation and virtual offsets. A virtual offset addresses that rounding attack, not every oracle or funded-accrual assumption.

## RWA feeds, haircuts and ceilings

The admin feed and faucet asset are demo trust assumptions. A200% mint ratio/170% liquidation threshold/12% bonus is not a valuation or liquidity guarantee. Feed max-jump constraints limit each ordinary update, not cumulative movement, and owner `forceSet` bypasses the jump bound. No market, custodian, Treasury claim or enforceable redemption is established.

Current MultiCollateralVault owner can replace feeds, adjust risk params and raise/lower ceilings. Structural ratio checks remain, but do not call these powers immutable, timelocked or lowering-only. Test stale/paused/zero/out-of-band collateral AND FX reads, fractional6/18dp valuation, gap-down liquidation, per-collateral aggregate ceilings across two borrowers, ceiling reduction below current debt, and oracle-independent repay/debt-free withdrawal.

`maxWithdrawable` in source uses the necessary nested ceil steps inverse to its two floor valuations. Preserve exact bound tests: quoted amount passes, one additional unit fails where debt is positive and collateral is sufficient. Donations to the CDP must not credit any position or raise the debt ceiling.

## Integration gate

V1 stays active until lead explicitly flips all token/venue/pool/payment consumers. R-026 originally selected v2 on mere manifest presence; owner reports a shared gate fix, awaiting reviewer verification. Signed quotes must bind chain, protocol, input/output tokens, venue, amount, expiry and min-out. A paid quote is an indicative signed response, not settlement or guaranteed execution.

Shared mock FX means live v2 stress also changes v1 health and desk quotes. Prefer isolated local stress; coordinate and prove restoration for any live demonstration. New sponsor targets/selectors require fresh review after export. No v1 receipt proves v2 runtime, issuer roles, reserve funding, or completed flows.

## Fix verification (01:57)

`evidence/v2-no-floor-recheck.log`:15 test executions,10 distinct tests (Move is also inherited by the Vault suite), including256 fuzz cases for18dp withdrawal bounds, all pass. Source hashes are in `evidence/v2-reviewed-source-sha256.txt`. These are local real-TIP20 tests, not deployed/e2e proof.

- R-027: donation after a dry year and later `fundYield` do not recognize unfunded history. Direct donations remain ignored; future funded accrual works.
- R-028: lead rejected the1000 OUSD floor. Final source sets capacity to25% of tracked reserve and leaks continuously; the old epoch-boundary reproduction is rejected. The accepted burst-plus-refill policy is not a strict rolling25% spending cap.
- R-029: paused quote rejects before any payable API response.
- Fungible burns, L+1 refusal, NAV payout bound, two-borrower ceiling and lowering below debt, RWA gap-down liquidation, paused-feed repay/debt-free withdrawal, and exact18dp max withdrawal pass.

Initial source/probes/results are preserved separately. `v2-move-initial.log` failed on the reviewer constructor signature; the first L+1 test in `v2-move-initial2.log` placed a getter after expectRevert and consumed the expectation. Both instrumentation defects were corrected before acceptance. Neither indicates a protocol bypass.

## Deployed snapshot (block39491154,02:00 UTC)

`evidence/v2-live-1791943177493.json`:35/35 manifest receipts succeed;9/9 deployed runtimes match the reviewed artifacts, masking only immutable-reference slots. The factory is locked, vault/AMM are issuer members, factory/merchant are not, and vault/AMM/pool all bind the v2 token. Aggregate supply equals summed CDP debt plus AMM liability; tracked reserve and accounted sOUSD assets/future yield are funded. Equity is at least2500 OUSD, pool cash is positive and the redemption cap is precisely25% of tracked reserve.

This qualifies the contracts/deployment snapshot, not the atomic app switch or complete browser/MPP journey. Shared-version gate probes still allow missing vault/oracle, and v1-shaped shared vault reads still need migration for Home under R-030. The initial read-only probe had a reviewer `hasRole` argument-order error; corrected probe uses Tempo's address-first signature.
