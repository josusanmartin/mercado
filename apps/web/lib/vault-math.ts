// Client-side projections that mirror CollateralVault's math (6dp OUSD/xMXN, 8dp mxnPerUsd, bps).
// For previews only; the contract is the authority and every write is simulated first.
const FX = 10n ** 8n;
const BPS = 10_000n;

/** Collateral ratio in bps, or null when there is no debt (infinite). */
export function ratioBps(collateral: bigint, debt: bigint, mxnPerUsd: bigint): bigint | null {
  if (debt === 0n) return null;
  return (collateral * mxnPerUsd * BPS) / (debt * FX);
}

/** Largest total debt (xMXN, 6dp) the collateral supports at `targetBps`. */
export function debtAt(collateral: bigint, mxnPerUsd: bigint, targetBps: bigint): bigint {
  return (collateral * mxnPerUsd * BPS) / (targetBps * FX);
}

/** MXN-per-USD rate at which the position hits `thresholdBps` (e.g. 13500 liquidation). */
export function rateAtThreshold(collateral: bigint, debt: bigint, thresholdBps: bigint): number | undefined {
  if (collateral === 0n || debt === 0n) return undefined;
  return Number((debt * thresholdBps * FX) / (collateral * BPS)) / 1e8;
}

export type Health = "unknown" | "none" | "safe" | "ok" | "tight" | "liquidatable";

/** null = no debt (infinite ratio); undefined = couldn't read it (e.g. stale oracle), never "no debt". */
export function health(bps: bigint | null | undefined): Health {
  if (bps === undefined) return "unknown";
  if (bps === null) return "none";
  if (bps < 13_500n) return "liquidatable";
  if (bps < 15_000n) return "tight";
  if (bps < 20_000n) return "ok";
  return "safe";
}

export const HEALTH_COPY: Record<Health, string> = {
  unknown: "Health unavailable: the exchange rate can't be read right now",
  none: "No debt",
  safe: "Healthy",
  ok: "Below the recommended 200%",
  tight: "Under 150%: can't mint or withdraw",
  liquidatable: "Under 135%: can be liquidated",
};
