"use client";
// Collateral catalogue for Create (SPEC v0.2: institutions mint against yield-bearing collateral).
// v1 (default): one live collateral, testnet OUSD in CollateralVault; the v2 options are listed as
// "coming". v2 (ACTIVE_PROTOCOL from packages/shared/src/protocol.ts): read from MultiCollateralVault,
// so risk params and prices are never hard-coded here.
import type { Address } from "viem";
import { ADDR } from "@/lib/contracts";
import { V1_LINES, type Lines } from "@/lib/vault-math";
import { USE_V2, V2 } from "./addresses";
import { useCollateralsV2, type CollateralV2 } from "./reads";

export type Collateral = {
  id: string;
  symbol: string;
  name: string;
  address?: Address;
  lines?: Lines;
  /** USD price of one unit, 8dp (undefined = $1, i.e. OUSD). */
  usdPx8?: bigint;
  debtCeiling?: bigint;
  totalDebt?: bigint;
  mintPaused?: boolean;
  /** Where the yield comes from, in words. Never a promised rate. */
  yieldSource: string;
  demo: boolean;
  available: boolean;
  label: string;
};

export { USE_V2 };

const KNOWN: Record<string, Pick<Collateral, "name" | "yieldSource" | "demo" | "label">> = {
  OUSD: { name: "Testnet OUSD", yieldSource: "None. Plain testnet OUSD from the Tempo faucet", demo: false, label: "Testnet OUSD (Tempo faucet, no real value)" },
  sOUSD: { name: "Staked OUSD", yieldSource: "Share price grows inside the token (mock APR, admin-set)", demo: true, label: "Demo staked OUSD (mock yield, testnet)" },
  tTBILL: { name: "Tokenized T-bill", yieldSource: "Price accrues like a T-bill (admin price feed)", demo: true, label: "Demo tokenized T-bill (testnet, not a security)" },
  tEQX: { name: "Equity index", yieldSource: "Price moves with an admin-set equity index", demo: true, label: "Demo equity index (testnet, not a security)" },
};

const V1_LIST: Collateral[] = [
  { id: "ousd", symbol: "OUSD", address: ADDR.ousd, lines: V1_LINES, available: true, ...KNOWN.OUSD },
  { id: "sousd", symbol: "sOUSD", available: false, ...KNOWN.sOUSD },
  { id: "ttbill", symbol: "tTBILL", available: false, ...KNOWN.tTBILL },
];

function fromChain(c: CollateralV2): Collateral {
  // Labels come from the deployment manifest (owned by contracts); yield wording from KNOWN.
  const manifest = V2.collaterals.find((m) => m.token.toLowerCase() === c.token.toLowerCase());
  const symbol = c.symbol ?? manifest?.symbol ?? "…";
  const base = KNOWN[symbol] ?? { name: c.name ?? symbol, yieldSource: "Not specified", demo: true, label: `${symbol} (testnet)` };
  const known = manifest ? { ...base, demo: manifest.demo, label: manifest.label } : base;
  const p = c.params;
  return {
    id: c.token,
    symbol,
    address: c.token,
    lines: p
      ? { liqBps: BigInt(p.liqRatioBps), minBps: BigInt(p.mintRatioBps), recommendedBps: BigInt(p.mintRatioBps) + 5_000n }
      : undefined,
    usdPx8: c.usdPx8,
    debtCeiling: p?.debtCeiling,
    totalDebt: c.totalDebt,
    mintPaused: p?.mintPaused,
    available: !!p,
    ...known,
  };
}

export function useCollaterals(): Collateral[] {
  const v2 = useCollateralsV2();
  if (!USE_V2) return V1_LIST;
  return v2.items.map(fromChain);
}
