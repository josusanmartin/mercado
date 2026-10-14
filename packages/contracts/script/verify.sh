#!/usr/bin/env bash
# Verify all deployed Mercado contracts on Tempo's Sourcify-compatible verifier (contracts.tempo.xyz).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"; cd "$here"
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source ../../.env.local; set +a
J=deployments/42431.json; g() { jq -r ".$1" "$J"; }
V=(--chain 42431 --verifier sourcify --verifier-url https://contracts.tempo.xyz --rpc-url https://rpc.moderato.tempo.xyz --watch)
v() { echo "== $2"; forge verify-contract "$1" "$2" "${V[@]}" --constructor-args "$3" | grep -E "Status|already" || true; }
v "$(g oracle)" src/FXOracleAdapter.sol:FXOracleAdapter "$(cast abi-encode 'f(address,uint256)' "$DEPLOYER_ADDRESS" 2000000000)"
v "$(g factory)" src/LocalStableFactory.sol:LocalStableFactory "$(cast abi-encode 'f(address)' "$DEPLOYER_ADDRESS")"
v "$(g vault)" src/CollateralVault.sol:CollateralVault "$(cast abi-encode 'f(address,address,address)' "$(g ousd)" "$(g xMXN)" "$(g oracle)")"
v "$(g swapDesk)" src/SwapDesk.sol:SwapDesk "$(cast abi-encode 'f(address,address,address,address)' "$DEPLOYER_ADDRESS" "$(g ousd)" "$(g xMXN)" "$(g oracle)")"
v "$(g creditPool)" src/CreditPool.sol:CreditPool "$(cast abi-encode 'f(address,address,address)' "$DEPLOYER_ADDRESS" "$(g xMXN)" "$ATTESTATION_SIGNER_ADDRESS")"
