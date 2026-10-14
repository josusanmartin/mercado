#!/usr/bin/env node
// Live check of /api/sponsor: a brand-new account with ZERO fee tokens (it only holds 1 OUSD, which makes it
// eligible) sends a sponsored tx; then a set of requests the policy must refuse.
//   node packages/contracts/script/sponsor-check.mjs [baseUrl=http://localhost:3100]
import { createWalletClient, createPublicClient, http, erc20Abi } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";
import { withRelay } from "viem/tempo";
import { readFileSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
// active protocol (same switch the app uses): v2 targets when NEXT_PUBLIC_MERCADO_PROTOCOL=v2
const v1 = JSON.parse(readFileSync(new URL("../deployments/42431.json", import.meta.url)));
const webEnv = (() => { try { return readFileSync(new URL("../../../apps/web/.env.local", import.meta.url), "utf8"); } catch { return ""; } })();
const PROTO = process.env.MERCADO_PROTOCOL ?? webEnv.match(/^NEXT_PUBLIC_MERCADO_PROTOCOL=(\w+)$/m)?.[1] ?? "v1";
const v2raw = PROTO === "v2" ? JSON.parse(readFileSync(new URL("../deployments/42431.v2.json", import.meta.url))) : undefined;
// `vault` is the approve spender used below: v2 uses the card as a sponsored spender to also cover Card
const dep = v2raw ? { ...v2raw, vault: v2raw.card ?? v2raw.vault, ousd: v1.ousd } : v1;
console.log("protocol", PROTO);
const RPC = "https://rpc.moderato.tempo.xyz";
const chain = tempoModerato.extend({ feeToken: "0x20C0000000000000000000000000000000000001" });
const account = privateKeyToAccount(generatePrivateKey());
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: withRelay(http(RPC), http(`${base}/api/sponsor`)) });

// eligibility: give the fresh account 1 OUSD (collateral token, not a fee token) from the DEPLOYER
const envFile = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const deployerPk = envFile.match(/^DEPLOYER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m)[1];
const funder = createWalletClient({ account: privateKeyToAccount(deployerPk), chain, transport: http(RPC) });
await pub.waitForTransactionReceipt({ hash: await funder.writeContract({ address: dep.ousd, abi: erc20Abi, functionName: "transfer", args: [account.address, 1_000_000n] }) });

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
async function fill(label, request, { allowSponsoredWithFeeToken = false, alsoExpect } = {}) {
  const res = await fetch(`${base}/api/sponsor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_fillTransaction", params: [{ from: account.address, chainId: "0xa5bf", feePayer: true, ...request }] }),
  }).catch((e) => { throw new Error(`${label}: relay unreachable (${e.message})`); });
  if (res.status === 429) throw new Error(`${label}: sponsor rate limit hit`);
  if (!res.ok) throw new Error(`${label}: relay HTTP ${res.status}`);
  const body = await res.json();
  const sponsored = !!body.result?.tx?.feePayerSignature || body.result?.capabilities?.sponsored === true;
  // zero-balance sender paying its own fees: the node refuses the unsponsored fill
  const expectedReject =
    body.error && (/insufficient funds|exceeds allowance \(0\)/i.test(body.error.message) || (alsoExpect && alsoExpect.test(body.error.message)));
  const feeToken = body.result?.tx?.feeToken?.toLowerCase();
  const ok = sponsored
    ? allowSponsoredWithFeeToken && ALLOWED_FEE_TOKENS.includes(feeToken)
    : !!(body.result || expectedReject);
  console.log(`${ok ? "OK  " : "FAIL"} ${label}: sponsored=${sponsored}${feeToken ? ` feeToken=${feeToken}` : ""}${body.error ? ` error="${body.error.message}"` : ""}`);
  if (!ok) process.exitCode = 1;
}
const enc = (sel, addr) => sel + addr.slice(2).toLowerCase().padStart(64, "0") + "1".padStart(64, "0");
const approveData = enc("0x095ea7b3", dep.vault);
await fill("non-Mercado target (AlphaUSD.approve) not sponsored", { to: chain.feeToken, data: approveData });
await fill("maxFeePerGas 100 gwei not sponsored (R-013)", { to: dep.xMXN, data: approveData, maxFeePerGas: "0x174876e800", maxPriorityFeePerGas: "0x1" });
// The relay overrides the requested fee token with its own (AlphaUSD), so the sponsor never pays in xMXN.
// (The raw-transaction path, where the tx's own feeToken wins, is refused by policy.ts instead.)
await fill("approve to a non-Mercado spender not sponsored (R-016)", { to: dep.xMXN, data: enc("0x095ea7b3", "0x000000000000000000000000000000000000dEaD") });
// unsponsored fallback fill of an unknown selector reverts during estimation: also an expected outcome
await fill("unknown vault selector not sponsored (R-016)", { to: dep.vault, data: "0xdeadbeef" }, { alsoExpect: /execution reverted/ });
await fill("invented sender with no balances not sponsored (R-016)", { from: privateKeyToAccount(generatePrivateKey()).address, to: dep.xMXN, data: approveData });
await fill("requested xMXN fee token is overridden to a USD token", { to: dep.xMXN, data: approveData, feeToken: dep.xMXN }, { allowSponsoredWithFeeToken: true });
