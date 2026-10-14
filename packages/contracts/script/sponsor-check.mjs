#!/usr/bin/env node
// Live check of /api/sponsor: a brand-new account with ZERO fee tokens sends a sponsored tx.
//   node packages/contracts/script/sponsor-check.mjs [baseUrl=http://localhost:3100]
import { createWalletClient, createPublicClient, http, erc20Abi } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";
import { withRelay } from "viem/tempo";
import { readFileSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const dep = JSON.parse(readFileSync(new URL("../deployments/42431.json", import.meta.url)));
const RPC = "https://rpc.moderato.tempo.xyz";
const chain = tempoModerato.extend({ feeToken: "0x20C0000000000000000000000000000000000001" });
const account = privateKeyToAccount(generatePrivateKey());
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: withRelay(http(RPC), http(`${base}/api/sponsor`)) });

const fee = await pub.readContract({ address: chain.feeToken, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
console.log("fresh account", account.address, "fee-token balance", fee);
const hash = await wallet.writeContract({
  address: dep.xMXN, abi: erc20Abi, functionName: "approve", args: [dep.vault, 1n], feePayer: true,
});
const r = await pub.waitForTransactionReceipt({ hash });
console.log("sponsored tx", r.status, `https://explore.testnet.tempo.xyz/tx/${hash}`, "feePayer", r.feePayer ?? "(n/a)");
const allowance = await pub.readContract({ address: dep.xMXN, abi: erc20Abi, functionName: "allowance", args: [account.address, dep.vault] });
console.log("allowance set:", allowance === 1n);

// Refusals: ask the relay directly (JSON-RPC eth_fillTransaction) and assert NO fee-payer signature comes back.
// A refused fill falls back to a sender-paid fill, which the node rejects for a zero-balance sender; any other
// failure (HTTP/transport, unexpected RPC error) fails this check.
const ALLOWED_FEE_TOKENS = ["0x20c0000000000000000000000000000000000001", "0x20c0000000000000000000000000000000000000"];
async function fill(label, request, { allowSponsoredWithFeeToken = false } = {}) {
  const res = await fetch(`${base}/api/sponsor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_fillTransaction", params: [{ from: account.address, chainId: "0xa5bf", feePayer: true, ...request }] }),
  });
  if (!res.ok) throw new Error(`${label}: relay HTTP ${res.status}`);
  const body = await res.json();
  const sponsored = !!body.result?.tx?.feePayerSignature || body.result?.capabilities?.sponsored === true;
  // zero-balance sender paying its own fees: the node refuses the unsponsored fill
  const expectedReject = body.error && /insufficient funds|exceeds allowance \(0\)/i.test(body.error.message);
  const feeToken = body.result?.tx?.feeToken?.toLowerCase();
  const ok = sponsored
    ? allowSponsoredWithFeeToken && ALLOWED_FEE_TOKENS.includes(feeToken)
    : !!(body.result || expectedReject);
  console.log(`${ok ? "OK  " : "FAIL"} ${label}: sponsored=${sponsored}${feeToken ? ` feeToken=${feeToken}` : ""}${body.error ? ` error="${body.error.message}"` : ""}`);
  if (!ok) process.exitCode = 1;
}
const approveData = "0x095ea7b3" + dep.vault.slice(2).toLowerCase().padStart(64, "0") + "1".padStart(64, "0");
await fill("non-Mercado target (AlphaUSD.approve) not sponsored", { to: chain.feeToken, data: approveData });
await fill("maxFeePerGas 100 gwei not sponsored (R-013)", { to: dep.xMXN, data: approveData, maxFeePerGas: "0x174876e800", maxPriorityFeePerGas: "0x1" });
// The relay overrides the requested fee token with its own (AlphaUSD), so the sponsor never pays in xMXN.
// (The raw-transaction path, where the tx's own feeToken wins, is refused by policy.ts instead.)
await fill("requested xMXN fee token is overridden to a USD token", { to: dep.xMXN, data: approveData, feeToken: dep.xMXN }, { allowSponsoredWithFeeToken: true });
