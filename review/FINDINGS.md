# Mercado review findings

Last reviewed commit: `274cfe6d53099cbdbac47c331e980a39ea235087`.
First pass: 2026-10-14, approximately 00:38–00:42 UTC. Includes the uncommitted API/credit service, FX adapter, frontend ABI/format helpers, and OUSD migration visible during that window. This is a moving shared tree; line numbers below refer to the inspected version. Reviewer writes only `review/` and does not commit.

## Findings

### R-001 — P1 — api — Unknown liquidity still permits a signed advance offer

- Status: OPEN; posted to `@api`.
- Location: `apps/web/lib/server/credit/index.ts:23` (read failure), `:57` (undefined cap), `:111` (signature); `apps/web/lib/server/credit/score.ts:115`.
- Scenario: the pool is configured and the signer key exists, but `availableLiquidity()` fails because the RPC is unavailable or the pool address is wrong. The catch returns `undefined`; scoring skips the liquidity constraint and the service signs an attestation anyway. The steady fixture advertises 1,500 xMXN despite no successful funding check. Borrowing may then revert. This does not establish an on-chain cap bypass.
- Evidence: executed the actual pure scoring module through TypeScript transpilation. Steady fixture + unknown liquidity → eligible, 1,500 xMXN; zero liquidity → ineligible, zero; 75 xMXN liquidity → eligible, 70. The service source passes the read-failure value directly into this path.
- Fix: retain an illustrative score if useful, but withhold the executable attestation when required pool reads fail. Explicitly explain unavailable funding and test the RPC-failure path with a configured pool and signer.

### R-002 — P1 — qa — Double charging and wrong debt accounting can still produce PASS

- Status: OPEN; posted to `@qa`.
- Location: `scripts/demo-journey.ts:425` (retry balance check), `:338` (debt delta), `:473` (step initialized as pass). Line numbers precede the OUSD rename.
- Scenario: the same order/reference is returned after charging twice. J5 only prints a warning and records a note, so the step remains `pass` and the script exits successfully. J4 similarly only warns when debt growth differs from principal plus the stated fee.
- Evidence: source review of committed `274cfe6`; no live duplicate charge attempted.
- Fix: assert no second xMXN payment on retry and assert the exact documented debt delta. Preserve failures in `last-run.json`; do not let either path count as acceptance evidence.

### R-003 — P1 — qa — Negative contract checks accept transport failures as valid reverts

- Status: OPEN; posted to `@qa` alongside R-002, separately clarified below in channel.
- Location: `scripts/demo-journey.ts:262` and `:345` (negative simulation catch blocks, before OUSD rename).
- Scenario: an RPC timeout during the over-mint or replay simulation is caught and reported as a successful rejection. The actual contract behavior is then untested, but the journey still says PASS.
- Evidence: each catch rejects only its own synthetic `did NOT revert` message and accepts every other error.
- Fix: require a decoded contract revert and the expected custom error/reason; propagate network, decode, and unrelated revert failures. If prerequisites are unavailable, record blocked/skipped evidence explicitly.

## First-pass coverage and evidence limits

- Read `SPEC.md`, `INTERFACES.md`, crew guidance, all initial commit stats, README/acceptance disclosures, shared chain/schema/types, all three income fixtures, credit scoring/attestation/provider source, FX/env/deployment/http helpers, API routes present, frontend ABI/format helpers, and the full journey script. Scanned status/diff for uncommitted work.
- Lead's 00:39 decision changes collateral to **Testnet OUSD (Tempo faucet, no real value)**, deployment key `ousd`; followed updated `INTERFACES.md` and `crew/COMMON.md`. Existing dOUSD references are a migration watch item, not evidence that the team intends to ship the old configuration.
- API EIP-712 types match the current interface: `MercadoCreditPool`, version `1`, chain 42431, verifying pool, and `Eligibility(address borrower,uint256 maxAmount,uint256 expiry,uint256 nonce,bytes32 dataHash)`. Solidity implementation was not yet present for cross-language verification.
- Executed all three pure fixture score cases with unknown, zero, and 75 xMXN liquidity. Baseline scores: steady 96.5 / 1,500 maximum; irregular 54.2 / 590 maximum; new-driver 21.3 / ineligible. These are illustrative rules, not validation of a credit model.
- Contracts existed only as Foundry setup and a TIP-20 probe at the first-pass boundary. Vault math, roles, liquidation, desk isolation, lending, and deployed behavior are **not yet reviewed or accepted**.
- Next dashboard remained scaffold/in-progress; no successful browser journey is claimed. MPP app routes were not yet present. No on-chain transactions were initiated by this reviewer.

## Dependency facts checked

- Installed `mppx` is **0.13.4**. Read `dist/tempo/Methods.js`, `dist/tempo/server/Charge.js`, and `dist/server/Mppx.js`. Charge input uses decimal token units and is converted with `parseUnits(amount, decimals)`. Passing already-scaled base units would multiply the charge by 10^6.
- Current route verification compares amount, currency, recipient and application metadata; Tempo charge requires a challenge-bound transfer memo. Bind quote/order identity in application metadata and keep order idempotency separate from payment verification.
- `tempo.charge` defaults to an in-memory replay store. A new method/store per request would lose the replay namespace. Review persistent/single-process order and payment state once implemented.
- Read local `tempo-std` TIP-20 interfaces and `ForkProbe.t.sol`; issuer-gated burn operates on the caller balance. Pool/vault tests must account for the actual precompile behavior.
- Official references consulted: [MPP server creation](https://mpp.dev/sdk/typescript/server/Mppx.create), [Tempo source](https://github.com/tempoxyz/tempo), [Tempo integration guide](https://docs.chain.link/ccip/v1/evm/tools-resources/network-specific/tempo-integration-guide). Direct docs.tempo.xyz pages redirected to a location unavailable to the browsing tool; installed source is the implementation evidence used here.

## Next pass

Start with `IRC_NICK=review bin/irc unread`, then `git log --stat 274cfe6..HEAD`, status/diff, new contracts and payment code. Recheck open findings after fixes, compare API signatures to the real pool, and verify OUSD address/label migration. Review real 402 amount/order binding, concurrent retries, paid-but-unfulfilled recovery, stale oracle UI, and executable wallet paths as they land.
