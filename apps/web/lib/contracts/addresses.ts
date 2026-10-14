import type { Address } from "viem";
import { moderatoDeployment, TEMPO_ADDRESSES, TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";

export const CHAIN_ID = TEMPO_MODERATO_CHAIN_ID;

/** Live Moderato addresses (packages/shared/src/deployments/42431.json). */
export const ADDR = {
  ousd: moderatoDeployment.ousd as Address,
  xmxn: moderatoDeployment.xMXN as Address,
  oracle: moderatoDeployment.oracle as Address,
  vault: moderatoDeployment.vault as Address,
  swapDesk: moderatoDeployment.swapDesk as Address,
  creditPool: moderatoDeployment.creditPool as Address,
  factory: moderatoDeployment.factory as Address,
  merchant: moderatoDeployment.merchant as Address,
  attestationSigner: moderatoDeployment.attestationSigner as Address,
  feeToken: TEMPO_ADDRESSES.alphaUSD as Address,
} as const;

export const TOKEN_DECIMALS = 6;
export const FX_DECIMALS = 8;
export const MIN_MINT_RATIO_BPS = 15_000n;
export const LIQUIDATION_THRESHOLD_BPS = 13_500n;
export const RECOMMENDED_RATIO_BPS = 20_000n;
