// Finish the Mercado Card demo seed for the current deployments.v2.card: RECIPIENT approves + issues a card (if it
// has none), then one real tap-authorized 45 xMXN charge at the demo terminal (MERCHANT). Idempotent-ish.
import { createPublicClient, createWalletClient, http, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";
import { readFileSync } from "node:fs";
const v2 = JSON.parse(readFileSync(new URL("../deployments/42431.v2.json", import.meta.url)));
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const key = (n) => env.match(new RegExp(`^${n}=(0x[0-9a-fA-F]{64})$`, "m"))[1];
const chain = tempoModerato.extend({ feeToken: "0x20C0000000000000000000000000000000000001" });
const pub = createPublicClient({ chain, transport: http() });
const holder = privateKeyToAccount(key("RECIPIENT_PRIVATE_KEY"));
const shop = privateKeyToAccount(key("MERCHANT_PRIVATE_KEY"));
const w = (a) => createWalletClient({ account: a, chain, transport: http() });
const { mercadoCardAbi, tip20Abi } = await import("../../shared/src/abi/index.ts").catch(async () => ({
  mercadoCardAbi: (await import("../../shared/src/abi/MercadoCard.ts")).mercadoCardAbi,
  tip20Abi: (await import("../../shared/src/abi/TIP20.ts")).tip20Abi,
}));
const send = async (a, req, label) => {
  const h = await w(a).writeContract(req);
  const r = await pub.waitForTransactionReceipt({ hash: h });
  console.log(label, r.status, `https://explore.testnet.tempo.xyz/tx/${h}`);
  if (r.status !== "success") process.exit(1);
};
await send(holder, { address: v2.xMXN, abi: tip20Abi, functionName: "approve", args: [v2.card, 2_000_000_000n] }, "approve");
let ids = await pub.readContract({ address: v2.card, abi: mercadoCardAbi, functionName: "cardsOf", args: [holder.address] });
if (ids.length === 0) {
  await send(holder, { address: v2.card, abi: mercadoCardAbi, functionName: "issueCard", args: [1_000_000_000n] }, "issueCard");
  ids = await pub.readContract({ address: v2.card, abi: mercadoCardAbi, functionName: "cardsOf", args: [holder.address] });
}
const cardId = ids[0];
const tap = { cardId, holder: holder.address, merchant: shop.address, amount: 45_000_000n, merchantRef: stringToHex("demo-ticket-0001", { size: 32 }), nonce: BigInt(Date.now()), deadline: BigInt(Math.floor(Date.now() / 1000) + 300) };
const sig = await holder.signTypedData({
  domain: { name: "MercadoCard", version: "1", chainId: 42431, verifyingContract: v2.card },
  types: { Tap: [{ name: "cardId", type: "uint256" }, { name: "holder", type: "address" }, { name: "merchant", type: "address" }, { name: "amount", type: "uint256" }, { name: "merchantRef", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
  primaryType: "Tap", message: tap,
});
await send(shop, { address: v2.card, abi: mercadoCardAbi, functionName: "charge", args: [cardId, tap.amount, tap.merchantRef, tap.nonce, tap.deadline, sig] }, "charge (tap-signed)");
console.log("card", v2.card, "cardId", cardId);
