/**
 * Mercado v2 journey (SPEC v0.2: Create · Move · Lend · Spend) on Tempo Moderato, for the V2-SWITCH gate.
 *
 *   PROTOCOL=v2 npx tsx scripts/demo-journey.ts            # dispatches here
 *   npx tsx scripts/demo-journey-v2.ts --steps V3,V4 --keep-going
 *
 * Addresses come ONLY from activeAddresses('v2') (packages/shared/src/protocol.ts); ABIs from @mercado/shared.
 * Lend/Spend call the real api services (credit + bills) IN-PROCESS with MERCADO_PROTOCOL=v2, so the gate can be
 * checked before lead flips the app. If a service still resolves v1 addresses, the step is recorded as SKIP
 * with the exact gap (never PASS). Bills state goes to temp files; the :3100 dev server is untouched.
 */
process.env.MERCADO_PROTOCOL = 'v2' // must be set before @mercado/shared computes ACTIVE_PROTOCOL
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import {
  type Address,
  type Hash,
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatUnits,
  http,
  parseUnits,
} from 'viem'
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const line of existsSync(join(ROOT, '.env.local')) ? readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n') : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const shared = await import('@mercado/shared')
const { activeAddresses, multiCollateralVaultAbi, moveAmmAbi, stakedOusdAbi, demoRwaAbi, priceFeedAbi, creditPoolAbi, tip20Abi, fxOracleAdapterAbi } = shared as any
const A = activeAddresses('v2')

const RPC = process.env.TEMPO_RPC_URL ?? tempoModerato.rpcUrls.default.http[0]
const EXPLORER = tempoModerato.blockExplorers.default.url
const FEE_TOKEN = (process.env.FEE_TOKEN ?? '0x20c0000000000000000000000000000000000001') as Address
const chain = tempoModerato.extend({ feeToken: FEE_TOKEN })
const args = process.argv.slice(2)
const KEEP_GOING = args.includes('--keep-going')
const ONLY = args.includes('--steps') ? new Set(args[args.indexOf('--steps') + 1].split(',').map((s) => s.trim().toUpperCase())) : undefined
const col = (sym: string) => A.collaterals.find((c: any) => c.symbol === sym)!

// ---------- logging / evidence ----------
const C = { dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', c: '\x1b[36m', x: '\x1b[0m' }
const fmt = (v: bigint, d = 6) => Number(formatUnits(v, d)).toLocaleString('en-US', { maximumFractionDigits: d === 8 ? 4 : 2 })
const pct = (bps: bigint) => (bps > 10n ** 12n ? '∞' : `${(Number(bps) / 100).toFixed(1)}%`)
const txUrl = (h: Hash) => `${EXPLORER}/tx/${h}`
const log = (s = '') => console.log(`   ${s}`)
const ok = (s: string) => console.log(`   ${C.g}✓${C.x} ${s}`)
const warn = (s: string) => console.log(`   ${C.y}!${C.x} ${s}`)
const evidence: Record<string, { status: 'pass' | 'fail' | 'skip'; txs: Record<string, string>; notes: string[]; error?: string }> = {}
let current = ''
const note = (s: string) => evidence[current]?.notes.push(s)
class SkipStep extends Error {}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
}
const short = (e: any) => String(e?.shortMessage ?? e?.message ?? e).split('\n')[0].slice(0, 200)

// ---------- chain helpers ----------
const pub = createPublicClient({ chain, transport: http(RPC) })
function account(role: string): PrivateKeyAccount {
  const pk = process.env[`${role}_PRIVATE_KEY`]
  if (!pk) throw new Error(`${role}_PRIVATE_KEY missing from .env.local`)
  return privateKeyToAccount(pk as `0x${string}`)
}
const read = (address: Address, abi: any, functionName: string, args: readonly unknown[] = []) => pub.readContract({ address, abi, functionName, args } as any) as Promise<any>
const bal = (token: Address, who: Address) => read(token, tip20Abi, 'balanceOf', [who]) as Promise<bigint>

async function send(label: string, acct: PrivateKeyAccount, req: { address: Address; abi: any; functionName: string; args?: readonly unknown[] }) {
  const wallet = createWalletClient({ account: acct, chain, transport: http(RPC) })
  const { request } = await pub.simulateContract({ ...req, account: acct } as any)
  const hash = await wallet.writeContract(request as any)
  const rcpt = await pub.waitForTransactionReceipt({ hash })
  if (rcpt.status !== 'success') throw new Error(`${label} reverted on-chain: ${txUrl(hash)}`)
  ok(`${label}  ${C.dim}${txUrl(hash)}${C.x}`)
  evidence[current].txs[label] = txUrl(hash)
  return { hash, rcpt }
}
async function approveIfNeeded(acct: PrivateKeyAccount, token: Address, spender: Address, amount: bigint, label: string) {
  if ((await read(token, tip20Abi, 'allowance', [acct.address, spender])) >= amount) return
  await send(`approve ${label}`, acct, { address: token, abi: tip20Abi, functionName: 'approve', args: [spender, amount] })
}
async function ensureOusd(who: Address, need: bigint, label: string) {
  if ((await bal(A.ousd, who)) >= need) return
  warn(`${label} short of OUSD; calling the faucet`)
  await pub.request({ method: 'tempo_fundAddress' as any, params: [who] as any })
  for (let i = 0; i < 20 && (await bal(A.ousd, who)) < need; i++) await new Promise((r) => setTimeout(r, 1000))
  assert((await bal(A.ousd, who)) >= need, `${label} still short of OUSD after faucet`)
}
/** Negative check by simulation: passes only on a genuine contract revert with one of the expected custom errors. */
async function expectRevert(what: string, req: { address: Address; abi: any; functionName: string; args?: readonly unknown[]; account: PrivateKeyAccount }, expected: string[]) {
  try {
    await pub.simulateContract(req as any)
  } catch (e) {
    const revert = e instanceof BaseError ? (e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null) : null
    if (!revert) throw new Error(`${what}: expected a contract revert, got: ${short(e)}`)
    const name = revert.data?.errorName ?? revert.signature ?? 'unknown'
    if (!expected.includes(name)) throw new Error(`${what}: reverted with ${name}, expected ${expected.join(' | ')}`)
    ok(`${what} reverts with ${name}`)
    return
  }
  throw new Error(`${what} did NOT revert`)
}
function transfersTo(rcpt: any, token: Address, to: Address) {
  return rcpt.logs
    .filter((l: any) => l.address.toLowerCase() === token.toLowerCase())
    .map((l: any) => {
      try {
        return decodeEventLog({ abi: tip20Abi, ...l }) as any
      } catch {
        return undefined
      }
    })
    .filter((e: any) => e?.eventName === 'Transfer' && e.args.to.toLowerCase() === to.toLowerCase())
}

/** xMXN v2 supply identity: every token in circulation is either CDP debt or AMM liability. */
async function supplyIdentity() {
  const supply: bigint = await read(A.xMXN, tip20Abi, 'totalSupply')
  let debt = 0n
  for (const c of A.collaterals) debt += (await read(A.vault, multiCollateralVaultAbi, 'totals', [c.token]))[1]
  const liability: bigint = await read(A.vamm!, moveAmmAbi, 'liability')
  return { supply, debt, liability, ok: supply === debt + liability }
}
async function ammState() {
  const [reserve, liability, equity, coverageBps, redeemedToday, redeemCap] = await read(A.vamm!, moveAmmAbi, 'state')
  return { reserve, liability, equity, coverageBps, redeemedToday, redeemCap } as Record<string, bigint>
}

// ---------- in-process api services (same code the app runs), pinned to v2 ----------
let bills: any
async function billsService() {
  if (bills) return bills
  const dir = mkdtempSync(join(tmpdir(), 'mercado-v2-bills-'))
  process.env.MERCADO_ORDERS_FILE = join(dir, 'orders.json')
  process.env.MERCADO_MPPX_STORE_FILE = join(dir, 'mppx-store.json')
  process.env.MPP_SECRET_KEY ??= randomBytes(32).toString('hex')
  bills = await import('../apps/web/lib/server/bills/service.ts')
  return bills
}

// ---------- steps ----------
type Ctx = { borrowed?: bigint }
const STEPS: { id: string; title: string; run: (ctx: Ctx) => Promise<void> }[] = [
  {
    id: 'V0',
    title: 'Preflight: v2 addresses, feeds, AMM solvency, supply identity',
    async run() {
      assert((await pub.getChainId()) === 42431, 'chain 42431')
      const named: [string, Address | undefined][] = [
        ['xMXN v2', A.xMXN],
        ['vault (MultiCollateral)', A.vault],
        ['vamm (MoveAMM)', A.vamm],
        ['creditPool v2', A.creditPool],
        ...A.collaterals.map((c: any) => [`${c.symbol} token`, c.token] as [string, Address]),
      ]
      for (const [n, a] of named) {
        const code = a ? await pub.getCode({ address: a }) : undefined
        assert(code && code !== '0x', `${n} has code at ${a}`)
        log(`${n.padEnd(24)} ${a}  ${C.dim}${EXPLORER}/address/${a}${C.x}`)
      }
      const [mxn, at] = await read(A.oracle, fxOracleAdapterAbi, 'price')
      ok(`FX ${fmt(mxn, 8)} MXN/USD (mock admin feed, ${Math.round(Date.now() / 1000 - Number(at))}s old)`)
      for (const c of A.collaterals) {
        const p = await read(A.vault, multiCollateralVaultAbi, 'params', [c.token])
        const [px] = await read(p.feed, priceFeedAbi, 'price')
        const [tc, td] = await read(A.vault, multiCollateralVaultAbi, 'totals', [c.token])
        ok(
          `${c.symbol.padEnd(6)} $${fmt(px, 8)} · mint ≥${pct(BigInt(p.mintRatioBps))} · liq <${pct(BigInt(p.liqRatioBps))} · ceiling ${fmt(p.debtCeiling)} · debt ${fmt(td)} on ${fmt(tc)}${c.demo ? ` · ${C.y}${c.label}${C.x}` : ''}`,
        )
      }
      const s = await ammState()
      ok(`AMM reserve ${fmt(s.reserve)} OUSD (equity ${fmt(s.equity)}) vs liability ${fmt(s.liability)} xMXN → coverage ${pct(s.coverageBps)}; redeem bucket ${fmt(s.redeemedToday)}/${fmt(s.redeemCap)}`)
      assert(s.coverageBps >= 10_000n, 'AMM coverage ≥ 100% before the journey')
      const si = await supplyIdentity()
      assert(si.ok, `supply identity: totalSupply ${si.supply} == CDP debt ${si.debt} + AMM liability ${si.liability}`)
      ok(`supply identity: ${fmt(si.supply)} xMXN v2 = ${fmt(si.debt)} CDP debt + ${fmt(si.liability)} AMM liability`)
      ok(`pool v2 cash ${fmt(await read(A.creditPool, creditPoolAbi, 'availableLiquidity'))} xMXN v2`)
    },
  },
  {
    id: 'V1',
    title: 'Create: institution stakes OUSD → sOUSD (demo, mock yield) and mints xMXN v2 against it',
    async run() {
      const lp = account('LP')
      const s = col('sOUSD')
      const assets = parseUnits('200', 6)
      await ensureOusd(lp.address, assets, 'LP')
      const pps0: bigint = await read(s.token, stakedOusdAbi, 'convertToAssets', [10n ** 6n])
      log(`sOUSD share price ${fmt(pps0)} OUSD (APR ${Number(await read(s.token, stakedOusdAbi, 'aprBps')) / 100}% mock, labeled demo)`)
      await approveIfNeeded(lp, A.ousd, s.token, assets, 'OUSD → sOUSD')
      const sh0 = await bal(s.token, lp.address)
      await send(`stake 200 OUSD → sOUSD`, lp, { address: s.token, abi: stakedOusdAbi, functionName: 'deposit', args: [assets, lp.address] })
      const shares = (await bal(s.token, lp.address)) - sh0
      assert(shares > 0n, 'received sOUSD shares')
      ok(`received ${fmt(shares)} sOUSD`)
      const [c0, d0] = await read(A.vault, multiCollateralVaultAbi, 'getPosition', [lp.address, s.token])
      await approveIfNeeded(lp, s.token, A.vault, shares, 'sOUSD → vault')
      await send(`depositCollateral ${fmt(shares)} sOUSD`, lp, { address: A.vault, abi: multiCollateralVaultAbi, functionName: 'depositCollateral', args: [s.token, shares] })
      // mint against THIS deposit at 250% (the existing position's ratio moves with FX), capped by maxMintable
      const value: bigint = await read(A.vault, multiCollateralVaultAbi, 'collateralValue', [s.token, shares])
      const maxM0: bigint = await read(A.vault, multiCollateralVaultAbi, 'maxMintable', [lp.address, s.token])
      const amount = [(value * 10_000n) / 25_000n, maxM0].reduce((a, b) => (b < a ? b : a))
      void c0; void d0
      assert(amount > 0n, `room to mint (maxMintable ${fmt(maxM0)})`)
      const supply0: bigint = await read(A.xMXN, tip20Abi, 'totalSupply')
      await send(`mint ${fmt(amount)} xMXN v2 against sOUSD`, lp, { address: A.vault, abi: multiCollateralVaultAbi, functionName: 'mint', args: [s.token, amount] })
      assert((await read(A.xMXN, tip20Abi, 'totalSupply')) - supply0 === amount, 'xMXN v2 supply grew by exactly the minted debt')
      const ratio = await read(A.vault, multiCollateralVaultAbi, 'collateralRatio', [lp.address, s.token])
      ok(`this deposit: 200 sOUSD worth ${fmt(value)} xMXN at ${fmt(await read(A.oracle, fxOracleAdapterAbi, 'price').then((x: any) => x[0]), 8)} MXN/USD → minted ${fmt(amount)} (250% on the deposit); whole LP sOUSD position now ${pct(ratio)}`)
      const v = { address: A.vault, abi: multiCollateralVaultAbi, account: lp } as const
      const maxM: bigint = await read(A.vault, multiCollateralVaultAbi, 'maxMintable', [lp.address, s.token])
      await expectRevert('mint above the sOUSD 150% limit', { ...v, functionName: 'mint', args: [s.token, maxM + 1_000_000n] }, ['RatioTooLow'])
      const maxW: bigint = await read(A.vault, multiCollateralVaultAbi, 'maxWithdrawable', [lp.address, s.token])
      await expectRevert('withdraw sOUSD past maxWithdrawable', { ...v, functionName: 'withdrawCollateral', args: [s.token, maxW + 1n] }, ['RatioTooLow'])
      await expectRevert('direct xMXN v2 mint by a non-issuer', { address: A.xMXN, abi: tip20Abi, functionName: 'mint', args: [lp.address, 1_000_000n], account: lp }, ['Unauthorized'])
      const si = await supplyIdentity()
      assert(si.ok, 'supply identity holds after the mint')
      ok('supply identity still holds')
    },
  },
  {
    id: 'V2',
    title: 'Create: demo tokenized T-bill (tTBILL, RWA haircut) as collateral',
    async run() {
      const lp = account('LP')
      const t = col('tTBILL')
      const p = await read(A.vault, multiCollateralVaultAbi, 'params', [t.token])
      const qty = parseUnits('10', 6)
      if ((await bal(t.token, lp.address)) < qty) await send('tTBILL faucet 10 (demo, not a security)', lp, { address: t.token, abi: demoRwaAbi, functionName: 'faucet', args: [qty] })
      const [c0, d0] = await read(A.vault, multiCollateralVaultAbi, 'getPosition', [lp.address, t.token])
      await approveIfNeeded(lp, t.token, A.vault, qty, 'tTBILL → vault')
      await send('depositCollateral 10 tTBILL', lp, { address: A.vault, abi: multiCollateralVaultAbi, functionName: 'depositCollateral', args: [t.token, qty] })
      // mint against THIS deposit at 300% (above the RWA's 200% mint ratio), capped by maxMintable
      const value: bigint = await read(A.vault, multiCollateralVaultAbi, 'collateralValue', [t.token, qty])
      const maxM0: bigint = await read(A.vault, multiCollateralVaultAbi, 'maxMintable', [lp.address, t.token])
      const amount = [(value * 10_000n) / 30_000n, maxM0].reduce((a, b) => (b < a ? b : a))
      void c0; void d0
      assert(amount > 0n, `room to mint (maxMintable ${fmt(maxM0)})`)
      await send(`mint ${fmt(amount)} xMXN v2 against tTBILL`, lp, { address: A.vault, abi: multiCollateralVaultAbi, functionName: 'mint', args: [t.token, amount] })
      ok(`this deposit: 10 tTBILL worth ${fmt(value)} xMXN → minted ${fmt(amount)} (300% on the deposit); whole tTBILL position ${pct(await read(A.vault, multiCollateralVaultAbi, 'collateralRatio', [lp.address, t.token]))} (RWA mint ratio ${pct(BigInt(p.mintRatioBps))}, liq <${pct(BigInt(p.liqRatioBps))})`)
      const maxM: bigint = await read(A.vault, multiCollateralVaultAbi, 'maxMintable', [lp.address, t.token])
      await expectRevert(`mint above the tTBILL ${pct(BigInt(p.mintRatioBps))} limit`, { address: A.vault, abi: multiCollateralVaultAbi, functionName: 'mint', args: [t.token, maxM + 1_000_000n], account: lp }, ['RatioTooLow', 'DebtCeilingExceeded'])
      // positions are independent: the sOUSD position is unaffected by the tTBILL one
      const sR = await read(A.vault, multiCollateralVaultAbi, 'collateralRatio', [lp.address, col('sOUSD').token])
      ok(`independent positions: LP's sOUSD position still at ${pct(sR)}`)
    },
  },
  {
    id: 'V3',
    title: 'Move: US sender swaps OUSD → xMXN v2 minted straight to the recipient (one tx)',
    async run() {
      const sender = account('SENDER')
      const rosa = process.env.RECIPIENT_ADDRESS as Address
      const amountIn = parseUnits('50', 6)
      await ensureOusd(sender.address, amountIn, 'Sender')
      const [out, fee, mid, impactBps] = await read(A.vamm!, moveAmmAbi, 'quote', [true, amountIn])
      const minOut = out - (out * 50n) / 10_000n
      log(`quote: 50 OUSD → ${fmt(out)} xMXN v2 · oracle mid ${fmt(mid, 8)} · fee ${fmt(fee)} · size impact ${Number(impactBps)} bps · minOut ${fmt(minOut)}`)
      const am = { address: A.vamm!, abi: moveAmmAbi, account: sender } as const
      await expectRevert('swap with minOut above the quote', { ...am, functionName: 'swapOusdForXmxn', args: [amountIn, out + 1n, rosa] }, ['Slippage'])
      const maxUsd: bigint = await read(A.vamm!, moveAmmAbi, 'maxSwapUsd')
      await expectRevert(`swap above the ${fmt(maxUsd)} USD per-swap max`, { ...am, functionName: 'swapOusdForXmxn', args: [maxUsd + 1_000_000n, 0n, rosa] }, ['SwapTooLarge'])
      await approveIfNeeded(sender, A.ousd, A.vamm!, amountIn, 'OUSD → vamm')
      const s0 = await ammState()
      const supply0: bigint = await read(A.xMXN, tip20Abi, 'totalSupply')
      const rosa0 = await bal(A.xMXN, rosa)
      const senderX0 = await bal(A.xMXN, sender.address)
      const { rcpt } = await send('swapOusdForXmxn 50 OUSD → Rosa', sender, { ...am, functionName: 'swapOusdForXmxn', args: [amountIn, minOut, rosa] })
      const got = (await bal(A.xMXN, rosa)) - rosa0
      assert(got >= minOut, `Rosa received ${got} ≥ minOut ${minOut}`)
      assert((await bal(A.xMXN, sender.address)) === senderX0, 'xMXN went straight to the recipient, not via the sender')
      const minted = transfersTo(rcpt, A.xMXN, rosa).filter((e: any) => /^0x0{40}$/i.test(e.args.from))
      assert(minted.length > 0, 'delivery is a MINT (Transfer from 0x0) to the recipient, not inventory')
      assert((await read(A.xMXN, tip20Abi, 'totalSupply')) - supply0 === got, 'xMXN v2 supply grew by exactly what Rosa received')
      const s1 = await ammState()
      assert(s1.reserve - s0.reserve === amountIn, `AMM reserve +${fmt(s1.reserve - s0.reserve)} OUSD == amountIn`)
      assert(s1.liability - s0.liability === got, 'AMM liability grew by the minted amount')
      ok(`Rosa received ${fmt(got)} xMXN v2 (minted); AMM reserve ${fmt(s0.reserve)} → ${fmt(s1.reserve)} OUSD, liability ${fmt(s0.liability)} → ${fmt(s1.liability)}, coverage ${pct(s1.coverageBps)}`)
      assert((await supplyIdentity()).ok, 'supply identity holds after the mint-swap')
      ok('supply identity still holds (CDP debt + AMM liability)')
    },
  },
  {
    id: 'V4',
    title: 'Move: recipient redeems xMXN v2 → OUSD (burn), bounded by liability and the redeem bucket',
    async run() {
      const rosa = account('RECIPIENT')
      const amountIn = parseUnits('200', 6)
      assert((await bal(A.xMXN, rosa.address)) >= amountIn, 'Rosa holds ≥200 xMXN v2 (run V3 first)')
      const [out, fee, mid, impactBps] = await read(A.vamm!, moveAmmAbi, 'quote', [false, amountIn])
      const minOut = out - (out * 50n) / 10_000n
      log(`quote: 200 xMXN v2 → ${fmt(out)} OUSD · mid ${fmt(mid, 8)} · fee ${fmt(fee)} · impact ${Number(impactBps)} bps`)
      const s0 = await ammState()
      const am = { address: A.vamm!, abi: moveAmmAbi, account: rosa } as const
      await expectRevert('redeem more than the AMM liability', { ...am, functionName: 'swapXmxnForOusd', args: [s0.liability + 1n, 0n, rosa.address] }, ['ExceedsLiability', 'SwapTooLarge', 'RedeemCapExceeded'])
      await approveIfNeeded(rosa, A.xMXN, A.vamm!, amountIn, 'xMXN v2 → vamm')
      const supply0: bigint = await read(A.xMXN, tip20Abi, 'totalSupply')
      const o0 = await bal(A.ousd, rosa.address)
      await send('swapXmxnForOusd 200 xMXN v2 (burn)', rosa, { ...am, functionName: 'swapXmxnForOusd', args: [amountIn, minOut, rosa.address] })
      const gotUsd = (await bal(A.ousd, rosa.address)) - o0
      assert(gotUsd >= minOut, `received ${gotUsd} ≥ minOut`)
      assert(supply0 - (await read(A.xMXN, tip20Abi, 'totalSupply')) === amountIn, 'xMXN v2 supply shrank by exactly the redeemed amount (burned)')
      const s1 = await ammState()
      assert(s0.reserve - s1.reserve === gotUsd, 'AMM reserve paid out exactly what Rosa received')
      assert(s0.liability - s1.liability === amountIn, 'AMM liability fell by the redeemed amount')
      assert(s1.redeemedToday > s0.redeemedToday || s1.redeemedToday >= gotUsd, 'redeem bucket recorded the outflow')
      ok(`Rosa got ${fmt(gotUsd)} OUSD; 200 xMXN v2 burned; reserve ${fmt(s0.reserve)} → ${fmt(s1.reserve)}; coverage ${pct(s1.coverageBps)}; bucket ${fmt(s1.redeemedToday)}/${fmt(s1.redeemCap)}`)
      assert((await supplyIdentity()).ok, 'supply identity holds after the burn')
      ok('supply identity still holds')
    },
  },
  {
    id: 'V5',
    title: 'Lend: driver gets a v2-bound attestation (credit service, in-process) and borrows from CreditPool v2',
    async run(ctx) {
      const driver = account('DRIVER')
      const credit = await import('../apps/web/lib/server/credit/index.ts')
      const s = await credit.assessDriver(driver.address, 'steady')
      assert(s.demo === true && s.eligible, 'steady driver eligible, demo-labeled')
      const att = s.attestation
      if (!att) throw new SkipStep(`credit service issued no attestation for v2 (${s.explanation?.slice(-1)[0] ?? 'no reason'}) → @api`)
      if (String(att.pool).toLowerCase() !== A.creditPool.toLowerCase())
        throw new SkipStep(`credit service signs for pool ${att.pool}, not CreditPool v2 ${A.creditPool}: api's credit service isn't on activeAddresses() yet → @api`)
      const maxAmount = BigInt(att.maxAmount)
      const capacity = s.availableToBorrow !== undefined ? BigInt(s.availableToBorrow) : maxAmount
      const amount = [maxAmount, capacity, parseUnits('500', 6)].reduce((a, b) => (b < a ? b : a))
      const args = [amount, maxAmount, BigInt(att.expiry), BigInt(att.nonce), att.dataHash, att.signature] as const
      const sim = { address: A.creditPool, abi: creditPoolAbi, functionName: 'borrow', account: driver } as const
      await expectRevert('tampered attestation', { ...sim, args: [amount, maxAmount + 1n, ...args.slice(2)] }, ['InvalidSigner'])
      const d0: bigint = await read(A.creditPool, creditPoolAbi, 'getDebt', [driver.address])
      await send(`borrow ${fmt(amount)} xMXN v2`, driver, { ...sim, args })
      const d1: bigint = await read(A.creditPool, creditPoolAbi, 'getDebt', [driver.address])
      const feeBps: bigint = await read(A.creditPool, creditPoolAbi, 'feeBps')
      assert(d1 - d0 === amount + (amount * feeBps + 9_999n) / 10_000n, 'debt grew by amount + fee')
      await expectRevert('replayed attestation', { ...sim, args: [1_000_000n, ...args.slice(1)] }, ['NonceAlreadyUsed'])
      ok(`driver debt ${fmt(d0)} → ${fmt(d1)} xMXN v2`)
      ctx.borrowed = amount
    },
  },
  {
    id: 'V6',
    title: 'Spend: Telcel airtime via a real MPP 402 settled in xMXN v2 (bills service, in-process)',
    async run() {
      const driver = account('DRIVER')
      const svc = await billsService()
      const q = await svc.createQuote({ provider: 'telcel', phone: '5512345678', amountMxn: 100 })
      if (String(q.token).toLowerCase() !== A.xMXN.toLowerCase())
        throw new SkipStep(`bills service charges ${q.tokenSymbol} ${q.token}, not xMXN v2 ${A.xMXN}: mpp/server billPaymentToken() isn't on activeAddresses() yet → @api`)
      assert(q.simulated === true, 'quote labeled simulated')
      assert((await bal(A.xMXN, driver.address)) >= BigInt(q.amount), 'driver holds enough xMXN v2 (run V5 first)')
      const key = { quoteId: q.quoteId, idempotencyKey: `v2-journey-${Date.now()}` }
      const req = (h: Record<string, string> = {}) =>
        new Request('http://mercado.local/api/bills/pay', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(key) })
      const unpaid = await svc.payBill(req(), key)
      assert(unpaid.kind === 'challenge' && unpaid.response.status === 402, 'unpaid → 402 challenge')
      assert(/^payment /i.test(unpaid.response.headers.get('www-authenticate') ?? ''), 'WWW-Authenticate: Payment')
      ok('unpaid → 402 Payment Required')
      const { Mppx, tempo } = await import('mppx/client')
      const mppx = Mppx.create({
        polyfill: false,
        methods: [tempo({ account: driver, mode: 'pull', expectedChainId: 42431, expectedRecipients: [A.merchant], getClient: () => createWalletClient({ account: driver, chain, transport: http(RPC) }) })],
      })
      const m0 = await bal(A.xMXN, A.merchant)
      const paid = await svc.payBill(req({ Authorization: await mppx.createCredential(unpaid.response) }), key)
      assert(paid.kind === 'ok' && paid.body.status === 'FULFILLED_SIMULATED', `paid → ${paid.body?.status}`)
      const tx = paid.body.receipt.txHash as Hash
      evidence[current].txs['MPP payment (xMXN v2)'] = txUrl(tx)
      const rcpt = await pub.getTransactionReceipt({ hash: tx })
      const amt = transfersTo(rcpt, A.xMXN, A.merchant).reduce((a: bigint, e: any) => a + e.args.amount, 0n)
      assert(amt === BigInt(q.amount), `on-chain xMXN v2 to merchant ${amt} == quoted ${q.amount}`)
      ok(`paid ${fmt(amt)} xMXN v2 → merchant on-chain ${C.dim}${txUrl(tx)}${C.x}; SIMULATED ref ${paid.body.fulfillment?.reference}`)
      const again = await svc.payBill(req(), key)
      assert(again.kind === 'ok' && again.body.orderId === paid.body.orderId, 'retry → same order')
      assert((await bal(A.xMXN, A.merchant)) - m0 === amt, 'retry did not charge again')
      ok('idempotent retry: same order, no second charge')
    },
  },
  {
    id: 'V7',
    title: 'Lend: driver repays CreditPool v2; fees realized',
    async run() {
      const driver = account('DRIVER')
      const debt: bigint = await read(A.creditPool, creditPoolAbi, 'getDebt', [driver.address])
      if (debt === 0n) throw new SkipStep('driver has no v2 debt (V5 did not borrow)')
      const st0 = await read(A.creditPool, creditPoolAbi, 'stats')
      const have = await bal(A.xMXN, driver.address)
      if (have < debt) {
        warn(`driver holds ${fmt(have)}, owes ${fmt(debt)}; LP sends the gap (stand-in for next week's earnings)`)
        await send(`top-up ${fmt(debt - have)} xMXN v2 LP → Driver`, account('LP'), { address: A.xMXN, abi: tip20Abi, functionName: 'transfer', args: [driver.address, debt - have] })
      }
      await approveIfNeeded(driver, A.xMXN, A.creditPool, debt, 'xMXN v2 → pool v2')
      await send(`repay ${fmt(debt)} xMXN v2`, driver, { address: A.creditPool, abi: creditPoolAbi, functionName: 'repay', args: [debt] })
      assert((await read(A.creditPool, creditPoolAbi, 'getDebt', [driver.address])) === 0n, 'debt → 0')
      const st1 = await read(A.creditPool, creditPoolAbi, 'stats')
      assert(st1[3] > st0[3], 'realized fees increased')
      ok(`debt ${fmt(debt)} → 0; realized fees ${fmt(st0[3])} → ${fmt(st1[3])} xMXN v2`)
    },
  },
  {
    id: 'V8',
    title: 'FX stress on v2 (runs last): liquidation enforceable, AMM coverage under appreciation, full restore',
    async run() {
      const script = join(ROOT, 'packages/contracts/script/StressDemoV2.s.sol')
      if (!existsSync(script)) throw new SkipStep('StressDemoV2.s.sol not there yet (pending @contracts)')
      const [pxBefore] = await read(A.oracle, fxOracleAdapterAbi, 'peek')
      const fromBlock = await pub.getBlockNumber()
      const forge = process.env.FORGE_BIN ?? join(process.env.HOME ?? '', '.foundry/bin/forge')
      log(`running StressDemoV2 (pause AMM+desk → 160% v2 position → forceSet −30% → liquidate → restore → unpause)`)
      const { spawnSync } = await import('node:child_process')
      const r = spawnSync(forge, ['script', 'script/StressDemoV2.s.sol', '--rpc-url', RPC, '--broadcast'], {
        cwd: join(ROOT, 'packages/contracts'),
        env: process.env,
        encoding: 'utf8',
        timeout: 400_000,
      })
      if (r.status !== 0) throw new Error(`StressDemoV2.s.sol exited ${r.status}: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ')}`)
      const out = r.stdout ?? ''
      const borrower = out.match(/STRESS_BORROWER=\s*(0x[0-9a-fA-F]{40})/)?.[1]
      const liquidator = out.match(/STRESS_LIQUIDATOR=\s*(0x[0-9a-fA-F]{40})/)?.[1]
      assert(borrower && liquidator, 'StressDemoV2 prints STRESS_BORROWER=0x… and STRESS_LIQUIDATOR=0x…')
      for (const line of out.split('\n').filter((l) => /coverage|forceSet|stress px|restor/i.test(l)).slice(0, 6)) log(`${C.dim}${line.trim()}${C.x}`)
      const logs = await pub.getContractEvents({ address: A.vault, abi: multiCollateralVaultAbi, eventName: 'Liquidated', fromBlock } as any)
      const mine = (logs as any[]).filter((l) => l.args.user?.toLowerCase() === borrower.toLowerCase() && l.args.liquidator?.toLowerCase() === liquidator.toLowerCase())
      assert(mine.length > 0, `Liquidated(user=${borrower}, liquidator=${liquidator}) on the v2 vault`)
      for (const l of mine) {
        evidence[current].txs[`liquidation ${borrower.slice(0, 8)}`] = txUrl(l.transactionHash)
        ok(`liquidated ${borrower}: covered ${fmt(l.args.debtCovered)} xMXN v2, seized ${fmt(l.args.collateralSeized)} ${A.collaterals.find((c: any) => c.token.toLowerCase() === String(l.args.token).toLowerCase())?.symbol ?? ''}  ${C.dim}${txUrl(l.transactionHash)}${C.x}`)
      }
      const [pxAfter] = await read(A.oracle, fxOracleAdapterAbi, 'peek')
      assert(pxAfter === pxBefore, `oracle restored to ${fmt(pxBefore, 8)} (now ${fmt(pxAfter, 8)})`)
      assert(!(await read(A.vamm!, moveAmmAbi, 'paused')), 'MoveAMM unpaused after the stress run')
      const v1 = activeAddresses('v1')
      if (v1.swapDesk) assert(!(await read(v1.swapDesk, [{ type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] }], 'paused')), 'v1 SwapDesk unpaused')
      const st = await ammState()
      ok(`oracle back at ${fmt(pxAfter, 8)} MXN/USD; AMM + desk unpaused; AMM coverage ${pct(st.coverageBps)}`)
      assert((await supplyIdentity()).ok, 'supply identity holds after liquidation (burned debt)')
      ok('supply identity still holds')
    },
  },
]

async function main() {
  console.log(`${C.b}Mercado v2 journey on Tempo Moderato${C.x}  ${C.dim}(PROTOCOL=v2 · testnet · demo collateral · mock oracle · SIMULATED fulfillment)${C.x}\n`)
  const ctx: Ctx = {}
  let failed = 0
  let skipped = 0
  for (const step of STEPS) {
    if (ONLY && !ONLY.has(step.id) && step.id !== 'V0') continue
    current = step.id
    evidence[step.id] = { status: 'pass', txs: {}, notes: [] }
    console.log(`${C.c}${C.b}[${step.id}]${C.x} ${C.b}${step.title}${C.x}`)
    const t0 = Date.now()
    try {
      await step.run(ctx)
      console.log(`   ${C.g}${C.b}PASS${C.x} ${C.dim}${((Date.now() - t0) / 1000).toFixed(1)}s${C.x}\n`)
    } catch (e: any) {
      if (e instanceof SkipStep) {
        skipped++
        evidence[step.id].status = 'skip'
        evidence[step.id].error = e.message
        console.log(`   ${C.y}${C.b}SKIP${C.x} ${e.message}\n`)
        continue
      }
      failed++
      evidence[step.id].status = 'fail'
      evidence[step.id].error = short(e)
      console.log(`   ${C.r}${C.b}FAIL${C.x} ${short(e)}\n`)
      if (process.env.DEBUG) console.error(e)
      if (!KEEP_GOING) break
    }
  }
  const outDir = join(ROOT, 'scripts/evidence')
  mkdirSync(outDir, { recursive: true })
  const run = JSON.stringify({ at: new Date().toISOString(), protocol: 'v2', steps: ONLY ? [...ONLY] : 'all', evidence }, null, 2)
  writeFileSync(join(outDir, 'v2-last-run.json'), run)
  writeFileSync(join(outDir, `v2-run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), run)
  console.log(
    failed ? `${C.r}${failed} failed${skipped ? `, ${skipped} skipped` : ''}${C.x}` : skipped ? `${C.y}No failures, ${skipped} SKIPPED (not a full pass)${C.x}` : `${C.g}${C.b}All v2 steps passed${C.x}`,
    `${C.dim}evidence → scripts/evidence/v2-last-run.json${C.x}`,
  )
  process.exit(failed ? 1 : skipped ? 2 : 0)
}

await main().catch((e) => {
  console.error(`fatal: ${short(e)}`)
  process.exit(1)
})
