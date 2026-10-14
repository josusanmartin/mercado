#!/usr/bin/env bash
# Verify every v2 contract on Tempo's Sourcify-compatible verifier (contracts.tempo.xyz). Prints one line per contract.
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"; cd "$here"
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source ../../.env.local; set +a
J=deployments/42431.v2.json; g() { jq -r ".$1" "$J"; }
O=$DEPLOYER_ADDRESS
V=(--chain 42431 --verifier sourcify --verifier-url https://contracts.tempo.xyz --rpc-url https://rpc.moderato.tempo.xyz --watch)
v() { # name address contract args
  local out; out=$(forge verify-contract "$2" "$3" "${V[@]}" --constructor-args "$4" 2>&1)
  local st; st=$(curl -s "https://contracts.tempo.xyz/v2/contract/42431/$2" | jq -r '"\(.match)/\(.runtimeMatch)"' 2>/dev/null)
  echo "$1 $2 $st"
  [[ "$st" == exact_match/exact_match ]] || echo "$out" | grep -iE "error|status" | head -3 >&2
}
TNAME="Demo tokenized T-bill (testnet, not a security)"
v factory      "$(g factory)"      src/v2/MercadoFactoryV2.sol:MercadoFactoryV2       "$(cast abi-encode 'f(address)' $O)"
v vault        "$(g vault)"        src/v2/MultiCollateralVault.sol:MultiCollateralVault "$(cast abi-encode 'f(address,address,address)' $O "$(g xMXN)" "$(g fxOracle)")"
v vamm         "$(g vamm)"         src/v2/MoveAMM.sol:MoveAMM                         "$(cast abi-encode 'f(address,address,address,address)' $O "$(g ousd)" "$(g xMXN)" "$(g fxOracle)")"
v creditPoolV2 "$(g creditPool)"   src/CreditPool.sol:CreditPool                      "$(cast abi-encode 'f(address,address,address)' $O "$(g xMXN)" $ATTESTATION_SIGNER_ADDRESS)"
v ousdFeed     "$(g ousdFeed)"     src/v2/FixedPriceFeed.sol:FixedPriceFeed           "$(cast abi-encode 'f(uint256,string)' 100000000 'Testnet OUSD assumed at $1.00')"
v sOUSD        "$(g sOUSD)"        src/v2/StakedOUSD.sol:StakedOUSD                   "$(cast abi-encode 'f(address,address,uint256)' "$(g ousd)" $O 500)"
v sOUSDFeed    "$(g sOUSDFeed)"    src/v2/ERC4626PriceFeed.sol:ERC4626PriceFeed       "$(cast abi-encode 'f(address,address)' "$(g sOUSD)" "$(g ousdFeed)")"
v tTBILL       "$(g tTBILL)"       src/v2/DemoRWA.sol:DemoRWA                         "$(cast abi-encode 'f(string,string,address,uint256)' "$TNAME" tTBILL $O 0)"
v tTBILLLegacy "$(g tTBILLLegacy)" src/v2/DemoRWA.sol:DemoRWA                         "$(cast abi-encode 'f(string,string,address,uint256)' "$TNAME" tTBILL $O 1000000000)"
v tTBILLFeed   "$(g tTBILLFeed)"   src/v2/AdminPriceFeed.sol:AdminPriceFeed           "$(cast abi-encode 'f(address,string,uint256,uint256,uint256,uint256,uint256)' $O 'tTBILL demo price (admin)' 10000000000 86400 5000000000 15000000000 200)"
v investDesk   "$(g investDesk)"   src/v2/InvestDesk.sol:InvestDesk                   "$(cast abi-encode 'f(address,address,address,address,address,address)' $O "$(g ousd)" "$(g tTBILL)" "$(g xMXN)" "$(g tTBILLFeed)" "$(g vamm)")"
v card         "$(g card)"         src/v2/MercadoCard.sol:MercadoCard                 "$(cast abi-encode 'f(address,address)' $O "$(g xMXN)")"
