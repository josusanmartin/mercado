#!/usr/bin/env bash
# Admin helper for the MOCK FX oracle (testnet only). Run from anywhere.
#   oracle.sh price            show raw feed (peek) + whether price() is valid
#   oracle.sh set 18.75        setPrice (sanity band 5–50, max 20% jump)
#   oracle.sh force 13.00      forceSet (stress mode: skips the jump check, band still enforced)
#   oracle.sh refresh          re-push the current price (the feed goes stale after maxAge = 1h)
#   oracle.sh keeper [secs]    refresh forever (default every 1200s) so the demo never sees a stale feed
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source "$here/../../.env.local"; set +a
RPC="${TEMPO_RPC_URL:-https://rpc.moderato.tempo.xyz}"
ORACLE="$(jq -r .oracle "$here/deployments/42431.json")"
to8() { python3 -c "import sys,decimal; print(int(decimal.Decimal(sys.argv[1])*10**8))" "$1"; }
send() { cast send "$ORACLE" "$@" --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$RPC" --json | jq -r '"tx \(.transactionHash) status \(.status)"'; }
case "${1:-price}" in
  price) cast call "$ORACLE" "peek()(uint256,uint256,bool)" --rpc-url "$RPC" ;;
  set) send "setPrice(uint256)" "$(to8 "$2")" ;;
  force) send "forceSet(uint256)" "$(to8 "$2")" ;;
  refresh) send "forceSet(uint256)" "$(cast call "$ORACLE" "mxnPerUsd()(uint256)" --rpc-url "$RPC" | cut -d' ' -f1)" ;;
  keeper) while true; do date -u +%FT%TZ; "$0" refresh || true; sleep "${2:-1200}"; done ;;
  *) echo "usage: $0 price|set <px>|force <px>|refresh|keeper [secs]"; exit 1 ;;
esac
