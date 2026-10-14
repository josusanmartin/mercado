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

// Refusal: a call to a non-Mercado target must not be sponsored (the fresh account has no fee tokens → fails)
try {
  await wallet.writeContract({ address: chain.feeToken, abi: erc20Abi, functionName: "approve", args: [dep.vault, 1n], feePayer: true });
  console.log("UNEXPECTED: non-Mercado target was sponsored");
  process.exitCode = 1;
} catch (e) {
  console.log("non-Mercado target refused:", (e.shortMessage ?? e.message).split("\n")[0]);
}
