// MOVE partner bot (machine-to-machine MPP): a remittance app asks Mercado for a signed FX quote, gets an
// HTTP 402, pays 0.50 xMXN on Tempo, and verifies the signed indicative quote. Demo testnet pricing (mock oracle).
// Usage (dev server on :3100): npx tsx apps/web/lib/server/__tests__/move-partner-bot.mts [usd_to_mxn|mxn_to_usd] [amount] [PAYER]
// PAYER is a .env.local persona prefix holding xMXN (default LP). Moves real testnet xMXN to the merchant.
import { readFileSync } from "node:fs";
import { createClient, formatUnits, http, recoverMessageAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Mppx, tempo } from "mppx/client";
import { tempoModerato, type MoveQuoteResponse } from "@mercado/shared";
import { canonicalJson } from "../credit/attest";

const env = Object.fromEntries(
  readFileSync(new URL("../../../../../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const [side = "usd_to_mxn", amount = "250", who = "LP"] = process.argv.slice(2);
const base = process.env.MERCADO_API_URL ?? "http://localhost:3100";
const url = `${base}/api/move/quote?side=${side}&amount=${amount}&access=partner`;
const account = privateKeyToAccount(env[`${who}_PRIVATE_KEY`] as Hex);
const say = (who: string, msg: string) => console.log(`${who.padEnd(8)}${msg}`);

say("partner", `remittance app ${account.address.slice(0, 10)}… wants a signed indicative ${side} quote for ${amount}. No API key.`);
const unpaid = await fetch(url);
const www = unpaid.headers.get("WWW-Authenticate") ?? "";
say("mercado", `${unpaid.status} ${unpaid.statusText}: ${www.match(/description="([^"]+)"/)?.[1] ?? www.slice(0, 80)}`);
if (unpaid.status !== 402) process.exit(1);

const mppx = Mppx.create({
  polyfill: false,
  methods: [tempo.charge({ account, expectedChainId: 42431, getClient: () => createClient({ chain: tempoModerato, transport: http(), account }) })],
});
const paid = await mppx.fetch(url);
const q = (await paid.json()) as MoveQuoteResponse;
if (!paid.ok) {
  say("mercado", `${paid.status} ${JSON.stringify(q)}`);
  process.exit(1);
}
say("tempo", `paid on-chain https://explore.testnet.tempo.xyz/tx/${q.payment?.txHash}`);
say("mercado", `200 OK + Payment-Receipt ${paid.headers.get("Payment-Receipt") ? "✓" : "missing"}`);
say(
  "quote",
  `${formatUnits(BigInt(q.amountIn), 6)} ${q.symbolIn} → ${formatUnits(BigInt(q.amountOut), 6)} ${q.symbolOut} · rate ${q.rate.toFixed(4)} · mid ${q.oracleMidRate} · spread ${q.effectiveSpreadBps} bps (fee ${q.feeBps}, size ${q.sizeImpactBps}) · minOut ${formatUnits(BigInt(q.minOutSuggested), 6)} · expires in ${q.expiresAt - q.quotedAt}s · ${q.source}`,
);
if (q.signature && q.signer) {
  const { signature, signer, payment, ...unsigned } = q;
  void payment;
  const recovered = await recoverMessageAddress({ message: canonicalJson(unsigned), signature: signature as Hex });
  say("partner", `signature ${recovered.toLowerCase() === signer.toLowerCase() ? "verifies" : "DOES NOT verify"} against Mercado quote key ${signer.slice(0, 10)}…`);
}
say("label", q.label);
