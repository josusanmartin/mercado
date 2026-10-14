#!/usr/bin/env node
// FX relay (testnet): fetch a real USD/MXN rate from a free keyless public API and push it on-chain to the mock
// admin oracle (FXOracleAdapter) with setPrice, which enforces the 5–50 sanity band and the 20% max jump.
// This is ADMIN-RELAYED from a public source, NOT a decentralized oracle. The stress demo still uses forceSet + restore.
//
//   node packages/contracts/script/fx-relay.mjs            # one relay
//   node packages/contracts/script/fx-relay.mjs --loop 600 # every 600s (keeper)
//
// Sources, in order:
//   1. Coinbase exchange-rates API: intraday indicative mid, no timestamp → source time = fetch time
//   2. open.er-api.com: DAILY reference rate, with its own last-update date
// Safety (review R-036/R-037):
//   - one setPrice per run, never stepped: a source move beyond the oracle's maxJumpBps is REFUSED (no write);
//     stress/restore uses forceSet in its own script, never here
//   - a daily source must be ≤ 48h old and not in the future, else refused; Coinbase has no source timestamp,
//     so sourceTime is null ("unknown"), never fabricated
//   - onchainAt = the confirmed block's timestamp; the file binds to oracle address + on-chain updatedAt
// Writes packages/contracts/cache/fx-relay.json (read by /api/fx for the label):
//   { oracle, updatedAt, rate, mxnPerUsd8, source, sourceKind, sourceTime|null, fetchedAt, onchainAt, blockNumber, txHash, label }
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { decideWrite, checkSourceDate } from "./fx-relay-policy.mjs";

const root = new URL("../", import.meta.url);
const dep = JSON.parse(readFileSync(new URL("deployments/42431.json", root)));
const envTxt = readFileSync(new URL("../../.env.local", root), "utf8");
const pk = envTxt.match(/^DEPLOYER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m)[1];
const RPC = "https://rpc.moderato.tempo.xyz";
const chain = tempoModerato.extend({ feeToken: "0x20C0000000000000000000000000000000000001" });
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account: privateKeyToAccount(pk), chain, transport: http(RPC) });
const abi = parseAbi([
  "function setPrice(uint256)",
  "function mxnPerUsd() view returns (uint256)",
  "function maxJumpBps() view returns (uint256)",
  "function minPrice() view returns (uint256)",
  "function maxPrice() view returns (uint256)",
  "function updatedAt() view returns (uint256)",
]);
class Refused extends Error {}
const OUT = new URL("cache/fx-relay.json", root);

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

async function fetchRate() {
  const errors = [];
  try {
    const j = await getJson("https://api.coinbase.com/v2/exchange-rates?currency=USD");
    const rate = Number(j?.data?.rates?.MXN);
    if (!(rate > 0)) throw new Error("no MXN");
    // the API publishes no timestamp: keep the source time unknown, never fabricated
    return { rate, source: "Coinbase exchange-rates API", sourceKind: "intraday", sourceTime: null };
  } catch (e) {
    errors.push(`coinbase: ${e.message}`);
  }
  try {
    const j = await getJson("https://open.er-api.com/v6/latest/USD");
    const rate = Number(j?.rates?.MXN);
    if (!(rate > 0)) throw new Error("no MXN");
    const bad = checkSourceDate(j.time_last_update_utc);
    if (bad) throw new Error(bad);
    return { rate, source: "open.er-api.com", sourceKind: "daily", sourceTime: new Date(j.time_last_update_utc).toISOString() };
  } catch (e) {
    errors.push(`open.er-api: ${e.message}`);
  }
  throw new Error(`no FX source reachable (${errors.join("; ")})`);
}

const hhmm = (iso) => new Date(iso).toISOString().slice(11, 16);

async function relayOnce() {
  const fetchedAt = new Date().toISOString();
  const s = await fetchRate();
  const target = BigInt(Math.round(s.rate * 1e8));
  const [cur, jump, lo, hi] = await Promise.all(
    ["mxnPerUsd", "maxJumpBps", "minPrice", "maxPrice"].map((f) => pub.readContract({ address: dep.oracle, abi, functionName: f })),
  );
  // one write, no stepping: refuse moves beyond the oracle's own jump limit (R-036)
  const d = decideWrite(cur, target, jump, lo, hi);
  if (!d.write) throw new Refused(`FX relay REFUSED ${s.source} rate ${s.rate} vs on-chain ${Number(cur) / 1e8}: ${d.reason}. Nothing written.`);
  const txHash = await wallet.writeContract({ address: dep.oracle, abi, functionName: "setPrice", args: [target] });
  const rc = await pub.waitForTransactionReceipt({ hash: txHash });
  if (rc.status !== "success") throw new Error(`setPrice reverted ${txHash}`);
  const block = await pub.getBlock({ blockNumber: rc.blockNumber });
  const updatedAt = await pub.readContract({ address: dep.oracle, abi, functionName: "updatedAt", blockNumber: rc.blockNumber });
  const onchainAt = new Date(Number(block.timestamp) * 1000).toISOString();
  const what = s.sourceKind === "daily" ? `daily reference rate of ${s.sourceTime.slice(0, 10)}` : `intraday indicative rate, source time not published`;
  const out = {
    oracle: dep.oracle,
    updatedAt: Number(updatedAt),
    blockNumber: Number(rc.blockNumber),
    rate: s.rate,
    mxnPerUsd8: target.toString(),
    source: s.source,
    sourceKind: s.sourceKind,
    sourceTime: s.sourceTime,
    fetchedAt,
    onchainAt,
    txHash,
    label: `Admin-relayed from ${s.source} (${what}) · fetched ${hhmm(fetchedAt)} UTC · on-chain ${hhmm(onchainAt)} UTC · not a decentralized oracle`,
  };
  mkdirSync(new URL("cache/", root), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(new Date().toISOString(), out.label, `rate ${s.rate}`, `https://explore.testnet.tempo.xyz/tx/${txHash}`);
}

const loopIdx = process.argv.indexOf("--loop");
if (loopIdx > 0) {
  const secs = Number(process.argv[loopIdx + 1] ?? 600);
  for (;;) {
    try {
      await relayOnce();
    } catch (e) {
      console.error(new Date().toISOString(), "relay failed:", e.message);
      if (e instanceof Refused) {
        // alert the crew; a human decides (stress/restore uses forceSet in its own script)
        try {
          execFileSync(new URL("../../../bin/irc", import.meta.url).pathname, ["-n", "contracts", "say", `⚠️ ${e.message} @lead`]);
        } catch {}
      }
    }
    await new Promise((r) => setTimeout(r, secs * 1000));
  }
} else {
  await relayOnce();
}
