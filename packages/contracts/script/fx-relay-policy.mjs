// Pure relay policy (unit-tested in fx-relay.test.mjs). No stepping, no synthetic rates (review R-036/R-037).
export const MAX_DAILY_AGE_MS = 48 * 3600_000;

/** One write or none: refuse if |target − current| exceeds the oracle's jump limit. */
export function decideWrite(current, target, maxJumpBps, minPrice, maxPrice) {
  if (target < minPrice || target > maxPrice) return { write: false, reason: `outside the oracle sanity band` };
  const diff = target > current ? target - current : current - target;
  if (diff * 10_000n > current * maxJumpBps) {
    const pct = Number((diff * 10_000n) / current) / 100;
    return { write: false, reason: `a ${pct.toFixed(2)}% move exceeds the ${Number(maxJumpBps) / 100}% jump limit; needs a human (forceSet)` };
  }
  return { write: true, price: target };
}

/** Daily-reference source dates must be recent and not in the future. */
export function checkSourceDate(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "no source date";
  if (t > now + 5 * 60_000) return `source date in the future (${iso})`;
  if (now - t > MAX_DAILY_AGE_MS) return `source date too old (${iso})`;
  return undefined;
}
