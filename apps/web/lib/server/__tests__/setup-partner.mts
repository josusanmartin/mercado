// One-off: create + fund the "API partner (demo)" testnet persona used by /developers' live Try-it.
// Writes PARTNER_* to the root .env.local and NEXT_PUBLIC_DEMO_PARTNER_* to apps/web/.env.local (both gitignored),
// funds it from the Moderato faucet, and swaps OUSD → xMXN v2 through the MoveAMM so it can pay MPP calls.
// Idempotent: reuses an existing PARTNER_PRIVATE_KEY. Never prints the key.
// Usage: npx tsx apps/web/lib/server/__tests__/setup-partner.mts [ousdToSwap=200]
import { appendFileSync, readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, parseUnits, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { activeAddresses, moveAmmAbi, tempoModerato } from "@mercado/shared";

const ROOT = new URL("../../../../../", import.meta.url);
const rootEnv = new URL(".env.local", ROOT);
const webEnv = new URL("apps/web/.env.local", ROOT);
let key = readFileSync(rootEnv, "utf8").match(/^PARTNER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m)?.[1] as Hex | undefined;
if (!key) {
  key = generatePrivateKey();
  const addr = privateKeyToAccount(key).address;
  appendFileSync(rootEnv, `\n# API partner (demo) for /developers Try-it: throwaway testnet key\nPARTNER_PRIVATE_KEY=${key}\nPARTNER_ADDRESS=${addr}\n`);
  console.log("created partner", addr);
}
const account = privateKeyToAccount(key);
if (!readFileSync(webEnv, "utf8").includes("NEXT_PUBLIC_DEMO_PARTNER_ADDRESS"))
  appendFileSync(webEnv, `\nNEXT_PUBLIC_DEMO_PARTNER_PRIVATE_KEY=${key}\nNEXT_PUBLIC_DEMO_PARTNER_ADDRESS=${account.address}\n`);

const A = activeAddresses("v2");
const pub = createPublicClient({ chain: tempoModerato, transport: http() });
const wallet = createWalletClient({ chain: tempoModerato, transport: http(), account });
const bal = (t: `0x${string}`) => pub.readContract({ address: t, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });

if ((await bal(A.ousd)) === 0n) {
  await pub.request({ method: "tempo_fundAddress" as never, params: [account.address] as never });
  for (let i = 0; i < 20 && (await bal(A.ousd)) === 0n; i++) await new Promise((r) => setTimeout(r, 1500));
}
console.log("partner", account.address, "OUSD", formatUnits(await bal(A.ousd), 6), "xMXN v2", formatUnits(await bal(A.xMXN), 6));

const swap = parseUnits(process.argv[2] ?? "200", 6);
if ((await bal(A.xMXN)) < parseUnits("500", 6)) {
  const approve = await wallet.writeContract({ address: A.ousd, abi: erc20Abi, functionName: "approve", args: [A.vamm!, swap] });
  await pub.waitForTransactionReceipt({ hash: approve });
  const [out] = await pub.readContract({ address: A.vamm!, abi: moveAmmAbi, functionName: "quote", args: [true, swap] });
  const hash = await wallet.writeContract({ address: A.vamm!, abi: moveAmmAbi, functionName: "swapOusdForXmxn", args: [swap, (out * 99n) / 100n, account.address] });
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log("swap", r.status, `https://explore.testnet.tempo.xyz/tx/${hash}`);
}
console.log("done: xMXN v2", formatUnits(await bal(A.xMXN), 6));
