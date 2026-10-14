// v2 addresses from packages/shared/src/deployments/42431.json → "v2" (written by contracts' deploy).
// Missing until v2 is deployed; every v2 hook is disabled while undefined.
import type { Address } from "viem";
import { moderatoDeployment } from "@mercado/shared";

const raw = ((moderatoDeployment as Record<string, unknown>).v2 ?? {}) as Record<string, unknown>;
const addr = (...keys: string[]) => {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v)) return v as Address;
  }
  return undefined;
};

export const V2 = {
  xmxn: addr("xMXN", "xmxn"),
  vault: addr("vault", "multiCollateralVault"),
  amm: addr("moveAmm", "moveAMM", "amm"),
  creditPool: addr("creditPool"),
  sOUSD: addr("sOUSD", "sousd"),
  tTBILL: addr("tTBILL", "ttbill"),
  tEQX: addr("tEQX", "teqx"),
};

export const V2_DEPLOYED = !!(V2.vault && V2.amm && V2.xmxn);

/** v1 is the default until lead flips NEXT_PUBLIC_PROTOCOL=v2 (and v2 is actually deployed). */
export const USE_V2 = process.env.NEXT_PUBLIC_PROTOCOL === "v2" && V2_DEPLOYED;
