/**
 * Stage preflight (review CR-08, lead-approved): a green/red table to run 5 minutes before going on stage, and
 * after EVERY rehearsal or recapture (balances alone are not enough: the 04:29 card proof failed on the daily limit).
 *   npx tsx scripts/preflight.ts                 # exit 1 on any RED
 *   npx tsx scripts/preflight.ts --base http://localhost:3100 --charge 150
 *
 * Read-only: on-chain views + GETs against the :3100 dev server. Never sends a tx, never touches the oracle.
 * Addresses come from activeAddresses() (packages/shared/src/protocol.ts); personas from root .env.local.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Address, createPublicClient, formatUnits, http, parseAbi } from 'viem'
import { tempoModerato } from 'viem/chains'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const line of existsSync(join(ROOT, '.env.local')) ? readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n') : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const webEnv = existsSync(join(ROOT, 'apps/web/.env.local')) ? readFileSync(join(ROOT, 'apps/web/.env.local'), 'utf8') : ''
process.env.MERCADO_PROTOCOL ??= webEnv.match(/^NEXT_PUBLIC_MERCADO_PROTOCOL=(\w+)$/m)?.[1] ?? 'v2'
const { activeAddresses, ACTIVE_PROTOCOL } = (await import('@mercado/shared')) as any
const A = activeAddresses()

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? process.argv[i + 1] : d
}
const BASE = arg('base', process.env.MERCADO_APP_URL ?? 'http://localhost:3100')
const CHARGE = Number(arg('charge', '150')) // the stage card proof amount (DEMO.md beat ★)
const SEND_USD = Number(arg('send', '500')) // Remesas example
const ADVANCE = Number(arg('advance', '1500')) // largest advance the driver flow offers in rehearsals
const ALPHA_USD = '0x20c0000000000000000000000000000000000001' as Address

const client = createPublicClient({
  chain: tempoModerato,
  transport: http('https://rpc.moderato.tempo.xyz', { batch: { batchSize: 20, wait: 16 }, retryCount: 4, retryDelay: 400 }),
})
const erc = parseAbi(['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)'])
const poolAbi = parseAbi(['function getDebt(address) view returns (uint256)', 'function availableLiquidity() view returns (uint256)'])
const cardAbi = parseAbi([
  'function cardsOf(address) view returns (uint256[])',
  'function getCard(uint256) view returns ((address holder,uint64 issuedAt,bool frozen,uint256 dailyLimit,uint256 spentToday,uint256 availableToday,uint16 last4,uint256 resetsAt))',
])
const ammAbi = parseAbi([
  'function state() view returns (uint256 reserve, uint256 liability, uint256 equity, uint256 coverageBps, uint256 redeemedToday, uint256 redeemCap)',
  'function maxLiability() view returns (uint256)',
  'function minMintCoverageBps() view returns (uint256)',
  'function paused() view returns (bool)',
])
const deskAbi = parseAbi(['function reserves() view returns (uint256, uint256)', 'function paused() view returns (bool)'])
const oracleAbi = parseAbi(['function peek() view returns (uint256, uint256, bool)', 'function maxAge() view returns (uint256)'])
const vaultAbi = parseAbi(['function totalAssets() view returns (uint256)'])
const read = <T>(address: Address, abi: any, functionName: string, args: unknown[] = []) =>
  client.readContract({ address, abi, functionName, args }) as Promise<T>

type Status = 'GREEN' | 'AMBER' | 'RED'
const rows: { area: string; check: string; value: string; need: string; status: Status }[] = []
const add = (area: string, check: string, value: string, need: string, status: Status) => rows.push({ area, check, value, need, status })
const n6 = (v: bigint) => Number(formatUnits(v, 6))
const fmt = (v: number, d = 2) => v.toLocaleString('en-US', { maximumFractionDigits: d })
const gate = (ok: boolean, warn = false): Status => (ok ? 'GREEN' : warn ? 'AMBER' : 'RED')
async function safe(area: string, check: string, need: string, fn: () => Promise<void>) {
  try {
    await fn()
  } catch (e) {
    add(area, check, `error: ${(e as Error).message.split('\n')[0].slice(0, 70)}`, need, 'RED')
  }
}
const persona = (key: string) => process.env[key] as Address | undefined

// ---------------------------------------------------------------- app + API health (:3100)
async function get(path: string, timeoutMs = 25_000) {
  const t0 = Date.now()
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, ms: Date.now() - t0, body: await res.text() }
}
const PAGES = ['/', '/mint', '/remesas', '/global', '/credito?tab=driver', '/card?holder=driver', '/invest', '/developers', '/contracts']
for (const p of PAGES) {
  await safe('app :3100', `GET ${p}`, '200 < 10s', async () => {
    const r = await get(p)
    add('app :3100', `GET ${p}`, `${r.status} in ${(r.ms / 1000).toFixed(1)}s`, '200 < 10s', r.status === 200 ? (r.ms < 10_000 ? 'GREEN' : 'AMBER') : 'RED')
  })
}
const APIS: [string, (b: any) => string | undefined][] = [
  ['/api/fx', (b) => (b.mxnPerUsd ?? b.rate ?? b.price ? undefined : 'no rate in body')],
  [`/api/move/quote?side=usd_to_mxn&amount=${SEND_USD}`, (b) => (BigInt(b.amountOut ?? 0) > 0n ? undefined : 'no amountOut')],
  ['/api/sponsor', (b) => (b.sponsor ? undefined : 'no sponsor')],
  ['/api/invest/rates', () => undefined],
  ['/api/credit/loans', () => undefined],
  ['/api/mpp/pricing', () => undefined],
  ['/api/driver/demo', () => undefined],
]
// CR-08: every browser read now goes through the caching /api/rpc proxy; the 402 panels use /api/mpp/challenge
await safe('api', 'POST /api/rpc', 'eth_blockNumber', async () => {
  const t0 = Date.now()
  const res = await fetch(BASE + '/api/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    signal: AbortSignal.timeout(15_000),
  })
  const b = (await res.json().catch(() => ({}))) as { result?: string; error?: { message: string } }
  const ok = res.status === 200 && !!b.result
  add('api', 'POST /api/rpc', ok ? `block ${Number(b.result)} in ${((Date.now() - t0) / 1000).toFixed(1)}s` : `HTTP ${res.status} ${b.error?.message ?? ''}`.trim(), 'eth_blockNumber (browser read path)', ok ? 'GREEN' : 'RED')
})
await safe('api', 'GET /api/mpp/challenge', 'live 402 challenge', async () => {
  const r = await get('/api/mpp/challenge?product=move-quote&side=usd_to_mxn&amount=100')
  const b = JSON.parse(r.body)
  const ok = r.status === 200 && b.status === 402 && !!b.wwwAuthenticate
  add('api', 'GET /api/mpp/challenge', ok ? `402 challenge in ${(r.ms / 1000).toFixed(1)}s` : `HTTP ${r.status}, inner ${b.status}`, 'inner 402 + WWW-Authenticate', ok ? 'GREEN' : 'RED')
})
let sponsorAddr: Address | undefined
for (const [p, check] of APIS) {
  await safe('api', `GET ${p.split('?')[0]}`, '200 + body', async () => {
    const r = await get(p)
    let problem: string | undefined = r.status === 200 ? undefined : `HTTP ${r.status}`
    if (!problem) {
      try {
        const b = JSON.parse(r.body)
        if (p === '/api/sponsor') sponsorAddr = b.sponsor
        problem = check(b)
      } catch {
        problem = 'not JSON'
      }
    }
    add('api', `GET ${p.split('?')[0]}`, problem ?? `200 in ${(r.ms / 1000).toFixed(1)}s`, '200 + body', problem ? 'RED' : 'GREEN')
  })
}

// ---------------------------------------------------------------- oracle (admin-relayed; never set by hand)
await safe('oracle', 'FX age', '< 15 min (relay every 10)', async () => {
  const [[px, at, valid], maxAge] = await Promise.all([read<[bigint, bigint, boolean]>(A.oracle, oracleAbi, 'peek'), read<bigint>(A.oracle, oracleAbi, 'maxAge')])
  const age = Math.round(Date.now() / 1000 - Number(at))
  add('oracle', 'FX age', `${(Number(px) / 1e8).toFixed(4)} MXN/USD, ${Math.round(age / 60)} min old`, `< 15 min (stale at ${Math.round(Number(maxAge) / 60)})`, !valid ? 'RED' : gate(age < 15 * 60, true))
})

// ---------------------------------------------------------------- sponsor budget
await safe('sponsor', 'fee balance', '≥ 5 AlphaUSD', async () => {
  if (!sponsorAddr) throw new Error('/api/sponsor gave no address')
  const b = n6(await read<bigint>(ALPHA_USD, erc, 'balanceOf', [sponsorAddr]))
  add('sponsor', 'fee balance (AlphaUSD)', `${fmt(b)} (≤0.01/tx; hourly quota is in-memory)`, '≥ 5 AlphaUSD', gate(b >= 5, b >= 1))
})

// ---------------------------------------------------------------- capacity: exchange, desks, pool, savings
await safe('exchange', 'MoveAMM', 'coverage ≥ 110%, room to mint', async () => {
  const [s, maxL, minCov, paused] = await Promise.all([
    read<readonly bigint[]>(A.vamm, ammAbi, 'state'),
    read<bigint>(A.vamm, ammAbi, 'maxLiability'),
    read<bigint>(A.vamm, ammAbi, 'minMintCoverageBps'),
    read<boolean>(A.vamm, ammAbi, 'paused').catch(() => false),
  ])
  const [, liability, , cov, used, cap] = s
  const covPct = Number(cov) / 100
  add('exchange', 'coverage', `${fmt(covPct, 1)}% (mint floor ${Number(minCov) / 100}%)`, '≥ 110%', paused ? 'RED' : gate(covPct >= 110, covPct >= Number(minCov) / 100))
  const room = n6(maxL - liability)
  add('exchange', 'mint room', `${fmt(room, 0)} xMXN`, '≥ 50,000', gate(room >= 50_000, room > 0))
  const left = n6(cap - used)
  add('exchange', 'redeem bucket left', `${fmt(left, 0)} OUSD`, '≥ 1,000', gate(left >= 1_000, left > 0))
})
for (const [label, desk, unit] of [
  ['T-bill desk', A.investDesk, 'tTBILL'],
  ['stocks desk', A.investDeskIdx, 'mIDX'],
] as const) {
  if (!desk) continue
  await safe('invest', label, `≥ 100 ${unit} + ≥ 1,000 OUSD`, async () => {
    const [[ousd, asset], paused] = await Promise.all([read<[bigint, bigint]>(desk, deskAbi, 'reserves'), read<boolean>(desk, deskAbi, 'paused').catch(() => false)])
    const ok = n6(asset) >= 100 && n6(ousd) >= 1_000
    add('invest', label, `${fmt(n6(asset))} ${unit} · ${fmt(n6(ousd), 0)} OUSD${paused ? ' · PAUSED' : ''}`, `≥ 100 ${unit} + ≥ 1,000 OUSD`, paused ? 'RED' : gate(ok, n6(asset) > 0))
  })
}
await safe('credit', 'pool cash', `≥ ${fmt(ADVANCE)} xMXN`, async () => {
  const cash = n6(await read<bigint>(A.creditPool, poolAbi, 'availableLiquidity'))
  add('credit', 'pool cash', `${fmt(cash)} xMXN`, `≥ ${fmt(ADVANCE)} xMXN (one advance)`, gate(cash >= ADVANCE, cash >= ADVANCE / 4))
})
for (const [label, v] of [
  ['sOUSD assets', A.collaterals?.find((c: { symbol: string }) => c.symbol === 'sOUSD')?.token],
  ['sxMXN assets', A.sxMXN],
] as const) {
  if (!v) continue
  await safe('invest', label, '> 0', async () => {
    const t = n6(await read<bigint>(v, vaultAbi, 'totalAssets'))
    add('invest', label, fmt(t), '> 0', gate(t > 0))
  })
}

// ---------------------------------------------------------------- demo personas
const driver = persona('DRIVER_ADDRESS')
if (driver) {
  await safe('Javier', 'card + debt', `card proof ${CHARGE} xMXN`, async () => {
    const [debt, bal, allow, ids] = await Promise.all([
      read<bigint>(A.creditPool, poolAbi, 'getDebt', [driver]),
      read<bigint>(A.xMXN, erc, 'balanceOf', [driver]),
      read<bigint>(A.xMXN, erc, 'allowance', [driver, A.card]),
      read<bigint[]>(A.card, cardAbi, 'cardsOf', [driver]),
    ])
    add('Javier', 'advance owed', `${fmt(n6(debt))} xMXN`, '0 (fresh Crédito beat)', gate(debt === 0n, true))
    add('Javier', 'xMXN balance', `${fmt(n6(bal))}`, `≥ ${CHARGE} (live card proof)`, gate(n6(bal) >= CHARGE, true))
    add('Javier', 'card allowance', `${fmt(n6(allow))}`, `≥ ${CHARGE * 2} (each charge spends it)`, gate(n6(allow) >= CHARGE * 2, n6(allow) >= CHARGE))
    if (!ids.length) return add('Javier', 'card', 'no card', 'active card', 'RED')
    const c = await read<{ frozen: boolean; dailyLimit: bigint; spentToday: bigint; availableToday: bigint; last4: number; resetsAt: bigint }>(A.card, cardAbi, 'getCard', [ids.at(-1)])
    add('Javier', `card #${ids.at(-1)} (…${c.last4})`, c.frozen ? 'FROZEN' : 'active', 'active (the beat freezes it on stage)', gate(!c.frozen))
    const resets = new Date(Number(c.resetsAt) * 1000).toISOString().slice(11, 16)
    add('Javier', 'card available today', `${fmt(n6(c.availableToday))} (${fmt(n6(c.spentToday))}/${fmt(n6(c.dailyLimit))} spent, resets ${resets} UTC)`, `≥ ${CHARGE} (+ retries)`, gate(n6(c.availableToday) >= CHARGE * 2, n6(c.availableToday) >= CHARGE))
  })
}
const familia = persona('RECIPIENT_ADDRESS')
if (familia) {
  await safe('Familia', 'card', 'active', async () => {
    const ids = await read<bigint[]>(A.card, cardAbi, 'cardsOf', [familia])
    if (!ids.length) return add('Familia', 'card', 'no card', 'active card', 'AMBER')
    const c = await read<{ frozen: boolean; availableToday: bigint }>(A.card, cardAbi, 'getCard', [ids.at(-1)])
    add('Familia', `card #${ids.at(-1)}`, `${c.frozen ? 'FROZEN' : 'active'} · ${fmt(n6(c.availableToday))} available today`, 'active', gate(!c.frozen, true))
  })
}
for (const [who, key, token, sym, need, area] of [
  ['Sender (US)', 'SENDER_ADDRESS', A.ousd, 'OUSD', SEND_USD, 'Remesas send'],
  ['LP (Institución)', 'LP_ADDRESS', A.ousd, 'OUSD', 1_000, 'Mint deposit'],
  ['Saver', 'SAVER_ADDRESS', A.ousd, 'OUSD', 100, 'Invest buy'],
] as const) {
  const a = persona(key)
  if (!a) continue
  await safe(who, sym, `≥ ${need}`, async () => {
    const [b, fee] = await Promise.all([read<bigint>(token, erc, 'balanceOf', [a]), read<bigint>(ALPHA_USD, erc, 'balanceOf', [a])])
    add(who, `${sym} balance`, fmt(n6(b)), `≥ ${fmt(need)} (${area})`, gate(n6(b) >= need, n6(b) > 0))
    add(who, 'own fee balance', `${fmt(n6(fee))} AlphaUSD`, '≥ 0.1 (if the sponsor quota runs out)', gate(n6(fee) >= 0.1, true))
  })
}

// ---------------------------------------------------------------- report
const icon = { GREEN: '✅', AMBER: '⚠️ ', RED: '❌' } as const
const w = (k: 'area' | 'check' | 'value' | 'need') => Math.max(k.length, ...rows.map((r) => r[k].length))
const [wa, wc, wv, wn] = [w('area'), w('check'), w('value'), w('need')]
console.log(`\nMercado preflight · protocol ${ACTIVE_PROTOCOL} · ${BASE} · ${new Date().toISOString().slice(0, 19)}Z\n`)
console.log(`   ${'area'.padEnd(wa)}  ${'check'.padEnd(wc)}  ${'value'.padEnd(wv)}  need`)
for (const r of rows) console.log(`${icon[r.status]} ${r.area.padEnd(wa)}  ${r.check.padEnd(wc)}  ${r.value.padEnd(wv)}  ${r.need.padEnd(wn)}`)
const red = rows.filter((r) => r.status === 'RED').length
const amber = rows.filter((r) => r.status === 'AMBER').length
console.log(`\n${red ? `❌ RED: ${red}` : '✅ GO'} · ${amber} amber · ${rows.length} checks. Fix RED before going on stage (demo-reset, fund the persona, or ask the owner).`)
process.exit(red ? 1 : 0)
