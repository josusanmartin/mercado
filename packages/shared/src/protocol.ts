// ONE source of truth for which Mercado protocol the app and servers use (crew/V2-SWITCH.md).
// v1 and v2 have different xMXN tokens, vaults and credit pools, so nothing may mix them: every consumer
// reads addresses from activeAddresses(), never from a deployment key directly.
//   NEXT_PUBLIC_MERCADO_PROTOCOL=v1|v2  (apps/web/.env.local; inlined into the client bundle)
//   MERCADO_PROTOCOL=v1|v2              (scripts/servers outside Next; e.g. PROTOCOL=v2 journeys)
// Default: v1. Only lead flips it. Rollback = set it back to v1.
import type { Address } from "viem";
import { moderatoDeployment } from "./deployments";

export type Protocol = "v1" | "v2";

function readEnv(): string | undefined {
  // literal NEXT_PUBLIC_ access so Next inlines it on the client
  const pub = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_MERCADO_PROTOCOL : undefined;
  if (pub) return pub;
  if (typeof process !== "undefined") return process.env.MERCADO_PROTOCOL ?? process.env.PROTOCOL;
  return undefined;
}

export const ACTIVE_PROTOCOL: Protocol = readEnv() === "v2" ? "v2" : "v1";

export type CollateralInfo = { symbol: string; token: Address; feed?: Address; demo: boolean; label: string };

export type ProtocolAddresses = {
  protocol: Protocol;
  chainId: number;
  ousd: Address;
  xMXN: Address;
  /** MXN per USD mock admin feed (shared by v1 and v2). */
  oracle: Address;
  /** v1: CollateralVault (OUSD only). v2: MultiCollateralVault (per-collateral positions). */
  vault: Address;
  creditPool: Address;
  factory: Address;
  attestationSigner: Address;
  merchant: Address;
  /** v1 only: separately seeded swap desk. */
  swapDesk?: Address;
  /** v2 only: MoveAMM (vault-integrated vAMM). */
  vamm?: Address;
  collaterals: CollateralInfo[];
};

const d = moderatoDeployment as typeof moderatoDeployment & { v2?: Record<string, unknown> };

const V1: ProtocolAddresses = {
  protocol: "v1",
  chainId: d.chainId,
  ousd: d.ousd as Address,
  xMXN: d.xMXN as Address,
  oracle: d.oracle as Address,
  vault: d.vault as Address,
  creditPool: d.creditPool as Address,
  factory: d.factory as Address,
  attestationSigner: d.attestationSigner as Address,
  merchant: d.merchant as Address,
  swapDesk: d.swapDesk as Address,
  collaterals: [{ symbol: "OUSD", token: d.ousd as Address, demo: false, label: "Testnet OUSD (Tempo faucet, no real value)" }],
};

function v2(): ProtocolAddresses {
  const v = d.v2 as unknown as
    | {
        xMXN: Address; factory: Address; vault: Address; vamm: Address; creditPool: Address; fxOracle: Address;
        collaterals: CollateralInfo[]; attestationSigner: Address; merchant: Address;
      }
    | undefined;
  // fail closed: never fall back to v1 when v2 is requested
  if (!v?.vamm || !v.creditPool || !v.xMXN) throw new Error("Mercado v2 is selected but deployments.v2 is missing or incomplete.");
  return {
    protocol: "v2",
    chainId: d.chainId,
    ousd: d.ousd as Address,
    xMXN: v.xMXN,
    oracle: v.fxOracle,
    vault: v.vault,
    creditPool: v.creditPool,
    factory: v.factory,
    attestationSigner: v.attestationSigner,
    merchant: v.merchant,
    vamm: v.vamm,
    collaterals: v.collaterals,
  };
}

/** Addresses for a protocol (default: the active one). Throws if v2 is requested but not deployed. */
export function activeAddresses(protocol: Protocol = ACTIVE_PROTOCOL): ProtocolAddresses {
  return protocol === "v2" ? v2() : V1;
}

export const isV2 = () => ACTIVE_PROTOCOL === "v2";
