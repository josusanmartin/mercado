// Demo reset helper: archives the off-chain bill order store so rehearsals start clean.
// Moves <repo>/.data/orders.json to .data/archive/orders-<timestamp>.json (nothing is deleted).
// Replay markers (.data/mppx-store.json) and the MPP secret are kept on purpose: already-used payments
// must stay unusable.
//
// Refuses (exit 1) unless the store is quiescent, because the dev server's locks are process-local and
// an in-flight payment could otherwise lose its write or resurrect the old store:
//   - no order in PAYMENT_VERIFIED (paid, fulfillment not finished)
//   - no CREATED order with unresolved payment attempts (R-009/R-011 recovery state)
//   - store untouched for QUIET_SECONDS (no request mid-flight)
// --force skips the checks (only when nobody is using the app).
//
// Usage: npx tsx apps/web/lib/server/bills/archive-orders.mts [--force]
import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const QUIET_SECONDS = 30;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const file = process.env.MERCADO_ORDERS_FILE ?? path.join(root, ".data", "orders.json");
const force = process.argv.includes("--force");

type Attempt = { kind: string; holdUntil: number; keepUntil?: number };
type Order = { orderId: string; status: string; pendingAttempts?: Attempt[] };

if (!existsSync(file)) {
  console.log("bills: no order store to archive (already clean)");
  process.exit(0);
}

if (!force) {
  const problems: string[] = [];
  const idle = (Date.now() - statSync(file).mtimeMs) / 1000;
  if (idle < QUIET_SECONDS) problems.push(`store was written ${idle.toFixed(0)}s ago (need ${QUIET_SECONDS}s of quiet)`);
  const orders: Order[] = Object.values(JSON.parse(readFileSync(file, "utf8")).orders ?? {});
  const now = Date.now();
  for (const o of orders) {
    if (o.status === "PAYMENT_VERIFIED") problems.push(`${o.orderId} is paid but not yet fulfilled`);
    const live = (o.pendingAttempts ?? []).filter((a) => a.kind !== "issued" || (a.keepUntil ?? a.holdUntil) > now);
    if (o.status === "CREATED" && live.length) problems.push(`${o.orderId} has ${live.length} unresolved payment attempt(s)`);
  }
  if (problems.length) {
    console.error("bills: NOT archiving, the store isn't quiescent:");
    for (const p of problems) console.error(`  - ${p}`);
    console.error("Wait (or press Check settlement on those orders), then retry. --force skips this check.");
    process.exit(1);
  }
}

const dir = path.join(path.dirname(file), "archive");
mkdirSync(dir, { recursive: true });
const dest = path.join(dir, `orders-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
renameSync(file, dest);
console.log(`bills: archived order store → ${path.relative(root, dest)}`);
