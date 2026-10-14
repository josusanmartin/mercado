// Tempo Moderato testnet — verified against the live RPC on 2026-10-14.
// Tempo has no native gas token: fees are paid in a USD-denominated TIP-20
// (pathUSD / AlphaUSD / … via the FeeManager at 0xfeec…). Wallets may show a
// placeholder native balance; ignore it.
import { defineChain, type Address, type Hash } from "viem";

export const TEMPO_MODERATO_CHAIN_ID = 42431 as const;
export const TEMPO_RPC_URL = "https://rpc.moderato.tempo.xyz";
export const TEMPO_WS_URL = "wss://rpc.moderato.tempo.xyz";
export const TEMPO_EXPLORER_URL = "https://explore.testnet.tempo.xyz";

export const tempoModerato = defineChain({
  id: TEMPO_MODERATO_CHAIN_ID,
  name: "Tempo Moderato Testnet",
  // Placeholder: Tempo has no native coin. Fees come out of a USD TIP-20 (6dp).
  nativeCurrency: { name: "USD", symbol: "USD", decimals: 18 },
  rpcUrls: { default: { http: [TEMPO_RPC_URL], webSocket: [TEMPO_WS_URL] } },
  blockExplorers: { default: { name: "Tempo Explorer", url: TEMPO_EXPLORER_URL } },
  testnet: true,
});

/** Tempo precompiles / predeployed TIP-20s on Moderato. */
export const TEMPO_ADDRESSES = {
  tip20Factory: "0x20Fc000000000000000000000000000000000000",
  feeManager: "0xfeEC000000000000000000000000000000000000",
  pathUSD: "0x20C0000000000000000000000000000000000000",
  alphaUSD: "0x20C0000000000000000000000000000000000001",
  betaUSD: "0x20C0000000000000000000000000000000000002",
  thetaUSD: "0x20C0000000000000000000000000000000000003",
  /** Faucet-issued testnet "OpenUSD" — NOT our collateral token (we use dOUSD). */
  faucetOUSD: "0x20c0000000000000000000006a37DA5C996874BE",
} as const satisfies Record<string, Address>;

/** Default USD TIP-20 used to pay fees (every faucet-funded account holds it). */
export const FEE_TOKEN: Address = TEMPO_ADDRESSES.alphaUSD;

export const explorerTx = (hash: Hash | string) => `${TEMPO_EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (addr: Address | string) => `${TEMPO_EXPLORER_URL}/address/${addr}`;
