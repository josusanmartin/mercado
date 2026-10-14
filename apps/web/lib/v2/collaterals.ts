"use client";
// Collateral catalogue for Create (SPEC v0.2: institutions mint against yield-bearing collateral).
// v1 has one live collateral (testnet OUSD in CollateralVault). The v2 MultiCollateralVault entries are
// listed as "coming" until contracts publishes V2-DESIGN.md and v2 addresses; their params are read
// from chain then, never hard-coded here.
import type { Address } from "viem";
import { ADDR, LIQUIDATION_THRESHOLD_BPS, MIN_MINT_RATIO_BPS } from "@/lib/contracts";

export type Collateral = {
  id: "ousd" | "sousd" | "ttbill";
  symbol: string;
  name: string;
  address?: Address;
  /** Min collateral ratio to mint, bps (LTV = 1 / ratio). */
  minRatioBps?: bigint;
  liquidationBps?: bigint;
  /** Where the yield comes from, in words. Never a promised rate. */
  yieldSource: string;
  demo: boolean;
  available: boolean;
  label: string;
};

/** "v1" (default) until lead flips NEXT_PUBLIC_PROTOCOL=v2 once v2 passes tests and the journey. */
export const PROTOCOL = process.env.NEXT_PUBLIC_PROTOCOL === "v2" ? "v2" : "v1";

export function useCollaterals(): Collateral[] {
  return [
    {
      id: "ousd",
      symbol: "OUSD",
      name: "Testnet OUSD",
      address: ADDR.ousd,
      minRatioBps: MIN_MINT_RATIO_BPS,
      liquidationBps: LIQUIDATION_THRESHOLD_BPS,
      yieldSource: "None. Plain testnet OUSD from the Tempo faucet",
      demo: false,
      available: true,
      label: "Testnet OUSD (Tempo faucet, no real value)",
    },
    {
      id: "sousd",
      symbol: "sOUSD",
      name: "Staked OUSD",
      yieldSource: "Share price grows inside the token (demo, admin-set)",
      demo: true,
      available: false,
      label: "Demo staked OUSD, not a real staking product",
    },
    {
      id: "ttbill",
      symbol: "tTBILL",
      name: "Tokenized T-bill",
      yieldSource: "Price accrues like a T-bill (demo, admin-set price)",
      demo: true,
      available: false,
      label: "Demo RWA, no real T-bill backing",
    },
  ];
}
