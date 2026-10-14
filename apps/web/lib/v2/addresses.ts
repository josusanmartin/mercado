// v2 addresses come only from the shared switch (packages/shared/src/protocol.ts, crew/V2-SWITCH.md):
// ACTIVE_PROTOCOL from NEXT_PUBLIC_MERCADO_PROTOCOL (default v1), addresses from activeAddresses().
// While v1 is active every v2 hook is disabled.
import type { Address } from "viem";
import { ACTIVE_PROTOCOL, activeAddresses, type CollateralInfo } from "@mercado/shared";

export const USE_V2 = ACTIVE_PROTOCOL === "v2";

const a = USE_V2 ? activeAddresses("v2") : undefined;

export const V2: { xmxn?: Address; vault?: Address; amm?: Address; creditPool?: Address; collaterals: CollateralInfo[] } = {
  xmxn: a?.xMXN,
  vault: a?.vault,
  amm: a?.vamm,
  creditPool: a?.creditPool,
  collaterals: a?.collaterals ?? [],
};
