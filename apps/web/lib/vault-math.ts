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

/** Per-collateral risk lines (v1 OUSD defaults; v2 reads them from the vault's params). */
export type Lines = { liqBps: bigint; minBps: bigint; recommendedBps: bigint };
export const V1_LINES: Lines = { liqBps: 13_500n, minBps: 15_000n, recommendedBps: 20_000n };

/** null = no debt (infinite ratio); undefined = couldn't read it (e.g. stale oracle), never "no debt". */
export function health(bps: bigint | null | undefined, lines: Lines = V1_LINES): Health {
  if (bps === undefined) return "unknown";
  if (bps === null) return "none";
  if (bps < lines.liqBps) return "liquidatable";
  if (bps < lines.minBps) return "tight";
  if (bps < lines.recommendedBps) return "ok";
  return "safe";
}

/** Copy for a health state, with this collateral's own percentages. */
export function healthCopy(h: Health, lines: Lines = V1_LINES): string {
  const pct = (b: bigint) => `${Number(b) / 100}%`;
  switch (h) {
    case "ok":
      return `Below the recommended ${pct(lines.recommendedBps)}`;
    case "tight":
      return `Under ${pct(lines.minBps)}: can't mint or withdraw`;
    case "liquidatable":
      return `Under ${pct(lines.liqBps)}: can be liquidated`;
    default:
      return HEALTH_COPY[h];
  }
}

/** Effective MXN per 1 collateral unit (8dp) = MXN/USD × collateral USD price. OUSD is $1. */
export const mxnPerUnit = (mxnPerUsd: bigint, usdPx8 = 10n ** 8n) => (mxnPerUsd * usdPx8) / 10n ** 8n;

export const HEALTH_COPY: Record<Health, string> = {
  unknown: "Health unavailable: the exchange rate can't be read right now",
  none: "No debt",
  safe: "Healthy",
  ok: "Below the recommended 200%",
  tight: "Under 150%: can't mint or withdraw",
  liquidatable: "Under 135%: can be liquidated",
};
