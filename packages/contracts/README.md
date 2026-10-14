# @mercado/contracts (Foundry)

Testnet prototype contracts on **Tempo Moderato (42431)**. Not audited, and not a real credit product or a redeemable stablecoin.

| Contract | What it does |
|---|---|
| `FXOracleAdapter` | **Mock admin feed** for MXN per USD (8dp). Enforces a sanity band of 5–50, a 20% max jump (`forceSet` skips the jump check for stress demos), a 1h maxAge and pause. `isMock() == true`. |
| `LocalStableFactory` | Creates xMXN through Tempo's `TIP20Factory` precompile, deploys its vault, and grants the vault `ISSUER_ROLE`. It keeps token admin but exposes no role-granting function. |
| `CollateralVault` | OUSD-collateralized CDP that mints xMXN. Mint/withdraw require ≥150%; liquidation applies below 135% with a 10% bonus. No admin. |
| `SwapDesk` | Separately seeded OUSD⇄xMXN desk at the oracle price ± 50 bps. Finite reserves, `minOut`, 10k per swap, 2k OUSD-eq per address per 24h, pausable. |
| `CreditPool` | Lender-funded xMXN advances against EIP-712 eligibility attestations. Nonce replay protection, per-user and utilization caps, 2% flat fee. |

## Setup

Use **`~/.foundry/bin/forge` (Foundry ≥ 1.8)**. The `forge` in `~/.local/bin` is an unrelated tool.

```bash
cd packages/contracts
forge install --no-git foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.4.0 tempoxyz/tempo-std
forge test
```

`foundry.toml` sets `network = "tempo"`, so **all tests run locally against Tempo's real TIP-20 / TIP20Factory precompiles**, with no mocks and no fork. The collateral in tests is a locally created USD TIP-20 that stands in for the faucet OUSD.

| Test | Covers (SPEC §6) |
|---|---|
| `Vault.t.sol` | Only the vault can mint/burn, the mint ratio, withdrawals can't go unhealthy, repay burns supply, exact `maxWithdrawable` |
| `FXStress.t.sol` | Stale/zero/out-of-band/jump/paused prices revert, and peso appreciation makes liquidation enforceable |
| `Swap.t.sol` | The desk can't touch vault collateral or drain beyond reserves; `minOut`, caps, pause, stale oracle |
| `LoanAttestation.t.sol` | Bad signer/borrower/domain/chain, expiry, replay, attested max, per-user cap, utilization, liquidity; lenders can't withdraw lent funds |

## Deploy / ops (Moderato)

```bash
set -a; source ../../.env.local; set +a
forge script script/Deploy.s.sol --sig "core()"   --rpc-url moderato --broadcast --slow  # oracle, factory, xMXN, vault
forge script script/Deploy.s.sol --sig "smoke()"  --rpc-url moderato --broadcast --slow  # deposit→mint→repay→withdraw
forge script script/Deploy.s.sol --sig "swap()"   --rpc-url moderato --broadcast --slow  # desk seeded by LP's own position
forge script script/Deploy.s.sol --sig "credit()" --rpc-url moderato --broadcast --slow  # pool supplied by LENDER
node script/export.mjs   # → packages/shared/src/{abi,deployments}

forge script script/ReseedDesk.s.sol  --rpc-url moderato --broadcast --slow   # top desk back up (LP inventory)
forge script script/StressDemo.s.sol  --rpc-url moderato --broadcast --slow   # FX 20→14, liquidate, restore
script/oracle.sh price | set 19.5 | force 13                                  # mock oracle admin (manual)
node script/fx-relay.mjs [--loop 600]                                       # relay a REAL USD/MXN rate (Coinbase intraday → open.er-api daily)
script/verify.sh                                                            # verify sources on contracts.tempo.xyz (Sourcify): all 5 exact_match
node script/sponsor-check.mjs                                               # live /api/sponsor check (needs :3100)
```

The oracle goes stale after 1h. Keep `node script/fx-relay.mjs --loop 600` running: it relays a real public USD/MXN rate (admin-relayed, not a decentralized oracle) and writes cache/fx-relay.json for the /api/fx label.
