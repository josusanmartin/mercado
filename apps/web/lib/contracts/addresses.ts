import { zeroAddress, type Address } from "viem";
import { ACTIVE_PROTOCOL, activeAddresses, TEMPO_ADDRESSES, TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";

export const CHAIN_ID = TEMPO_MODERATO_CHAIN_ID;

/** Which protocol this build runs (NEXT_PUBLIC_MERCADO_PROTOCOL, default v1). See crew/V2-SWITCH.md. */
export const PROTOCOL = ACTIVE_PROTOCOL;

const A = activeAddresses();

/** Addresses for the ACTIVE protocol only (R-030: never mix v1 and v2). Contracts that don't exist in the active
 *  protocol are the zero address: swapDesk is v1-only, vamm is v2-only. In v2, `vault` is the MultiCollateralVault
 *  (per-collateral API), so the v1 vault hooks in reads.ts apply to v1 only. */
export const ADDR = {
  ousd: A.ousd,
  xmxn: A.xMXN,
  oracle: A.oracle,
  vault: A.vault,
  swapDesk: (A.swapDesk ?? zeroAddress) as Address,
  vamm: (A.vamm ?? zeroAddress) as Address,
  creditPool: A.creditPool,
  factory: A.factory,
  merchant: A.merchant,
  attestationSigner: A.attestationSigner,
  feeToken: TEMPO_ADDRESSES.alphaUSD as Address,
} as const;

/** Collateral list for the active protocol (v1: OUSD only; v2: OUSD, sOUSD demo, tTBILL demo). */
export const COLLATERALS = A.collaterals;

export const TOKEN_DECIMALS = 6;
export const FX_DECIMALS = 8;
export const MIN_MINT_RATIO_BPS = 15_000n;
export const LIQUIDATION_THRESHOLD_BPS = 13_500n;
export const RECOMMENDED_RATIO_BPS = 20_000n;
