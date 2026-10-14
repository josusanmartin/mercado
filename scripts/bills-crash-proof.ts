/**
 * Crash/restart proof for the MPP bills service (R-009 / R-011), against real Moderato settlement.
 *
 *   npx tsx scripts/bills-crash-proof.ts            # both scenarios (~2 min; scenario B waits out the 60s hold)
 *   npx tsx scripts/bills-crash-proof.ts --only A
 *
 * Each scenario runs the REAL bills service (apps/web/lib/server/bills/service.ts) in a child process with
 * its own state files (MERCADO_ORDERS_FILE / MERCADO_MPPX_STORE_FILE in a temp dir) and a fixed
 * MPP_SECRET_KEY shared across restarts. The :3100 dev server is never touched. The child is SIGKILLed at
 * a precise point inside settlement (we intercept the RPC call that broadcasts the payment tx):
 *
 *   A. crash AFTER broadcast, before PAYMENT_VERIFIED is written → restart → a plain retry with the same
 *      idempotency key must recover the payment from chain: FULFILLED_SIMULATED, no new 402, exactly ONE
 *      on-chain charge, ONE fulfillment.
 *   B. crash BEFORE broadcast (attempt persisted, tx never sent) → restart → retry must NOT fulfill and must
 *      NOT hand out a new challenge while the attempt is unresolved (409 SETTLEMENT_PENDING, nothing
 *      charged). Once the hold expires, a fresh 402 is paid normally → exactly ONE charge in total.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { type Address, type Hex, createPublicClient, createWalletClient, formatUnits, http, parseAbi, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'

const SELF = fileURLToPath(import.meta.url)
const ROOT = join(dirname(SELF), '..')
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
}
const RPC = tempoModerato.rpcUrls.default.http[0]
const chain = tempoModerato.extend({ feeToken: '0x20c0000000000000000000000000000000000001' as Address })
const d = JSON.parse(readFileSync(join(ROOT, 'packages/shared/src/deployments/42431.json'), 'utf8'))
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function transfer(address,uint256) returns (bool)'])
const pub = createPublicClient({ chain, transport: http(RPC) })
const bal = (a: Address) => pub.readContract({ address: d.xMXN, abi: erc20, functionName: 'balanceOf', args: [a] })
const BILL_MXN = 20
const URL_PAY = 'http://mercado.local/api/bills/pay'

// ───────────────────────────── child: the "server" process ─────────────────────────────
// argv: child <phase> <crashMode?>
//   phase "pay":   quote → 402 → client signs a PULL credential → payBill(credential); dies at crashMode
//   phase "retry": plain retry (no credential) with the same key; prints the outcome
//   phase "pay2":  fresh 402 → pay normally (used after scenario B's hold)
const emit = (tag: string, data: unknown = {}) => process.stdout.write(`@@${tag} ${JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}\n`)

async function child(phase: string, crash?: 'after' | 'before') {
  if (crash) {
    // Intercept the payment broadcast (viem http transport → global fetch). 'after': let it through,
    // report the hash, then hang so the parent can kill us before PAYMENT_VERIFIED is written.
    // 'before': hang without sending.
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
      const body = typeof init?.body === 'string' ? init.body : ''
      if (body.includes('eth_sendRawTransaction')) {
        if (crash === 'before') {
          emit('ABOUT_TO_BROADCAST')
          return new Promise(() => {})
        }
        const res = await realFetch(input, init)
        const json = await res.clone().json().catch(() => ({}))
        const hash = json?.result?.transactionHash ?? json?.result
        emit('BROADCAST', { hash })
        return new Promise(() => {})
      }
      return realFetch(input, init)
    }) as typeof fetch
  }
  const svc = await import('../apps/web/lib/server/bills/service.ts')
  const state = JSON.parse(process.env.CRASH_STATE ?? '{}')
  const driver = privateKeyToAccount(process.env.DRIVER_PRIVATE_KEY as Hex)
  const post = (headers: Record<string, string> = {}) =>
    new Request(URL_PAY, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ quoteId: state.quoteId, idempotencyKey: state.idempotencyKey }),
    })
  const summarize = (r: any) =>
    r.kind === 'challenge'
      ? { kind: 'challenge', status: r.response.status }
      : { kind: 'ok', orderId: r.body.orderId, status: r.body.status, txHash: r.body.receipt?.txHash, ref: r.body.fulfillment?.reference, history: r.body.order?.history }
  const call = async (req: Request) => {
    try {
      return summarize(await svc.payBill(req, { quoteId: state.quoteId, idempotencyKey: state.idempotencyKey } as any))
    } catch (e: any) {
      return { kind: 'error', status: e.status, code: e.code, message: String(e.message).slice(0, 200) }
    }
  }
  const payWithFreshChallenge = async () => {
    const unpaid = await svc.payBill(post(), { quoteId: state.quoteId, idempotencyKey: state.idempotencyKey } as any)
    if (unpaid.kind !== 'challenge') return emit('UNEXPECTED', summarize(unpaid))
    emit('CHALLENGE', { status: unpaid.response.status })
    const { Mppx, tempo } = await import('mppx/client')
    const mppx = Mppx.create({
      polyfill: false,
      methods: [tempo({ account: driver, mode: 'pull', expectedChainId: 42431, getClient: () => createWalletClient({ account: driver, chain, transport: http(RPC) }) })],
    })
    const credential = await mppx.createCredential(unpaid.response)
    emit('CREDENTIAL_SIGNED')
    emit('RESULT', await call(post({ Authorization: credential })))
  }

  if (phase === 'pay') {
    const q = await svc.createQuote({ provider: 'telcel', phone: '5512345678', amountMxn: BILL_MXN } as any)
    emit('QUOTE', { quoteId: q.quoteId, amount: q.amount })
    state.quoteId = q.quoteId
    await payWithFreshChallenge()
  } else if (phase === 'retry') {
    emit('RESULT', await call(post()))
  } else if (phase === 'pay2') {
    await payWithFreshChallenge()
  }
  const order = await svc.getOrder(state.idempotencyKey)
  emit('ORDER', order)
  process.exit(0)
}

// ───────────────────────────── parent: orchestrates kill/restart ─────────────────────────────
type Msg = { tag: string; data: any }
function runChild(env: NodeJS.ProcessEnv, args: string[], killOn?: (m: Msg, kill: () => void) => void): Promise<Msg[]> {
  return new Promise((resolve, reject) => {
    // own process group, so SIGKILL takes down npx + tsx + node together (a real hard crash)
    const p = spawn('npx', ['-y', 'tsx', SELF, 'child', ...args], { env, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT, detached: true })
    const msgs: Msg[] = []
    let buf = ''
    let err = ''
    p.stdout.on('data', (c) => {
      buf += c
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        const m = line.match(/^@@(\w+) (.*)$/)
        if (!m) continue
        const msg = { tag: m[1], data: JSON.parse(m[2]) }
        msgs.push(msg)
        killOn?.(msg, () => process.kill(-p.pid!, 'SIGKILL'))
      }
    })
    p.stderr.on('data', (c) => (err += c))
    p.on('exit', (code, sig) => (code === 0 || sig === 'SIGKILL' ? resolve(msgs) : reject(new Error(`child exited ${code}: ${err.slice(-800)}`))))
  })
}

const C = { b: '\x1b[1m', g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', dim: '\x1b[2m', x: '\x1b[0m' }
const log: string[] = []
const out = (s: string) => {
  console.log(s)
  log.push(s.replace(/\x1b\[[0-9;]*m/g, ''))
}
function check(cond: unknown, msg: string): asserts cond {
  out(`   ${cond ? `${C.g}✓` : `${C.r}✗`}${C.x} ${msg}`)
  if (!cond) throw new Error(msg)
}
const ordersOf = (dir: string) => (existsSync(join(dir, 'orders.json')) ? JSON.parse(readFileSync(join(dir, 'orders.json'), 'utf8')) : { orders: {}, idempotency: {} })
const tx = (h: string) => `https://explore.testnet.tempo.xyz/tx/${h}`

function freshEnv(tag: string) {
  const dir = mkdtempSync(join(tmpdir(), `mercado-crash-${tag}-`))
  const state = { idempotencyKey: `crash-${tag}-${Date.now()}`, quoteId: '' }
  const env = {
    ...process.env,
    MERCADO_ORDERS_FILE: join(dir, 'orders.json'),
    MERCADO_MPPX_STORE_FILE: join(dir, 'mppx-store.json'),
    MPP_SECRET_KEY: randomBytes(32).toString('hex'), // same key for the crashed process and the restart
  }
  return { dir, state, env }
}

async function scenarioA() {
  out(`\n${C.b}[A] crash AFTER the payment is broadcast, BEFORE PAYMENT_VERIFIED is recorded${C.x}`)
  const { dir, state, env } = freshEnv('A')
  const m0 = await bal(d.merchant)
  let killedAt: any
  const msgs1 = await runChild({ ...env, CRASH_STATE: JSON.stringify(state) }, ['pay', 'after'], (m, kill) => {
    if (m.tag === 'QUOTE') state.quoteId = m.data.quoteId
    if (m.tag === 'BROADCAST') {
      const o = Object.values(ordersOf(dir).orders)[0] as any
      killedAt = { hash: m.data.hash, status: o?.status, pendingAttempts: o?.pendingAttempts?.length ?? 0 }
      kill()
    }
  })
  const amount = BigInt(msgs1.find((m) => m.tag === 'QUOTE')!.data.amount)
  check(killedAt, `server process SIGKILLed right after broadcasting ${C.dim}${tx(killedAt?.hash)}${C.x}`)
  check(killedAt.status === 'CREATED' && killedAt.pendingAttempts >= 1, `at kill time: order CREATED, ${killedAt.pendingAttempts} pending attempt persisted (no PAYMENT_VERIFIED yet)`)
  await pub.waitForTransactionReceipt({ hash: killedAt.hash })
  check((await bal(d.merchant)) - m0 === amount, `the transfer landed on-chain: merchant +${formatUnits(amount, 6)} xMXN while the server was dead`)

  out(`   ${C.dim}… restarting the service (new process, same state files + secret)${C.x}`)
  const msgs2 = await runChild({ ...env, CRASH_STATE: JSON.stringify(state) }, ['retry'])
  const r = msgs2.find((m) => m.tag === 'RESULT')!.data
  check(r.kind === 'ok' && r.status === 'FULFILLED_SIMULATED', `plain retry (same idempotency key, no credential) → ${r.kind} ${r.status ?? r.code} (no new 402)`)
  check(r.txHash?.toLowerCase() === killedAt.hash.toLowerCase(), 'recovered receipt = the tx broadcast before the crash')
  const notes = (r.history ?? []).map((h: any) => `${h.status}${h.note ? `: ${h.note}` : ''}`)
  check(notes.some((n: string) => /Recovered/i.test(n)), `history: ${(r.history ?? []).map((h: any) => h.status).join(' → ')} ("${notes.find((n: string) => /Recovered/i.test(n))?.slice(0, 80)}…")`)

  const msgs3 = await runChild({ ...env, CRASH_STATE: JSON.stringify(state) }, ['retry'])
  const r3 = msgs3.find((m) => m.tag === 'RESULT')!.data
  check(r3.orderId === r.orderId && r3.ref === r.ref, 'second retry → same order, same fulfillment reference')
  const o = Object.values(ordersOf(dir).orders)[0] as any
  check(o.history.filter((h: any) => h.status === 'FULFILLED_SIMULATED').length === 1, 'fulfilled exactly once')
  check((await bal(d.merchant)) - m0 === amount, `merchant received exactly ONE payment (${formatUnits(amount, 6)} xMXN) across crash + 2 retries`)
  return { dir, txHash: killedAt.hash, orderId: r.orderId }
}

async function scenarioB() {
  out(`\n${C.b}[B] crash AFTER the attempt is persisted, BEFORE the payment is broadcast${C.x}`)
  const { dir, state, env } = freshEnv('B')
  const m0 = await bal(d.merchant)
  let killedAt: any
  const msgs1 = await runChild({ ...env, CRASH_STATE: JSON.stringify(state) }, ['pay', 'before'], (m, kill) => {
    if (m.tag === 'QUOTE') state.quoteId = m.data.quoteId
    if (m.tag === 'ABOUT_TO_BROADCAST') {
      const o = Object.values(ordersOf(dir).orders)[0] as any
      killedAt = { status: o?.status, pendingAttempts: o?.pendingAttempts?.length ?? 0 }
      kill()
    }
  })
  const amount = BigInt(msgs1.find((m) => m.tag === 'QUOTE')!.data.amount)
  check(killedAt?.status === 'CREATED' && killedAt.pendingAttempts >= 1, `server SIGKILLed just before broadcast: order CREATED, ${killedAt?.pendingAttempts} pending attempt persisted`)

  out(`   ${C.dim}… restarting the service${C.x}`)
  const r = (await runChild({ ...env, CRASH_STATE: JSON.stringify(state) }, ['retry'])).find((m) => m.tag === 'RESULT')!.data
  check(r.kind === 'error' && r.status === 409 && r.code === 'SETTLEMENT_PENDING', `immediate retry → ${r.status} ${r.code} (no fulfillment, no fresh challenge while the attempt is unresolved)`)
  check((await bal(d.merchant)) === m0, 'nothing was charged')

  out(`   ${C.dim}… waiting 65s for the unresolved-attempt hold to lapse (the signed pull tx expires after ≤25s and can no longer land)${C.x}`)
  await new Promise((res) => setTimeout(res, 65_000))
  const msgs3 = await runChild({ ...env, CRASH_STATE: JSON.stringify(state) }, ['pay2'])
  const ch = msgs3.find((m) => m.tag === 'CHALLENGE')
  const r3 = msgs3.find((m) => m.tag === 'RESULT')?.data
  check(ch?.data.status === 402, 'after the hold: chain scan finds nothing → fresh 402 challenge')
  check(r3?.kind === 'ok' && r3.status === 'FULFILLED_SIMULATED', `paying the fresh challenge → ${r3?.status} ${C.dim}${tx(r3?.txHash)}${C.x}`)
  const o = Object.values(ordersOf(dir).orders)[0] as any
  check(o.history.filter((h: any) => h.status === 'FULFILLED_SIMULATED').length === 1, 'fulfilled exactly once')
  check((await bal(d.merchant)) - m0 === amount, `merchant received exactly ONE payment (${formatUnits(amount, 6)} xMXN)`)
  return { dir, txHash: r3.txHash, orderId: r3.orderId }
}

async function parent() {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].toUpperCase() : undefined
  out(`${C.b}Bills crash/restart proof: real bills service, real Moderato settlement, SIGKILL mid-settle${C.x}`)
  const driver = privateKeyToAccount(process.env.DRIVER_PRIVATE_KEY as Hex)
  const need = parseUnits(String(BILL_MXN * 2), 6)
  const have = await bal(driver.address)
  if (have < need) {
    const lp = privateKeyToAccount(process.env.LP_PRIVATE_KEY as Hex)
    const w = createWalletClient({ account: lp, chain, transport: http(RPC) })
    const h = await w.writeContract({ address: d.xMXN, abi: erc20, functionName: 'transfer', args: [driver.address, need - have] } as any)
    await pub.waitForTransactionReceipt({ hash: h })
    out(`   ${C.dim}topped up driver with ${formatUnits(need - have, 6)} xMXN from LP${C.x}`)
  }
  const results: Record<string, any> = {}
  if (!only || only === 'A') results.A = await scenarioA()
  if (!only || only === 'B') results.B = await scenarioB()
  out(`\n${C.g}${C.b}PASS${C.x}: no double charge and no double fulfillment across crashes; unresolved attempts block new challenges.`)
  const evDir = join(ROOT, 'scripts/evidence/crash-proof')
  mkdirSync(evDir, { recursive: true })
  for (const [k, v] of Object.entries(results)) copyFileSync(join(v.dir, 'orders.json'), join(evDir, `scenario-${k}-orders.json`))
  writeFileSync(join(evDir, 'transcript.txt'), log.join('\n') + '\n')
  out(`${C.dim}evidence → scripts/evidence/crash-proof/${C.x}`)
}

if (process.argv[2] === 'child') child(process.argv[3], process.argv[4] as any)
else
  parent().catch((e) => {
    out(`${C.r}${C.b}FAIL${C.x} ${e?.message ?? e}`)
    process.exit(1)
  })
