// Isolate test state from the dev server's .data/ files.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

const dir = mkdtempSync(path.join(tmpdir(), "mercado-api-test-"));
process.env.MERCADO_ORDERS_FILE = path.join(dir, "orders.json");
process.env.MERCADO_MPPX_STORE_FILE = path.join(dir, "mppx-store.json");
process.env.MPP_SECRET_KEY = randomBytes(32).toString("hex");
process.env.MERCADO_ATTESTATIONS_FILE = path.join(dir, "attestations.json");
process.env.MERCADO_API_CALLS_FILE = path.join(dir, "api-calls.json");
process.env.MERCADO_PAID_RESULTS_FILE = path.join(dir, "paid-results.json");
