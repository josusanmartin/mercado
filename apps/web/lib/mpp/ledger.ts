// Ledger of MPP-paid API calls (underwriting reports, signed indicative quotes), recorded when the
// payment is verified on-chain. Real API state for the product activity tables: no fixtures.
// Stored in <repo>/.data/api-calls.json (gitignored); deduped by settlement tx.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "../server/env";
import { withKeyLock } from "../server/bills/lock";

export type PaidProduct = "underwriting" | "move-quote";

export interface PaidCall {
  product: PaidProduct;
  txHash: `0x${string}`;
  payer?: `0x${string}`;
  /** Base units (6 dp) of `token`. */
  amount: string;
  token: `0x${string}`;
  protocol: "v1" | "v2";
  /** Short human summary, e.g. "steady · score 96.5" or "usd_to_mxn 250". */
  summary: string;
  at: string;
}

const file = () => process.env.MERCADO_API_CALLS_FILE ?? path.join(repoRoot(), ".data", "api-calls.json");

function load(): PaidCall[] {
  const f = file();
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as PaidCall[]) : [];
}

export async function recordPaidCall(call: PaidCall): Promise<void> {
  await withKeyLock("mpp-ledger", async () => {
    const all = load();
    if (all.some((c) => c.txHash.toLowerCase() === call.txHash.toLowerCase())) return;
    all.unshift(call);
    const f = file();
    mkdirSync(path.dirname(f), { recursive: true });
    const tmp = `${f}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(all.slice(0, 500), null, 2));
    renameSync(tmp, f);
  });
}

export function paidCalls(product?: PaidProduct, limit = 20) {
  const all = load().filter((c) => !product || c.product === product);
  const total = all.reduce((sum, c) => sum + BigInt(c.amount), 0n);
  return { count: all.length, totalAmount: total.toString(), calls: all.slice(0, limit) };
}
