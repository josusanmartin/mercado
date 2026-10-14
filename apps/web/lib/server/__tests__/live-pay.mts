// Live MPP bill payment check on Moderato (pull mode, local key) through lib/mpp/client.ts. Moves real
// testnet xMXN to the merchant. Usage (dev server on :3100): npx tsx apps/web/lib/server/__tests__/live-pay.mts [LP|DEPLOYER|…]
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi, formatUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";
import { payBill, quoteBill, getBillOrder } from "../../mpp/client";

const env = Object.fromEntries(
  readFileSync(new URL("../../../../../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const dep = JSON.parse(readFileSync(new URL("../../../../../packages/shared/src/deployments/42431.json", import.meta.url), "utf8"));
const pc = createPublicClient({ chain: tempoModerato, transport: http() });
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const bal = (a: string) => pc.readContract({ address: dep.xMXN, abi: erc20, functionName: "balanceOf", args: [a as Hex] });

const who = process.argv[2] ?? "LP";
const account = privateKeyToAccount(env[`${who}_PRIVATE_KEY`] as Hex);
const merchant = dep.merchant;
console.log(`payer ${who} ${account.address} xMXN=${formatUnits(await bal(account.address), 6)} merchant=${formatUnits(await bal(merchant), 6)}`);

const base = "http://localhost:3100";
const q = await quoteBill({ provider: "telcel", phone: "5512345678", amountMxn: 30 }, base);
console.log("quote", q.quoteId, q.amount, q.tokenSymbol);
const m0 = await bal(merchant);
const stages: string[] = [];
const r = await payBill({ quoteId: q.quoteId, baseUrl: base, account, onStage: (s) => stages.push(s) });
console.log("stages", stages.join(" → "));
console.log("order", r.order.orderId, r.order.status, "tx", r.order.receipt.txHash, r.order.receipt.explorerUrl);
console.log("fulfillment", r.order.fulfillment?.reference, r.order.fulfillment?.label);
console.log("Payment-Receipt", r.receipt);
const m1 = await bal(merchant);
console.log("merchant delta", formatUnits(m1 - m0, 6));

const again = await payBill({ quoteId: q.quoteId, baseUrl: base, account, idempotencyKey: r.idempotencyKey });
const m2 = await bal(merchant);
console.log("retry same key →", again.order.orderId === r.order.orderId ? "same order" : "DIFFERENT ORDER", again.order.status, "extra merchant delta", formatUnits(m2 - m1, 6));
const o = await getBillOrder(r.order.orderId, base);
console.log("history", o.history.map((h) => h.status).join(" → "));

// Paid underwriter access to /api/driver/score (2 xMXN via MPP).
{
  const { Mppx, tempo } = await import("mppx/client");
  const { createClient } = await import("viem");
  const { tempoModerato: chain } = await import("@mercado/shared");
  const mppx = Mppx.create({
    polyfill: false,
    methods: [tempo.charge({ account, expectedChainId: 42431, getClient: () => createClient({ chain, transport: http(), account }) })],
  });
  const body = JSON.stringify({ borrower: "0x1111111111111111111111111111111111111111", profile: "irregular" });
  const unpaid = await fetch(`${base}/api/driver/score?access=underwriter`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  console.log("underwriter unpaid →", unpaid.status, unpaid.headers.get("WWW-Authenticate")?.slice(0, 40));
  const m3 = await bal(merchant);
  const paid = await mppx.fetch(`${base}/api/driver/score?access=underwriter`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  const report = await paid.json();
  console.log("underwriter paid →", paid.status, "score", report.score, "attestation?", "attestation" in report, "tx", report.payment?.txHash, "merchant delta", formatUnits((await bal(merchant)) - m3, 6));
}
