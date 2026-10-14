// UI-edge formatting. All on-chain amounts are 6-decimal bigints (dOUSD, xMXN);
// FX is 8-decimal (mxnPerUsd); ratios/fees are basis points.

export const TOKEN_DECIMALS = 6;
export const FX_DECIMALS = 8;

export function toUnits(value: string, decimals = TOKEN_DECIMALS): bigint {
  const clean = value.replace(/[,\s]/g, "");
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") return 0n;
  const [whole, frac = ""] = clean.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export function fromUnits(value: bigint, decimals = TOKEN_DECIMALS): number {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const n = Number(abs / base) + Number(abs % base) / Number(base);
  return neg ? -n : n;
}

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });

/** 1234567890n → "1,234.57" */
export function fmtAmount(value: bigint | undefined, digits = 2): string {
  if (value === undefined) return "—";
  return nf(digits, digits).format(fromUnits(value));
}

export function fmtNumber(n: number | undefined, digits = 2): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return nf(digits, digits).format(n);
}

export function fmtMxn(value: bigint | undefined, digits = 2) {
  return value === undefined ? "—" : `${fmtAmount(value, digits)} xMXN`;
}

export function fmtUsd(value: bigint | undefined, digits = 2) {
  return value === undefined ? "—" : `${fmtAmount(value, digits)} dOUSD`;
}

/** 2_000_000_000n (8dp) → 20.0 */
export function fxRate(mxnPerUsd: bigint): number {
  return fromUnits(mxnPerUsd, FX_DECIMALS);
}

export const MAX_UINT = 2n ** 256n - 1n;

/** bps → "150.0%"; infinite ratio (no debt) → "∞" */
export function fmtBps(bps: bigint | number | undefined, digits = 1): string {
  if (bps === undefined) return "—";
  const b = typeof bps === "bigint" ? bps : BigInt(Math.round(bps));
  if (b >= MAX_UINT / 2n) return "∞";
  return `${nf(digits, digits).format(Number(b) / 100)}%`;
}

export function shortAddr(addr?: string, n = 4): string {
  if (!addr) return "—";
  return `${addr.slice(0, 2 + n)}…${addr.slice(-n)}`;
}

export function timeAgo(unixSeconds: number, now = Date.now() / 1000): string {
  const d = Math.max(0, Math.round(now - unixSeconds));
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
