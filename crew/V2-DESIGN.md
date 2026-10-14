# Mercado v2 contracts: design (owner: `contracts`)

Implements SPEC v0.2: **Create** (institutions mint xMXN against yield-bearing collateral and RWAs) and **Move** (the vault is also the exchange: an oracle-anchored vAMM where OUSD in mints xMXN and xMXN out burns it). **Lend** and **Spend** carry over. Testnet only: every yield source, RWA and price below is a **demo**, admin-controlled and labeled.

v2 deploys **alongside** v1. Nothing in v1 changes or stops working. Its addresses go under a `v2` key in `packages/shared/src/deployments/42431.json`. Units are unchanged: token amounts are 6dp, FX and prices are 8dp, ratios and fees are bps.

---

## 0. One picture

```
                       ┌──────────── xMXN v2 (TIP-20, 6dp) ────────────┐
                       │   ISSUER_ROLE: MultiCollateralVault + MoveAMM │  (granted once by MercadoFactoryV2, then locked)
                       └───────────────▲──────────────────▲────────────┘
                     mint/burn (debt)  │                  │ mint/burn (swaps)
 CREATE ──────────────────────────────┤                  ├────────────────────────────── MOVE
 MultiCollateralVault (CDP)            │                  │      MoveAMM (vAMM / PSM)
   per-collateral positions:           │                  │        reserve: OUSD only (its own balance)
   OUSD · sOUSD (demo 4626) ·          │                  │        liability: xMXN it issued, net of burns
   tTBILL (demo RWA) · tEQX (demo)     │                  │        price: FX mid × depth curve ± fee
   collateral never leaves except to   │                  │        never touches CDP collateral
   its owner or a liquidator           │                  │
                       FXOracleAdapter (v1, shared mock feed: MXN per USD)
                       + per-collateral USD price feeds
 LEND: CreditPool v2 (same contract, new xMXN)       SPEND: MPP bills settle in xMXN v2 (api switches token)
```

**Why two contracts if "the vault is the exchange"?** It's one *system* (one token, one oracle, one UI module) with **two balance sheets**. CDP collateral and the swap reserve live in different contracts, so a bug or a run on one can never spend the other. That's the property the v1 review cared about most. The UI presents both as "the Mercado vault".

---

## 1. Tokens

| Token | What | Standard | Admin powers (testnet) | Label |
|---|---|---|---|---|
| **xMXN v2** | synthetic peso | TIP-20 via `TIP20Factory`, currency `MXN`, quote pathUSD | factory holds DEFAULT_ADMIN with no grant function. Issuers are the vault + AMM, fixed forever | "Mercado Synthetic Peso v2 (testnet)" |
| **OUSD** | Tempo faucet OpenUSD | existing TIP-20 | none (Tempo's) | "Testnet OUSD (Tempo faucet, no real value)" |
| **sOUSD** | demo *staked OUSD*: ERC-4626 over OUSD with mock yield | OZ `ERC4626` (plain EVM ERC-20, 6dp, `_decimalsOffset()=0`) | owner sets `aprBps` ≤ 2,000 and funds the yield reserve | "Demo staked OUSD (mock yield, testnet)" |
| **tTBILL** | demo tokenized T-bill | OZ ERC-20, 6dp, `faucet()` capped mint | owner mints; price is an admin feed | "Demo tokenized T-bill (testnet, not a security)" |
| **tEQX** *(optional)* | demo equity index | same as tTBILL | same | "Demo equity index (testnet, not a security)" |

### sOUSD mock yield: fully accounted (R-027 fix)
- The token balance is **never read**. `totalAssets = assetsAccounted + min(assetsAccounted × apr × Δt / year, fundedReserve)`.
- Yield is funded only through owner-only `fundYield(amount)`, which **checkpoints before adding funds**. Accrual that wasn't funded while it accrued is forfeited, so a late top-up can't back-pay a "dry year" in one block. Direct transfers are ignored forever.
- The share price can only rise, at ≤ `aprBps` (capped at 20% APR), and never beyond funded OUSD. OZ virtual-share math covers the first-depositor inflation attack. Tested: donation, first depositor, dry-year late funding, reserve exhaustion and stale feeds.

---

## 2. Price feeds

All feeds expose the v1 shape `price() → (uint256 px8, uint256 updatedAt)` and revert when invalid. The vault never reads a raw balance-derived price.

| Feed | Contract | Value | Staleness |
|---|---|---|---|
| MXN per USD | **v1 `FXOracleAdapter`** (reused, mock admin feed) | ~20.00 | 1h (keeper) |
| OUSD → USD | `FixedPriceFeed(1.00)` | assumed $1 (testnet; labeled) | never |
| sOUSD → USD | `ERC4626PriceFeed(sOUSD, OUSD feed)` = `convertToAssets(1e6) × OUSD price` | 1.00 → grows with mock yield | inherits OUSD feed |
| tTBILL → USD | `FXOracleAdapter` instance reconfigured (band 50–150, max jump 2%, maxAge 24h) | ~100.00 | 24h |
| tEQX → USD | same, band 10–1,000, jump 10%, maxAge 24h | ~100.00 | 24h |

Collateral value in xMXN (6dp) = `amount × usdPx8 × mxnPerUsd8 × 1e6 / (10^dec × 1e16)` (two `mulDiv`s, rounded down).

---

## 3. CREATE: `MultiCollateralVault`

Per-**(user, collateral)** positions, like Maker vaults per ilk. Each is independent: one collateral's position can't be liquidated because of another's.

```solidity
struct CollateralParams {
  IPriceFeed feed;            // USD per 1 unit, 8dp
  uint16 mintRatioBps;        // min ratio to mint/withdraw (1/LTV)
  uint16 liqRatioBps;         // liquidatable below this
  uint16 liqPenaltyBps;       // liquidator bonus, paid from that position's collateral
  uint128 debtCeiling;        // max xMXN outstanding against this collateral
  bool mintPaused;            // owner circuit breaker: blocks mint, never repay/withdraw/liquidate
}
```

| Collateral | mint ratio (LTV) | liq ratio | penalty | debt ceiling | why |
|---|---|---|---|---|---|
| OUSD | 150% (66%) | 135% | 10% | 2,000,000 xMXN | v1 parity |
| sOUSD | 150% (66%) | 135% | 10% | 2,000,000 | same risk as OUSD + share-price risk (bounded, see §1) |
| tTBILL | 200% (50%) | 170% | 12% | 1,000,000 | RWA: price/liquidity/legal haircut |
| tEQX | 300% (33%) | 220% | 15% | 250,000 | equity volatility |

Invariants: `liqRatio ≥ 10_000 + penalty + 100` (so liquidation stays solvent at the threshold) and `mintRatio > liqRatio`. The owner can only **add** collaterals, **lower** debt ceilings or pause minting freely; raising risk params requires `mintRatio ≥ liqRatio + 1_000` and is bounded. (Production: a timelock.)

```solidity
function depositCollateral(address token, uint256 amount) external;
function mint(address token, uint256 xmxn) external;            // ratio ≥ mintRatio, ceiling, valid FX + feed
function repayAndBurn(address token, uint256 xmxn) external;    // never needs an oracle
function withdrawCollateral(address token, uint256 amount) external; // ratio ≥ mintRatio after (or debt 0)
function liquidate(address user, address token, uint256 debtToCover) external; // ratio < liqRatio
function getPosition(address user, address token) external view returns (uint256 collateral, uint256 debt);
function collateralRatio(address user, address token) external view returns (uint256 bps);
function maxMintable(address user, address token) external view returns (uint256);
function maxWithdrawable(address user, address token) external view returns (uint256); // exact (R-007 rule)
function isLiquidatable(address user, address token) external view returns (bool);
function collaterals() external view returns (address[] memory);
function params(address token) external view returns (CollateralParams memory);
function totals(address token) external view returns (uint256 collateral, uint256 debt);
events: Deposited/Minted/Repaid/Withdrawn/Liquidated(user, token, …)
```
Same rounding rules as v1: value and ratio round down, required collateral rounds up.

**Yield to the minter, not the protocol:** an institution that deposits sOUSD keeps the share-price growth. Its collateral ratio rises over time, and it can withdraw the excess (`maxWithdrawable` grows). The vault runs no strategy.

---

## 4. MOVE: `MoveAMM` (vault-integrated vAMM / PSM)

### Exact solvency statement (review's precheck)
- `R` = OUSD reserve, segregated in MoveAMM and tracked internally. `L` = net AMM-issued xMXN (`+out` on mint, `−in` on redeem).
- **Redemption bound:** `amountIn ≤ L`. Any xMXN, CDP-minted included, may redeem only up to the AMM's own liability, so the equity buffer is never paid out against CDP debt (lead's fix). Supply identity: `xMXN.totalSupply = Σ CDP debt + L`.
- **Pre-trade, at fresh FX `m`:** `c = R·m/L`. A mint requires `(R+in)·m / (L+out) ≥ 1`. A redemption pays `out ≤ (in/m)·min(1, c)` and `out ≤ R`, so `R_after·m / L_after ≥ min(c, …)`: coverage never falls for those who stay.
- Example (review's): 1,000 OUSD backing 19,900 xMXN with no equity is 90.5% at m = 18. Minting halts and redemptions haircut to 90.5% of oracle. With the 2,500 equity seed, the same book is 316% covered at 18.

### Pricing
Oracle mid `m` = MXN per USD (8dp). Virtual depth `D` (USD, 6dp; default 250,000 USD) is a constant-product curve centred on the oracle, so impact grows with size:

```
OUSD → xMXN (mint):  usdIn = amountIn
   gross = usdIn × m × D / (D + usdIn)            // CPMM-style size impact around the mid
   out   = gross × (1 − feeBps)                   // fee stays in the reserve as buffer
xMXN → OUSD (burn):  usdGross = amountIn / m
   gross = usdGross × D / (D + usdGross)
   out   = gross × (1 − feeBps − stressBps) × min(1, coverage)   // NAV rule, see below
```
At D = 250k: 100 USD → 0.04% impact, 1,000 → 0.4%, 10,000 → 3.8%. Default `feeBps = 20`. `quote()` returns `(amountOut, fee, midPrice, impactBps)` (fee in output units, mid 8dp) so the UI and api can show the oracle mid, spread and size impact separately. It reverts with custom errors on stale oracle, size, cap or solvency limits.

### Balance sheet and solvency (the important part)
- **Reserve `R`**: OUSD held by the AMM = mint inflows + fees + **equity buffer** − redemptions. It's the AMM's own balance, tracked internally (donations are ignored).
- **Liability `L`**: xMXN the AMM has issued and not yet bought back. `+out` on mint, `−amountIn` on burn, floored at 0 (CDP-minted xMXN may also redeem here, which can only shrink `R` and `L` together).
- **Coverage** `c = R × m / L` (bps; ∞ if `L = 0`).

**Peso appreciation** (m falls) shrinks `R × m` while `L` is fixed in pesos. Example: 1,000 OUSD minted at 20 → L = 20,000 xMXN. With a 250 OUSD buffer, R = 1,250 and c = 125% at 20. That reaches 100% at m = 16 (a 20% stronger peso) and 80% at m = 12.8. The testnet seed uses 2,500 OUSD of equity against ~19,950 xMXN (≈350% at 20; still >100% at m = 5.7, the bottom of the oracle band). On-chain rules:

1. **Equity buffer.** A backstop (the DEPLOYER on testnet; an institution in prod) seeds OUSD as `equity`, which adds to `R` but not `L`. Fees also accrue to `R`. Testnet seed: **2,500 OUSD**. The owner can withdraw equity only while `c ≥ targetCoverage` (120%) after the withdrawal.
2. **Mint circuit breaker.** A mint reverts if coverage after the mint would be < `minMintCoverage` (100%). New users are never sold xMXN that's already under-backed. Create (CDP) keeps working.
3. **NAV redemption (haircut, not freeze).** When `c < 100%`, every redemption is paid at `min(oracle, NAV)`: out × c/10_000. That's pro-rata, so there's no first-mover advantage and the reserve can't be over-drawn. `stressBps` (+30 bps below 110% coverage) widens the spread as coverage falls. Recapitalization is voluntary: anyone may `addEquity`, and fees accrue. There is no forced backstop or socialization on testnet.
4. **Redemption limit = strict leaky bucket** (lead decision, R-028). Capacity C = 25% of `R`, refilling continuously at C per 24h, with **no floor** and no fixed window, so there's no boundary doubling. C shrinks with `R`, so a run slows itself down. Plus a max per swap (10,000 USD-eq) and an overall `maxLiability` (2,000,000 xMXN).
5. **Oracle hygiene.** Any invalid FX price (stale/paused/out of band) reverts quotes and swaps both ways; `quote()` also reverts while paused (R-029). The fee (20 bps) plus the oracle's max-jump bound limit stale-price arbitrage; a production feed should set the fee ≥ the feed's deviation threshold.
6. **Separation.** The AMM never holds or reads CDP collateral. The vault never reads the AMM reserve. Each is a separate contract with its own balance.

```solidity
function quote(bool usdToMxn, uint256 amountIn) external view returns (uint256 amountOut, uint256 fee, uint256 midPrice, uint256 impactBps);
function swapOusdForXmxn(uint256 amountIn, uint256 minOut, address to) external returns (uint256 out); // mints
function swapXmxnForOusd(uint256 amountIn, uint256 minOut, address to) external returns (uint256 out); // burns
function state() external view returns (uint256 reserve, uint256 liability, uint256 equity, uint256 coverageBps, uint256 redeemedToday, uint256 redeemCap);
function addEquity(uint256 ousd) external;                // anyone (a gift to solvency); tracked as equity
// owner: withdrawEquity(amount, to) [coverage ≥ target after], setParams(feeBps, depthUsd, maxSwapUsd, redeemCapBps, maxLiability), pause()
events: Swapped(user, to, usdToMxn, amountIn, out, fee, impactBps, mid), EquityAdded, EquityWithdrawn, Paused
```
The `to` param serves remittances: a US sender swaps OUSD and delivers xMXN to the recipient in **one tx**. A `…WithMemo` variant is possible later via TIP-20 `transferWithMemo` from the AMM.

---

## 5. What stays from v1 / what changes

| v1 | v2 |
|---|---|
| `CollateralVault` (OUSD only) | stays live. v2 `MultiCollateralVault` alongside |
| `SwapDesk` (separately seeded) | stays on v1 as a **fallback**. v2 uses `MoveAMM` |
| `CreditPool` | **same code**, new instance over xMXN v2, supplied by LENDER |
| `FXOracleAdapter` | **reused** as the MXN/USD feed (one source of truth; StressDemo hits both) |
| `LocalStableFactory` | `MercadoFactoryV2`: creates xMXN v2, grants ISSUER to vault **and** AMM once, then locks |
| MPP bills (xMXN v1) | api switches the charge token to xMXN v2 when lead flips |
| `/api/sponsor` allowlist | adds the v2 targets/selectors |

Switch-over: lead flips the app to `deployments.v2` once v2 passes tests and the e2e journey. v1 addresses remain valid for the record.

---

## 5b. Deployments shape (`packages/shared/src/deployments/42431.json`)
```json
{ …v1 keys unchanged…,
  "v2": { "xMXN": "0x…", "factory": "0x…", "vault": "0x…", "vamm": "0x…", "creditPool": "0x…", "fxOracle": "0x… (= v1 oracle)",
          "collaterals": [ { "symbol": "OUSD", "token": "0x…", "feed": "0x…", "demo": false },
                           { "symbol": "sOUSD", "token": "0x…", "feed": "0x…", "demo": true },
                           { "symbol": "tTBILL", "token": "0x…", "feed": "0x…", "demo": true } ],
          "deployedAt": "ISO", "txs": { … } } }
```
ABIs: `multiCollateralVaultAbi`, `moveAmmAbi`, `stakedOusdAbi`, `demoRwaAbi`, `priceFeedAbi`, `mercadoFactoryV2Abi` (+ `creditPoolAbi` unchanged).

## 6. Tests (Foundry, real TIP-20 precompiles)
- `VaultV2.t.sol`: per-collateral ratios, haircuts, ceilings, pause-mint-but-not-repay, independent positions, exact `maxWithdrawable`, liquidation per collateral, RWA price drop → liquidation.
- `StakedOUSD.t.sol`: accrual math, donation doesn't move share price, first-depositor inflation attack fails, yield stops at reserve, vault valuation follows the share price.
- `MoveAMM.t.sol`: mint/burn math, size impact, minOut, per-swap and 24h caps, peso-appreciation sweep: coverage, mint breaker at <100%, NAV redemptions pro-rata and the reserve never over-drawn, equity withdrawal gate, AMM can't reach vault collateral, CDP-minted xMXN redeeming via the AMM, invalid oracle reverts.
- Fuzz/invariant: `xMXN.totalSupply == Σ vault debt + AMM liability (+ CDP-minted xMXN burned in the AMM accounted)`. Reserve ≥ 0 always. Users can't extract more OUSD than the reserve.

## 7. Decisions (resolved)
1. Reuse the v1 FX oracle so the stress demo moves both [yes]. 2. D = 250k USD virtual depth and fee 20 bps [yes; tunable]. 3. Equity buffer seeded by DEPLOYER [2,500 OUSD, lead decision]. 4. tEQX in this pass [only if time; the params are in place].
