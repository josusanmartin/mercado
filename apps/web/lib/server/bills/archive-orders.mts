// Demo reset helper: archives the off-chain bill order store so rehearsals start clean.
// Moves <repo>/.data/orders.json to .data/archive/orders-<timestamp>.json (nothing is deleted).
// Safe while the dev server runs: the store re-reads the file on every request and recreates it empty.
// Replay markers (.data/mppx-store.json) and the MPP secret are kept on purpose: already-used payments
// must stay unusable. Archiving also drops pending R-009 recovery state, so only run it as part of a reset.
// Usage: npx tsx apps/web/lib/server/bills/archive-orders.mts
import { existsSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const file = process.env.MERCADO_ORDERS_FILE ?? path.join(root, ".data", "orders.json");
if (!existsSync(file)) {
  console.log("bills: no order store to archive (already clean)");
} else {
  const dir = path.join(path.dirname(file), "archive");
  mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `orders-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  renameSync(file, dest);
  console.log(`bills: archived order store → ${path.relative(root, dest)}`);
}
