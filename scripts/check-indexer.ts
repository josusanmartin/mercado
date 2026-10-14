/**
 * Verifies the contracts indexer (apps/web/lib/contracts/activity.ts, getLogs) is COMPLETE and CORRECT by
 * reconciling its all-time sums against independent on-chain state:
 *   1. minted − burned (CDP Minted − Repaid − Liquidated, + v2 AMM mints − redemptions) == xMXN.totalSupply()
 *   2. lent − repaid + realizedFees == CreditPool.outstanding principal   (repay pays fee first, then principal)
 *   3. every activity row's tx exists and succeeded (sampled)
 *
 *   MERCADO_PROTOCOL=v1 npx tsx scripts/check-indexer.ts
 *   MERCADO_PROTOCOL=v2 npx tsx scripts/check-indexer.ts
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPublicClient, formatUnits, http, parseAbi, type PublicClient } from 'viem'
import { tempoModerato } from 'viem/chains'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const line of existsSync(join(ROOT, '.env.local')) ? readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n') : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && process.env[m[1]] === undefined && m[1] !== 'MERCADO_PROTOCOL') process.env[m[1]] = m[2]
}
const { activeAddresses } = await import('@mercado/shared')
const { fetchActivity } = await import('../apps/web/lib/contracts/activity.ts')
const A = activeAddresses()
const client = createPublicClient({ chain: tempoModerato, transport: http() }) as unknown as PublicClient
const fmt = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString('en-US', { maximumFractionDigits: 6 })

let fail = 0
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) fail++
}

console.log(`indexer check · protocol ${A.protocol}`)
const [mint, move, credit, mpp] = await Promise.all((['mint', 'move', 'credit', 'mpp'] as const).map((k) => fetchActivity(client, k)))
console.log(`  rows: mint ${mint.length} · move ${move.length} · credit ${credit.length} · mpp ${mpp.length}`)
const sum = (rows: any[], f: (r: any) => bigint) => rows.reduce((t, r) => t + f(r), 0n)
const v2 = A.protocol === 'v2'
const minted = sum(mint, (r) => (r.event === 'Minted' ? r.amount : 0n)) + (v2 ? sum(move, (r) => (r.token === 'OUSD' ? r.amountOut ?? 0n : 0n)) : 0n)
const burned =
  sum(mint, (r) => (r.event === 'Repaid' || r.event === 'Liquidated' ? r.amount : 0n)) + (v2 ? sum(move, (r) => (r.token === 'xMXN' ? r.amount : 0n)) : 0n)
const supply = (await client.readContract({ address: A.xMXN, abi: parseAbi(['function totalSupply() view returns (uint256)']), functionName: 'totalSupply' })) as bigint
check(minted - burned === supply, `minted ${fmt(minted)} − burned ${fmt(burned)} = ${fmt(minted - burned)} vs xMXN totalSupply ${fmt(supply)}`)

const pool = parseAbi(['function stats() view returns (uint256,uint256,uint256,uint256)'])
const [, totalBorrowed, outstanding, realizedFees] = (await client.readContract({ address: A.creditPool, abi: pool, functionName: 'stats' })) as bigint[]
const lent = sum(credit, (r) => (r.event === 'Borrowed' ? r.amount : 0n))
const repaid = sum(credit, (r) => (r.event === 'Repaid' ? r.amount : 0n))
check(lent === totalBorrowed, `Σ Borrowed ${fmt(lent)} vs pool totalBorrowed ${fmt(totalBorrowed)}`)
check(lent - repaid + realizedFees === outstanding, `lent − repaid + realizedFees = ${fmt(lent - repaid + realizedFees)} vs outstanding ${fmt(outstanding)}`)

// "mpp" rows are every xMXN Transfer to the merchant: not all of them are necessarily MPP payments
const nonMpp = mpp.filter((r) => !r.from || /^0x0{40}$/i.test(r.from))
check(nonMpp.length === 0, `mpp rows: ${mpp.length} transfers to the merchant, ${nonMpp.length} with no sender (mints)`)

const sample = [...mint, ...move, ...credit, ...mpp].sort(() => 0.5 - Math.random()).slice(0, 8)
const rcpts = await Promise.all(sample.map((r) => client.getTransactionReceipt({ hash: r.txHash })))
check(rcpts.every((x) => x.status === 'success'), `sampled ${sample.length} rows: every tx exists and succeeded`)
check(
  [...mint, ...move, ...credit, ...mpp].every((r, i, all) => all.findIndex((y) => y.txHash === r.txHash && y.logIndex === r.logIndex && y.kind === r.kind) === i),
  'no duplicate rows (txHash, logIndex)',
)
console.log(fail ? `FAIL (${fail})` : 'PASS')
process.exit(fail ? 1 : 0)
