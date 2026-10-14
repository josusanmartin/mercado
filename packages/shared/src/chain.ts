// Tempo Moderato testnet — verified against the live RPC on 2026-10-14.
// Tempo has no native gas token: fees are paid in a USD-denominated TIP-20
// (pathUSD / AlphaUSD / … via the FeeManager at 0xfeec…). Wallets may show a
// placeholder native balance; ignore it.
import type { Address, Hash } from "viem";
import { tempoModerato as viemTempoModerato } from "viem/chains";

export const TEMPO_MODERATO_CHAIN_ID = 42431 as const;
export const TEMPO_RPC_URL = "https://rpc.moderato.tempo.xyz";
export const TEMPO_WS_URL = "wss://rpc.moderato.tempo.xyz";
export const TEMPO_EXPLORER_URL = "https://explore.testnet.tempo.xyz";

/** Tempo precompiles / predeployed TIP-20s on Moderato. */
export const TEMPO_ADDRESSES = {
  tip20Factory: "0x20Fc000000000000000000000000000000000000",
  feeManager: "0xfeEC000000000000000000000000000000000000",
  pathUSD: "0x20C0000000000000000000000000000000000000",
  alphaUSD: "0x20C0000000000000000000000000000000000001",
  betaUSD: "0x20C0000000000000000000000000000000000002",
  thetaUSD: "0x20C0000000000000000000000000000000000003",
  /** Tempo faucet testnet OpenUSD: our vault collateral. Label "Testnet OUSD (Tempo faucet, no real value)". */
  ousd: "0x20c0000000000000000000006a37DA5C996874BE",
} as const satisfies Record<string, Address>;

/** Default USD TIP-20 used to pay fees (every faucet-funded account holds it). */
export const FEE_TOKEN: Address = TEMPO_ADDRESSES.alphaUSD;

/** viem's built-in Tempo Moderato chain (Tempo tx serializers/formatters) with our default fee token. */
export const tempoModerato = viemTempoModerato.extend({ feeToken: FEE_TOKEN });

export const explorerTx = (hash: Hash | string) => `${TEMPO_EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (addr: Address | string) => `${TEMPO_EXPLORER_URL}/address/${addr}`;
