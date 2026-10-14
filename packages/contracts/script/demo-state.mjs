#!/usr/bin/env node
// Prints the demo state table (personas, desk, pool, oracle) + explorer links. Read-only.
//   node packages/contracts/script/demo-state.mjs
import { createPublicClient, http, formatUnits, parseAbi } from "viem";
import { tempoModerato } from "viem/chains";
import { readFileSync, existsSync } from "node:fs";

const dep = JSON.parse(readFileSync(new URL("../deployments/42431.json", import.meta.url)));
const envTxt = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const envVar = (k) => envTxt.match(new RegExp(`^${k}=(\\S+)$`, "m"))?.[1];
const EXP = "https://explore.testnet.tempo.xyz";
const c = createPublicClient({ chain: tempoModerato, transport: http("https://rpc.moderato.tempo.xyz") });
const erc = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const vaultAbi = parseAbi(["function getPosition(address) view returns ((uint256 collateral, uint256 debt))"]);
const poolAbi = parseAbi(["function getDebt(address) view returns (uint256)", "function availableLiquidity() view returns (uint256)", "function stats() view returns (uint256,uint256,uint256,uint256)", "function lenderBalance(address) view returns (uint256)"]);
const deskAbi = parseAbi(["function reserves() view returns (uint256,uint256)", "function paused() view returns (bool)", "function remainingDailyCap(address) view returns (uint256)"]);
const oracleAbi = parseAbi(["function peek() view returns (uint256,uint256,bool)"]);
const f = (v, d = 2) => Number(formatUnits(v, 6)).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const r = (a, abi, fn, args = []) => c.readContract({ address: a, abi, functionName: fn, args });

const rows = [];
for (const [name, key] of [["LP (Ana)", "LP"], ["Sender", "SENDER"], ["Recipient (Rosa)", "RECIPIENT"], ["Driver (Javier)", "DRIVER"], ["Lender (Elena)", "LENDER"]]) {
  const a = envVar(`${key}_ADDRESS`);
  const [ousd, xmxn, pos, debt, cap] = await Promise.all([
    r(dep.ousd, erc, "balanceOf", [a]), r(dep.xMXN, erc, "balanceOf", [a]), r(dep.vault, vaultAbi, "getPosition", [a]),
    r(dep.creditPool, poolAbi, "getDebt", [a]), r(dep.swapDesk, deskAbi, "remainingDailyCap", [a]),
  ]);
  const ratio = pos.debt > 0n ? `${(Number((pos.collateral * 20n * 10_000n) / pos.debt) / 100).toFixed(0)}%` : "—";
  rows.push({ persona: name, OUSD: f(ousd), xMXN: f(xmxn), "vault coll/debt": `${f(pos.collateral, 0)} / ${f(pos.debt, 0)}`, ratio, "advance owed": f(debt), "swap cap left": f(cap, 0), explorer: `${EXP}/address/${a}` });
}
console.table(rows);

const [[rO, rX], paused, cash, stats, [px, at, valid]] = await Promise.all([
  r(dep.swapDesk, deskAbi, "reserves"), r(dep.swapDesk, deskAbi, "paused"), r(dep.creditPool, poolAbi, "availableLiquidity"),
  r(dep.creditPool, poolAbi, "stats"), r(dep.oracle, oracleAbi, "peek"),
]);
const age = Math.round(Date.now() / 1000 - Number(at));
console.log(`desk    ${f(rO)} OUSD / ${f(rX)} xMXN ${paused ? "PAUSED" : "open"}   ${EXP}/address/${dep.swapDesk}`);
console.log(`pool    cash ${f(cash)} xMXN, lent ${f(stats[2])}, realized fees ${f(stats[3])}   ${EXP}/address/${dep.creditPool}`);
console.log(`oracle  ${(Number(px) / 1e8).toFixed(2)} MXN/USD (mock admin feed), updated ${age}s ago, ${valid ? "valid" : "INVALID/STALE"}   ${EXP}/address/${dep.oracle}`);

const run = new URL("../broadcast/DemoReset.s.sol/42431/run-latest.json", import.meta.url);
if (existsSync(run)) {
  const j = JSON.parse(readFileSync(run));
  if (Date.now() - j.timestamp < 10 * 60_000) {
    console.log(`\nreset txs (${j.transactions.filter((t) => t.hash).length}):`);
    for (const t of j.transactions.filter((t) => t.hash)) console.log(`  ${(t.function ?? "create").split("(")[0].padEnd(20)} ${EXP}/tx/${t.hash}`);
  }
}
