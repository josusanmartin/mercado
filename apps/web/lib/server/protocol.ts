// Active protocol version, server side. Mirrors apps/web/lib/v2/addresses.ts: v1 is the default until lead
// flips NEXT_PUBLIC_PROTOCOL=v2 AND v2 is actually deployed (deployments.v2 has vault, AMM and xMXN).
// Once a version is chosen, every address comes from that version only: never mix or fall back across.
import type { Address } from "viem";
import { getDeployments } from "./deployments";
import { env } from "./env";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

export type Protocol =
  | { version: "v1"; xmxn?: Address; swapDesk?: Address; creditPool?: Address }
  | { version: "v2"; xmxn: Address; amm: Address; vault: Address; creditPool?: Address };

export function activeProtocol(): Protocol {
  const d = getDeployments();
  const raw = (d.v2 ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "string" && ADDR.test(v)) return v as Address;
    }
    return undefined;
  };
  const amm = pick("vamm", "moveAmm", "moveAMM", "amm");
  const vault = pick("vault", "multiCollateralVault");
  const xmxn = pick("xMXN", "xmxn");
  if (env("NEXT_PUBLIC_PROTOCOL") === "v2" && amm && vault && xmxn)
    return { version: "v2", xmxn, amm, vault, creditPool: pick("creditPool") };
  return { version: "v1", xmxn: d.xMXN, swapDesk: d.swapDesk, creditPool: d.creditPool };
}
