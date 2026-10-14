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
const { activeAddresses, investDeskAbi, mercadoCardAbi, multiCollateralVaultAbi, moveAmmAbi, stakedOusdAbi, demoRwaAbi, priceFeedAbi, creditPoolAbi, tip20Abi, fxOracleAdapterAbi } = shared as any
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
const fmt = (v: bigint, d = 6, digits = d === 8 ? 4 : 2) => Number(formatUnits(v, d)).toLocaleString('en-US', { maximumFractionDigits: digits })
const fmt4 = (v: bigint) => fmt(v, 6, 4)
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
      // tTBILL issuance is gated (R-042): the institution BUYS it on Mercado Invest's desk (the ecosystem loop)
      const have = await bal(t.token, lp.address)
      if (have < qty) {
        const desk: Address = (A as any).investDesk ?? (shared as any).moderatoDeployment?.v2?.investDesk
        const [px] = await read(t.feed ?? (await read(A.vault, multiCollateralVaultAbi, 'params', [t.token])).feed, priceFeedAbi, 'price')
        const ousdIn = ((qty - have) * px) / 10n ** 8n + parseUnits('5', 6) // + spread headroom
        await ensureOusd(lp.address, ousdIn, 'LP')
        await approveIfNeeded(lp, A.ousd, desk, ousdIn, 'OUSD → InvestDesk')
        const [tOut] = await read(desk, investDeskAbi, 'quoteBuy', [ousdIn])
        await send(`buy ${fmt(tOut)} tTBILL on InvestDesk for ${fmt(ousdIn)} OUSD`, lp, { address: desk, abi: investDeskAbi, functionName: 'buy', args: [ousdIn, (tOut * 995n) / 1000n] })
      }
      void demoRwaAbi
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
    title: 'Spend: a third-party underwriter bot buys a report over MPP (HTTP 402 on the v2 app), paying xMXN v2',
    async run() {
      // the v2 app over real HTTP: lead's flipped :3100, or web's v2 preview (:3101) before the flip
      const api = process.env.MERCADO_API_URL_V2 ?? 'http://localhost:3101'
      const probe = await fetch(`${api}/api/driver/score?access=underwriter`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ borrower: process.env.DRIVER_ADDRESS, profile: 'steady' }),
      }).catch(() => undefined)
      if (!probe) throw new SkipStep(`no v2 app reachable at ${api} (set MERCADO_API_URL_V2)`)
      const { Challenge } = await import('mppx')
      const ch: any = Challenge.fromResponse(probe)
      if (String(ch?.request?.currency ?? '').toLowerCase() !== A.xMXN.toLowerCase())
        throw new SkipStep(`${api} charges ${ch?.request?.currency}, not xMXN v2: that server isn't running PROTOCOL=v2`)
      ok(`${api} answers 402 in xMXN v2 → merchant ${ch.request.recipient}`)
      const { spawnSync } = await import('node:child_process')
      const r = spawnSync('npx', ['tsx', join(ROOT, 'scripts/underwriter-agent.ts')], {
        cwd: ROOT,
        env: { ...process.env, MERCADO_PROTOCOL: 'v2', MERCADO_API_URL: api },
        encoding: 'utf8',
        timeout: 300_000,
      })
      const out = (r.stdout ?? '').replace(/\x1b\[[0-9;]*m/g, '')
      for (const line of out.split('\n').filter((l) => /^(mercado|tempo|agent)\s/.test(l)).slice(0, 8)) log(`${C.dim}${line.trim()}${C.x}`)
      if (r.status !== 0) throw new Error(`underwriter-agent exited ${r.status}: ${(r.stderr || out).trim().split('\n').slice(-2).join(' | ')}`)
      const tx = out.match(/PAYMENT_TX=(0x[0-9a-fA-F]{64})/)?.[1] as Hash | undefined
      assert(tx, 'agent printed PAYMENT_TX=0x…')
      const rcpt = await pub.getTransactionReceipt({ hash: tx })
      const paid = transfersTo(rcpt, A.xMXN, A.merchant).reduce((a: bigint, e: any) => a + e.args.amount, 0n)
      assert(paid === BigInt(ch.request.amount), `on-chain xMXN v2 to merchant ${paid} == 402 amount ${ch.request.amount}`)
      assert(/no borrow attestation included/.test(out), 'paid report carried no borrow attestation')
      evidence[current].txs['underwriter MPP payment (xMXN v2)'] = txUrl(tx)
      ok(`bot paid ${fmt(paid)} xMXN v2 over 402 and got the report + Payment-Receipt  ${C.dim}${txUrl(tx)}${C.x}`)
    },
  },
  {
    id: 'V9',
    title: 'Card: issue → limit → EIP-712 tap → real xMXN v2 charge at a demo merchant → refund, incl. a frozen-card decline + single retry',
    async run() {
      const card: Address | undefined = (A as any).card ?? (shared as any).moderatoDeployment?.v2?.card
      if (!card) throw new SkipStep('deployments.v2.card missing (MercadoCard not deployed)')
      // journey cardholder = Miguel (SENDER), so the Familia demo card shown in the app stays untouched
      const holder = account('SENDER')
      const terminal = account('MERCHANT') // "Tienda Doña Mary · CDMX" demo terminal
      const sender = account('LENDER') // an unrelated account for the negative checks
      const amount = parseUnits('50', 6)
      // fund the holder with xMXN v2 through Mercado Global (vAMM mint to self) if needed
      if ((await bal(A.xMXN, holder.address)) < amount * 2n) {
        const usd = parseUnits('10', 6)
        await ensureOusd(holder.address, usd, 'Miguel')
        await approveIfNeeded(holder, A.ousd, A.vamm!, usd, 'OUSD → vamm')
        const [q] = await read(A.vamm!, moveAmmAbi, 'quote', [true, usd])
        await send('fund Miguel: 10 OUSD → xMXN v2 (vAMM mint to self)', holder, { address: A.vamm!, abi: moveAmmAbi, functionName: 'swapOusdForXmxn', args: [usd, (q * 99n) / 100n, holder.address] })
      }
      // ISSUE (once per holder; reused on later runs)
      let ids: bigint[] = await read(card, mercadoCardAbi, 'cardsOf', [holder.address])
      if (!ids.length) {
        await send('issue a Mercado Card (daily limit 1,000 xMXN)', holder, { address: card, abi: mercadoCardAbi, functionName: 'issueCard', args: [parseUnits('1000', 6)] })
        ids = await read(card, mercadoCardAbi, 'cardsOf', [holder.address])
      }
      const cardId = ids[ids.length - 1]
      // LIMIT: a real limit change by the holder (alternates 600/700 so every run writes a change)
      const before = (await read(card, mercadoCardAbi, 'getCard', [cardId])).dailyLimit as bigint
      const newLimit = before === parseUnits('600', 6) ? parseUnits('700', 6) : parseUnits('600', 6)
      await send(`holder sets the daily limit ${fmt(before)} → ${fmt(newLimit)} xMXN`, holder, { address: card, abi: mercadoCardAbi, functionName: 'setDailyLimit', args: [cardId, newLimit] })
      const c0 = await read(card, mercadoCardAbi, 'getCard', [cardId])
      assert(c0.dailyLimit === newLimit, 'on-chain daily limit updated')
      await expectRevert('limit change by a non-holder', { address: card, abi: mercadoCardAbi, functionName: 'setDailyLimit', args: [cardId, newLimit], account: sender }, ['NotHolder'])
      const m = await read(card, mercadoCardAbi, 'merchant', [terminal.address])
      assert(m[0], `terminal ${terminal.address} is an allowlisted merchant`)
      log(`card #${cardId} (demo •••• ${c0.last4}, DEMO network) held by Miguel ${holder.address} · daily limit ${fmt(c0.dailyLimit)} · available today ${fmt(c0.availableToday)}${c0.resetsAt ? ` · resets ${new Date(Number(c0.resetsAt) * 1000).toISOString()}` : ''} · merchant "${m[1]}"`)
      assert(c0.availableToday >= amount, `available today ${fmt(c0.availableToday)} ≥ 50`)
      await approveIfNeeded(holder, A.xMXN, card, amount, 'xMXN v2 → card (spending allowance)')

      const domain = { name: 'MercadoCard', version: '1', chainId: 42431, verifyingContract: card } as const
      const types = {
        Tap: [
          { name: 'cardId', type: 'uint256' },
          { name: 'holder', type: 'address' },
          { name: 'merchant', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'merchantRef', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      } as const
      const { keccak256, toHex } = await import('viem')
      const mkTap = (amt: bigint, signer = holder, deadline = BigInt(Math.floor(Date.now() / 1000) + 300)) => {
        const tap = { cardId, holder: holder.address, merchant: terminal.address, amount: amt, merchantRef: keccak256(toHex(`journey-${Date.now()}-${Math.random()}`)), nonce: BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000)), deadline }
        return signer.signTypedData({ domain, types, primaryType: 'Tap', message: tap }).then((sig) => ({ tap, sig }))
      }
      const chargeReq = (t: any, sig: `0x${string}`, amt = t.amount, caller = terminal) =>
        ({ address: card, abi: mercadoCardAbi, functionName: 'charge', args: [cardId, amt, t.merchantRef, t.nonce, t.deadline, sig], account: caller }) as const

      // the terminal can never pull funds on its own
      const good = await mkTap(amount)
      const forged = await mkTap(amount, sender)
      await expectRevert('tap signed by someone other than the holder', chargeReq(forged.tap, forged.sig), ['BadTapSignature'])
      await expectRevert('terminal charges more than the holder tapped', chargeReq(good.tap, good.sig, amount * 2n), ['BadTapSignature'])
      await expectRevert('a non-merchant submits a valid tap', chargeReq(good.tap, good.sig, amount, sender), ['NotMerchant'])
      const expired = await mkTap(amount, holder, BigInt(Math.floor(Date.now() / 1000) - 60))
      await expectRevert('expired tap', chargeReq(expired.tap, expired.sig), ['TapExpired'])
      // +5 xMXN margin: with a refilling (leaky-bucket) limit, availableToday grows ~0.0116 xMXN/s between read and sim
      const big = await mkTap(c0.availableToday + parseUnits('5', 6))
      await expectRevert('charge above what is left of the daily limit', chargeReq(big.tap, big.sig), ['OverDailyLimit'])
      await expectRevert("a non-holder tries to freeze the card", { address: card, abi: mercadoCardAbi, functionName: 'setFrozen', args: [cardId, true], account: sender }, ['NotHolder'])

      // recovery case: frozen card declines the tap, holder unfreezes, the retry succeeds exactly once
      await send('holder freezes the card', holder, { address: card, abi: mercadoCardAbi, functionName: 'setFrozen', args: [cardId, true] })
      await expectRevert('tap on a frozen card is declined', chargeReq(good.tap, good.sig), ['CardIsFrozen'])
      await send('holder unfreezes the card', holder, { address: card, abi: mercadoCardAbi, functionName: 'setFrozen', args: [cardId, false] })

      const h0 = await bal(A.xMXN, holder.address)
      const mer0 = await bal(A.xMXN, terminal.address)
      const supply0: bigint = await read(A.xMXN, tip20Abi, 'totalSupply')
      const st0 = await read(card, mercadoCardAbi, 'stats')
      const { rcpt } = await send(`terminal charges 50 xMXN v2 (holder's tap)`, terminal, chargeReq(good.tap, good.sig))
      const ev = rcpt.logs
        .filter((l: any) => l.address.toLowerCase() === card.toLowerCase())
        .map((l: any) => {
          try {
            return decodeEventLog({ abi: mercadoCardAbi, ...l }) as any
          } catch {
            return undefined
          }
        })
        .find((e: any) => e?.eventName === 'CardCharged')
      assert(ev && ev.args.amount === amount && ev.args.cardId === cardId, 'CardCharged(cardId, amount) emitted')
      assert(h0 - (await bal(A.xMXN, holder.address)) === amount, 'holder paid exactly 50')
      assert(((await read(card, mercadoCardAbi, 'getCard', [cardId])).availableToday as bigint) <= c0.availableToday - amount + parseUnits('1', 6), 'availableToday fell by the charge')
      assert((await bal(A.xMXN, terminal.address)) - mer0 === amount, 'merchant received exactly 50')
      assert((await read(A.xMXN, tip20Abi, 'totalSupply')) === supply0, 'a card charge moves xMXN; it never mints')
      const st1 = await read(card, mercadoCardAbi, 'stats')
      assert(st1[1] - st0[1] === amount, 'card stats: spent +50')
      ok(`charge #${ev.args.chargeId}: 50 xMXN v2 Miguel → "${m[1]}"; available today ${fmt((await read(card, mercadoCardAbi, 'getCard', [cardId])).availableToday)}`)
      await expectRevert('the same tap replayed', chargeReq(good.tap, good.sig), ['TapReplayed'])

      const refund = parseUnits('10', 6)
      const h1 = await bal(A.xMXN, holder.address)
      // refunds pull xMXN from the merchant back to the holder (safeTransferFrom), so the terminal approves the card first
      await approveIfNeeded(terminal, A.xMXN, card, refund, 'merchant xMXN v2 → card (refund allowance)')
      await send('merchant refunds 10 xMXN v2', terminal, { address: card, abi: mercadoCardAbi, functionName: 'refund', args: [ev.args.chargeId, refund] })
      assert((await bal(A.xMXN, holder.address)) - h1 === refund, 'holder got the 10 back')
      await expectRevert('refund more than what is left of the charge', { address: card, abi: mercadoCardAbi, functionName: 'refund', args: [ev.args.chargeId, amount], account: terminal }, ['RefundTooLarge'])
      ok('refund 10 → holder; over-refund rejected; the card network/PAN is the only simulated part (MOCKS.md A8)')
    },
  },
  {
    id: 'V10',
    title: 'Invest: a saver grows money three real ways: pesos in the credit pool, dollars in sOUSD, and T-bills on the InvestDesk',
    async run() {
      const desk: Address | undefined = (A as any).investDesk ?? (shared as any).moderatoDeployment?.v2?.investDesk
      if (!desk) throw new SkipStep('deployments.v2.investDesk missing')
      const saver = account('SAVER')
      const t = col('tTBILL')
      const s = col('sOUSD')
      // 1) Ahorro en pesos: supply xMXN v2 to CreditPool v2 (yield = realized driver fees, variable, not guaranteed)
      const pesos = parseUnits('100', 6)
      assert((await bal(A.xMXN, saver.address)) >= pesos, 'saver holds ≥100 xMXN v2')
      const lb0: bigint = await read(A.creditPool, creditPoolAbi, 'lenderBalance', [saver.address])
      await approveIfNeeded(saver, A.xMXN, A.creditPool, pesos, 'xMXN v2 → pool v2')
      await send('Ahorro en pesos: supply 100 xMXN v2 to the credit pool', saver, { address: A.creditPool, abi: creditPoolAbi, functionName: 'supply', args: [pesos] })
      const lb1: bigint = await read(A.creditPool, creditPoolAbi, 'lenderBalance', [saver.address])
      assert(lb1 - lb0 >= pesos - 1n, `lender claim grew by ~100 (${fmt(lb1 - lb0)})`)
      ok(`saver's pool claim ${fmt(lb0)} → ${fmt(lb1)} xMXN v2 (earns only realized driver fees; no guaranteed return)`)
      // 2) Ahorro en dólares: stake OUSD → sOUSD (real ERC-4626; demo-funded yield)
      const usd = parseUnits('50', 6)
      await ensureOusd(saver.address, usd, 'Saver')
      await approveIfNeeded(saver, A.ousd, s.token, usd, 'OUSD → sOUSD')
      const sh0 = await bal(s.token, saver.address)
      await send('Ahorro en dólares: stake 50 OUSD → sOUSD', saver, { address: s.token, abi: stakedOusdAbi, functionName: 'deposit', args: [usd, saver.address] })
      const shares = (await bal(s.token, saver.address)) - sh0
      const worth: bigint = await read(s.token, stakedOusdAbi, 'convertToAssets', [shares])
      assert(shares > 0n && worth >= usd - 1n, 'sOUSD shares worth ≥ the OUSD staked')
      ok(`${fmt(shares)} sOUSD, worth ${fmt(worth)} OUSD now (mock APR ${Number(await read(s.token, stakedOusdAbi, 'aprBps')) / 100}%, demo-funded)`)
      // 3) T-bills on the InvestDesk: buy with OUSD, then sell part back (buy-back limited to what you bought)
      const ousdIn = parseUnits('100', 6)
      await ensureOusd(saver.address, ousdIn, 'Saver')
      const [tOut, fee, px] = await read(desk, investDeskAbi, 'quoteBuy', [ousdIn])
      log(`quote: 100 OUSD → ${fmt4(tOut)} tTBILL at $${fmt(px, 8)} (spread fee ${fmt4(fee)} tTBILL = ${Number(await read(desk, investDeskAbi, 'spreadBps'))} bps; admin feed, demo RWA)`)
      const d = { address: desk, abi: investDeskAbi, account: saver } as const
      // the desk pulls OUSD before checking minOut, so approve first (otherwise sims revert InsufficientAllowance)
      await approveIfNeeded(saver, A.ousd, desk, ousdIn, 'OUSD → InvestDesk')
      await expectRevert('buy with minOut above the quote', { ...d, functionName: 'buy', args: [ousdIn, tOut + 1n] }, ['Slippage'])
      const maxUsd: bigint = await read(desk, investDeskAbi, 'maxTradeUsd')
      // buy() pulls OUSD before validating, so check the size cap through quoteBuy (the same check, no allowance needed)
      await expectRevert(`trade above the ${fmt(maxUsd)} USD max`, { ...d, functionName: 'quoteBuy', args: [maxUsd + parseUnits('1', 6)] }, ['TradeTooLarge'])
      const [rO0, rT0] = await read(desk, investDeskAbi, 'reserves')
      const tb0 = await bal(t.token, saver.address)
      const bought0: bigint = await read(desk, investDeskAbi, 'bought', [saver.address])
      await send(`buy tTBILL with 100 OUSD`, saver, { ...d, functionName: 'buy', args: [ousdIn, (tOut * 995n) / 1000n] })
      const got = (await bal(t.token, saver.address)) - tb0
      assert(got >= (tOut * 995n) / 1000n, 'received ≥ minOut tTBILL')
      const [rO1, rT1] = await read(desk, investDeskAbi, 'reserves')
      assert(rO1 - rO0 === ousdIn && rT0 - rT1 === got, 'desk reserves moved by exactly the trade (finite inventory, no mint)')
      const boughtNow: bigint = await read(desk, investDeskAbi, 'bought', [saver.address])
      await expectRevert('sell back more than you bought', { ...d, functionName: 'sell', args: [boughtNow + 1n, 0n] }, ['ExceedsBoughtBalance'])
      const half = got / 2n
      const [oOut] = await read(desk, investDeskAbi, 'quoteSell', [half])
      await approveIfNeeded(saver, t.token, desk, half, 'tTBILL → InvestDesk')
      const o0 = await bal(A.ousd, saver.address)
      await send(`sell ${fmt4(half)} tTBILL back`, saver, { ...d, functionName: 'sell', args: [half, (oOut * 995n) / 1000n] })
      const back = (await bal(A.ousd, saver.address)) - o0
      assert(back >= (oOut * 995n) / 1000n, 'received ≥ minOut OUSD')
      ok(`bought ${fmt4(got)} tTBILL for 100 OUSD, sold ${fmt4(half)} back for ${fmt(back)} OUSD (spread both ways); bought balance ${fmt4(bought0)} → ${fmt4(boughtNow)} → ${fmt4(await read(desk, investDeskAbi, 'bought', [saver.address]))}`)
      ok('tTBILL is a demo RWA on an admin price feed (not a security, no real T-bill); the trades and inventory are real (MOCKS.md A6)')
    },
  },
  {
    id: 'VS',
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
