# Mercado — shared interfaces (v0, coordinator-owned)

This is the contract between the four workstreams. **Change it only by posting the change in #mercado first** (`bin/irc say ...`) and then editing this file in the same commit as the code change. Everything here is a starting point. If Tempo or mppx reality disagrees, reality wins, but announce the difference.

## Conventions

- Chain: Tempo Moderato testnet, chain id **42431**. RPC, explorer, and faucet details: the `contracts` agent confirms them and records them in `packages/shared/src/chain.ts`.
- Token amounts: TIP-20, **6 decimals** for both OUSD and xMXN. Always `uint256` / `bigint` base units in code; format only at the UI edge.
- FX: `mxnPerUsd` uses **8 decimals** (20.00 MXN/USD = `2_000_000_000`). `updatedAt` is unix seconds.
- Ratios and fees are in **basis points** (`15000` = 150%).
- Collateral token: **Tempo's testnet OpenUSD (`OUSD`)** at `0x20c0000000000000000000006a37da5c996874be` (6dp, currency USD; faucet-funded via `tempo_fundAddress`). UI label: **"Testnet OUSD (Tempo faucet, no real value)"**. Never say it's issuer-backed or redeemable. The vault, desk and pool take the collateral address as a constructor param; our own `dOUSD` test token is a fallback only if the faucet token misbehaves.
- Debt token: **xMXN**, name "Mercado Synthetic Peso (testnet)", TIP-20 created via Tempo `TIP20Factory`, currency "MXN" if the factory accepts it.
- Deployed addresses go in `packages/shared/src/deployments/42431.json` (written by `packages/contracts/script/Deploy.s.sol` + export script):
  ```json
  { "chainId": 42431, "ousd": "0x…", "xMXN": "0x…", "factory": "0x…", "oracle": "0x…",
    "vault": "0x…", "swapDesk": "0x…", "creditPool": "0x…", "attestationSigner": "0x…",
    "merchant": "0x…", "deployedAt": "ISO", "txs": { "label": "0xhash" } }
  ```
- ABIs: `packages/shared/src/abi/<Contract>.ts` exporting `export const <contract>Abi = [...] as const` (generated from `forge build` output by `packages/contracts/script/export-abi.mjs`). Until real ABIs land, consumers code against the interfaces below.
- Package manager: **npm workspaces** (pnpm is broken on this box). Root `package.json` workspaces: `apps/*`, `packages/*`. Shared package name: `@mercado/shared`.
- Secrets: root `.env.local` (gitignored) holds testnet throwaway keys: `DEPLOYER_*`, `ATTESTATION_SIGNER_*`, `LP_*`, `SENDER_*`, `RECIPIENT_*`, `DRIVER_*`, `LENDER_*`, `MERCHANT_*` (`_PRIVATE_KEY`, `_ADDRESS`). Never commit keys. `.env.example` lists the names.

## Protocol parameters (demo-only)

| Param | Value |
|---|---|
| `MIN_MINT_RATIO_BPS` | 15000 (UI recommends ≥ 20000) |
| `LIQUIDATION_THRESHOLD_BPS` | 13500 |
| `LIQUIDATION_PENALTY_BPS` | 1000 (10% bonus to liquidator, paid from the position's collateral) |
| `ORACLE_MAX_AGE` | 3600 s (stale → revert) |
| Oracle sanity band | 5.00 – 50.00 MXN/USD; max jump per update 20% unless admin `forceSet` in stress mode |
| SwapDesk spread | 50 bps per side, max 10,000 xMXN-equivalent per swap, max 2,000 OUSD-equivalent per address per 24h |
| CreditPool borrow fee | 200 bps flat, added to debt at borrow time (realized when repaid) |
| CreditPool caps | per-user 1,500 xMXN; pool-wide outstanding ≤ 80% of supplied |

## Solidity interfaces

```solidity
interface IFXOracleAdapter {
    // mxnPerUsd: 8 decimals. Reverts if zero, stale (> maxAge), out of sanity band, or paused.
    function price() external view returns (uint256 mxnPerUsd, uint256 updatedAt);
    function decimals() external pure returns (uint8); // 8
    function maxAge() external view returns (uint256);
    function isMock() external view returns (bool);     // true on testnet admin feed → UI must label it
    function peek() external view returns (uint256 mxnPerUsd, uint256 updatedAt, bool valid); // never reverts
    // admin (testnet mock): setPrice(uint256), pause(), unpause()
    event PriceUpdated(uint256 mxnPerUsd, uint256 updatedAt);
}

interface ICollateralVault {
    struct Position { uint256 collateral; uint256 debt; } // OUSD 6dp, xMXN 6dp
    function depositCollateral(uint256 amount) external;           // transferFrom OUSD
    function mint(uint256 xmxnAmount) external;                    // requires ratio >= MIN_MINT after
    function repayAndBurn(uint256 xmxnAmount) external;            // pulls xMXN, burns it, reduces debt
    function withdrawCollateral(uint256 amount) external;          // requires ratio >= MIN_MINT after (or debt==0)
    function liquidate(address user, uint256 debtToCover) external; // only if ratio < LIQ_THRESHOLD
    function getPosition(address user) external view returns (Position memory);
    function collateralRatio(address user) external view returns (uint256 bps); // type(uint256).max if no debt
    function maxMintable(address user) external view returns (uint256 xmxn);
    function maxWithdrawable(address user) external view returns (uint256 ousd);   // exact: MAX always executes
    function isLiquidatable(address user) external view returns (bool);
    function totalCollateral() external view returns (uint256);  // OUSD locked (three-buckets view)
    function totalDebt() external view returns (uint256);        // == xMXN totalSupply
    event Deposited(address indexed user, uint256 amount);
    event Minted(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator, uint256 debtCovered, uint256 collateralSeized);
}

interface ISwapDesk {
    // ousdToXmxn=true: amountIn OUSD → xMXN out. Uses oracle price minus spread; reverts if reserves insufficient.
    function quote(bool ousdToXmxn, uint256 amountIn) external view returns (uint256 amountOut, uint256 fee);
    function swapOusdForXmxn(uint256 amountIn, uint256 minOut) external returns (uint256 amountOut);
    function swapXmxnForOusd(uint256 amountIn, uint256 minOut) external returns (uint256 amountOut);
    function reserves() external view returns (uint256 ousd, uint256 xmxn);
    function remainingDailyCap(address user) external view returns (uint256 ousdEquivalent); // 24h per-address cap
    function seed(uint256 ousd, uint256 xmxn) external;  // PERMISSIONLESS (a gift; pulls via transferFrom)
    function paused() external view returns (bool);
    // owner (DEPLOYER): withdrawReserves(ousd, xmxn, to), setParams(spreadBps, maxSwapXmxn, dailyCapOusd), pause(), unpause()
    event Swapped(address indexed user, bool ousdToXmxn, uint256 amountIn, uint256 amountOut, uint256 fee);
}

interface ICreditPool {
    // EIP-712 domain: name "MercadoCreditPool", version "1", chainId, verifyingContract = pool
    // Eligibility(address borrower,uint256 maxAmount,uint256 expiry,uint256 nonce,bytes32 dataHash)
    function supply(uint256 amount) external;
    function withdrawAvailable(uint256 amount) external;           // only unlent liquidity, only own share
    function borrow(uint256 amount, uint256 maxAmount, uint256 expiry, uint256 nonce,
                    bytes32 dataHash, bytes calldata signature) external;
    function repay(uint256 amount) external;
    function getDebt(address borrower) external view returns (uint256);
    function availableLiquidity() external view returns (uint256);
    function lenderBalance(address lender) external view returns (uint256 claim);  // principal + realized fees share
    function stats() external view returns (uint256 totalSupplied, uint256 totalBorrowed,
                                            uint256 outstanding, uint256 realizedFees);
    function attestationSigner() external view returns (address);
    function nonceUsed(address borrower, uint256 nonce) external view returns (bool);
    // largest draw executable right now: min(attested headroom, per-user cap, cash, 80% utilization headroom)
    function borrowCapacity(address borrower, uint256 maxAmount) external view returns (uint256);
    function maxBorrowable(address borrower) external view returns (uint256);  // same, ignoring the attestation
    function eligibilityDigest(address borrower, uint256 maxAmount, uint256 expiry, uint256 nonce, bytes32 dataHash)
        external view returns (bytes32);
    event Supplied(address indexed lender, uint256 amount);
    event Withdrawn(address indexed lender, uint256 amount);
    event Borrowed(address indexed borrower, uint256 amount, uint256 fee, uint256 nonce, bytes32 dataHash);
    event Repaid(address indexed borrower, uint256 amount, uint256 remainingDebt);
}
```

## HTTP API (Next.js route handlers in `apps/web/app/api/**`)

The Zod schemas live in `packages/shared/src/schemas.ts`. Every response carrying mock data includes `"demo": true` plus a human label.

| Route | Method | Request | Response |
|---|---|---|---|
| `/api/fx` | GET | — | `{ mxnPerUsd: string /*8dp int*/, rate: number, updatedAt: number /*0 before deploy*/, source: "mock-admin-oracle" \| "config-fallback", isMock: boolean, stale: boolean /*from oracle.peek()*/, oracle?, label }` |
| `/api/driver/demo` | GET | `?profile=steady\|irregular\|new-driver` | `{ demo: true, label: "Demo Uber Data", profile, driver: DriverProfile, weeks: WeeklyEarnings[] }` |
| `/api/driver/score` | POST | `{ borrower: Address, profile }` | `{ demo: true, eligible, score, scoreFloor, features: {...}, explanation: string[], maxAmount: string /*6dp credit line = attested max outstanding principal*/, availableToBorrow: string /*6dp, CreditPool.borrowCapacity now — use as the draw max*/, capReason, dataHash, attestation?: { borrower, maxAmount, expiry, nonce, dataHash, signature, signer, pool, chainId }, attestationWithheld?: string }`. Attestation only when pool capacity was read and > 0. `?access=underwriter`: MPP-paid (2 xMXN) third-party report, no attestation. |
| `/api/bills/quote` | POST | `{ provider: "telcel" \| "cfe", phone?, serviceNumber?, amountMxn }` | `{ quoteId, provider, description, amountMxn, amount: string /*6dp xMXN*/, token, tokenSymbol, recipient, expiresAt, simulated: true, label }` (15 min) |
| `/api/bills/pay` | POST | `{ quoteId, idempotencyKey }` + MPP credential header | **402** with an mppx challenge if unpaid (`X-Mercado-Order-Id` header). Otherwise `{ orderId, status, paidButUnfulfilled, receipt: { txHash, amount, token, payer, recipient, chainId, explorerUrl, … }, fulfillment: { reference, simulated: true, label: "SIMULATED fulfillment, no real top-up", … }, order }` + `Payment-Receipt` header. 409 codes: `IDEMPOTENCY_CONFLICT`, `QUOTE_USED`, `PAYMENT_REUSED`, `CREDENTIAL_ORDER_MISMATCH`, `SETTLEMENT_PENDING` (retry same key in ~60s); 410 `QUOTE_EXPIRED`/`ORDER_CLOSED`. Client: `apps/web/lib/mpp/client.ts` `payBill()`. |
| `/api/bills/orders/[id]` | GET | — | the order with its state history |
| `/api/move/quote` | GET | `?side=usd_to_mxn\|mxn_to_usd&amount=<decimal>` | MOVE quote: `{ demo: true, side, source: "v2-vamm"\|"v1-swapdesk", venue, tokenIn/Out, amountIn, amountOut, fee, rate, oracleMid, effectiveSpreadBps, feeBps, sizeImpactBps, minOutSuggested, quotedAt, expiresAt (30s), firm: false, isMock, oracleStale, label }`. Venue reverts → 422 with a readable reason. `?access=partner`: MPP-paid (0.50 xMXN), same quote + EIP-191 `signature`/`signer` + `payment`. v2 read via `quote(bool usdToMxn, uint256 amountIn) → (amountOut, fee, midPrice, impactBps)` at `deployments.v2.vamm`. |
| `/api/mpp/pricing` | GET | — | What each MPP-paid API charges, as the routes charge it (base units of the active xMXN): `{ underwriting: { amount, token, symbol }, "move-quote": { amount, token, symbol }, bills: { amount: null, perMxn, token, symbol } }`. Bills are variable: the challenge amount is the quoted bill (`perMxn` = 1 xMXN per MXN). Shown on `/developers` ("Mercado APIs over HTTP 402": price, live 402 challenge, curl, mppx snippet, live paid Try-it from the API partner demo persona). |
| `/api/invest/rates` | GET | — | Invest returns from the chain (15 s cache): `{ block, blockTimestamp, usd, mxn, lendingPool, stocks }`. `usd` (sOUSD) and `mxn` (sxMXN; null until deployed) share one shape: `{ token, symbol, aprBps, apr, accrual: { assetsAccounted, fundedReserve, checkpointAt, totalSupply, totalAssets, yearSeconds } }`, exact per second: totalAssets(t) = assetsAccounted + min(assetsAccounted×aprBps×(t−checkpointAt)/(1e4×yearSeconds), fundedReserve); balance = shares×totalAssets/totalSupply. `lendingPool` (Crédito lenders, not Invest): `{ pool, aprBps /*realized, annualized; null unless reconciled*/, periodReturnPct /*not annualized*/, feesRealized, avgAssets, totalAssets, since, windowSeconds, feeBpsPerAdvance, reconciled }` from a Supplied/Withdrawn/Borrowed/Repaid replay that must match stats(). `stocks`: null \| `{ token, symbol: "mIDX", label, px8, price, updatedAt, valid, change24hPct, changeSinceFirstPct /*feed < 24h old*/, firstPriceAt }`. |
| `/api/invest/history` | GET | `?address=0x…` | The wallet's own Invest activity, indexed server-side (incremental per wallet, sequential getLogs with retry; the browser sends no eth_getLogs): `{ rows: [{ product: "pesos"\|"dolares"\|"acciones"\|"tbills", label, amount, symbol, txHash, block, logIndex, timestamp }], netPesos, netDolares, netTbillCost, sharesFromEvents, tbillFromEvents, netPesosVault, sxSharesFromEvents, netStocksCost, stocksFromEvents }` (bigints as strings). 400 BAD_ADDRESS. |
| `/api/credit/history` | GET | `?address=0x…` | One borrower's CreditPool activity from the server-side loan-book index (owner api, consumer mobile2's DriverApp; the browser sends no eth_getLogs): `{ rows: [{ kind: "borrow"\|"repay", amount, fee?, remainingDebt?, txHash, logIndex, block, timestamp? }] }`, newest first, 6dp strings. 400 BAD_ADDRESS, 503 protocol unavailable, 502 RPC_ERROR. |

Order states: `CREATED → PAYMENT_VERIFIED → FULFILLED_SIMULATED`, or `FAILED` (with a `paidButUnfulfilled` flag). Retrying with the same idempotency key returns the same order and never fulfills twice. Verified payments that don't settle the order (push-wallet duplicates, late payments) are listed in `order.unappliedPayments` for manual refund, never fulfilled.

Payment token for bills: **xMXN** (the driver holds it after the advance). The MPP recipient is `MERCHANT_ADDRESS`.

## Ownership (who writes where)

| Nick | Owns |
|---|---|
| `contracts` | `packages/contracts/**`, `packages/shared/src/{abi,deployments,chain.ts}`, `apps/web/lib/contracts/**` (typed hooks), `apps/web/app/api/sponsor/**` (fee sponsorship), `apps/web/app/(dashboard)/earn/**` + `apps/web/components/earn/**` (Earn screen) |
| `web` | `apps/web/**` except `apps/web/app/api/**` and `apps/web/lib/server/**`; root `package.json` workspaces |
| `api` | `apps/web/app/(dashboard)/{credit,pay,credito,global,invest,developers}/**`, `apps/web/components/{credit,credito,billpay,global,invest,developers}/**` (screens; except `credito/driver-app/**` and `invest/phone-app.tsx` → mobile2), `apps/web/app/api/**`, `apps/web/lib/server/**`, `apps/web/lib/mpp/**`, `fixtures/**`, `packages/shared/src/{schemas,types}.ts` |
| `qa` | `scripts/**` (e2e demo journey), `apps/web/e2e/**`, `README.md`, `DEMO.md`, `.env.example`, `ACCEPTANCE.md` |
| `review` (Codex reviewer) | `review/**` only. Reviews everything, edits no one else's code |
| `slides` | `deck/**` and the live pitch-deck Artifact https://claude.ai/artifact/7oVmErULm5sdKVQYh1EgCH |
| `mobile` | `apps/web/components/mobile/**`, PhoneFrame, the in-phone screens of Remesas + the Crédito DriverApp, `apps/web/public/brands/**` |
| `mobile2` | in-phone visual layer of the Crédito DriverApp + Invest phone app, `components/mobile/extra/**` |
| `lead` (coordinator) | `INTERFACES.md`, `SPEC.md`, `bin/irc`, merges/unblocks |

To change something you don't own, ask the owner in #mercado. Shared `package.json` / lockfile edits: say so in the channel first and keep the edit small.
