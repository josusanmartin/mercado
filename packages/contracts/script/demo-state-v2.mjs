#!/usr/bin/env node
// v2 demo state (read-only): pool v2, driver, cards, SENDER2, MoveAMM, oracle.
import { createPublicClient, http, formatUnits, parseAbi } from "viem";
import { tempoModerato } from "viem/chains";
import { readFileSync } from "node:fs";
const v2 = JSON.parse(readFileSync(new URL("../deployments/42431.v2.json", import.meta.url)));
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const addr = (k) => env.match(new RegExp(`^${k}=(0x[0-9a-fA-F]{40})$`, "m"))?.[1];
const c = createPublicClient({ chain: tempoModerato, transport: http("https://rpc.moderato.tempo.xyz") });
const f = (v) => Number(formatUnits(v, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 });
const erc = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"]);
const pool = parseAbi(["function getDebt(address) view returns (uint256)", "function availableLiquidity() view returns (uint256)"]);
const card = parseAbi(["function cardsOf(address) view returns (uint256[])", "function getCard(uint256) view returns ((address holder,uint64 issuedAt,bool frozen,uint256 dailyLimit,uint256 spentToday,uint256 availableToday,uint16 last4,uint256 resetsAt))"]);
const amm = parseAbi(["function state() view returns (uint256,uint256,uint256,uint256,uint256,uint256)"]);
const fx = parseAbi(["function peek() view returns (uint256,uint256,bool)"]);
const r = (address, abi, functionName, args = []) => c.readContract({ address, abi, functionName, args });
const rows = [];
for (const [name, key] of [["LP (Institución)", "LP_ADDRESS"], ["Sender (US)", "SENDER_ADDRESS"], ["Sender2", "SENDER2_ADDRESS"], ["Familia (MX)", "RECIPIENT_ADDRESS"], ["Driver (Javier)", "DRIVER_ADDRESS"], ["Lender", "LENDER_ADDRESS"]]) {
  const a = addr(key);
  if (!a) continue;
  const [o, x, debt, ids] = await Promise.all([r(v2.ousd, erc, "balanceOf", [a]), r(v2.xMXN, erc, "balanceOf", [a]), r(v2.creditPool, pool, "getDebt", [a]), r(v2.card, card, "cardsOf", [a])]);
  let cardTxt = "—";
  if (ids.length) {
    const v = await r(v2.card, card, "getCard", [ids[0]]);
    const al = await r(v2.xMXN, erc, "allowance", [a, v2.card]);
    cardTxt = `#${ids[0]} ${v.frozen ? "FROZEN" : "active"} ${f(v.spentToday)}/${f(v.dailyLimit)} today, allow ${f(al)}`;
  }
  rows.push({ persona: name, OUSD: f(o), "xMXN v2": f(x), "advance owed": f(debt), card: cardTxt });
}
console.table(rows);
const [cash, st, [px, at, ok]] = await Promise.all([r(v2.creditPool, pool, "availableLiquidity"), r(v2.vamm, amm, "state"), r(v2.fxOracle, fx, "peek")]);
console.log(`pool v2  cash ${f(cash)} xMXN`);
console.log(`MoveAMM  reserve ${f(st[0])} OUSD · issued ${f(st[1])} xMXN · equity ${f(st[2])} · coverage ${(Number(st[3]) / 100).toFixed(1)}% · bucket ${f(st[4])}/${f(st[5])}`);
console.log(`oracle   ${(Number(px) / 1e8).toFixed(4)} MXN/USD (admin-relayed; untouched by reset), ${Math.round(Date.now() / 1000 - Number(at))}s old, ${ok ? "valid" : "INVALID"}`);
