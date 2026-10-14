/**
 * Mercado end-to-end journey (SPEC §0, steps 1→6) on Tempo Moderato.
 *
 *   npx tsx scripts/demo-journey.ts                 # run everything
 *   npx tsx scripts/demo-journey.ts --steps J4,J5   # run a subset
 *   npx tsx scripts/demo-journey.ts --keep-going    # don't stop at the first failure
 *   npx tsx scripts/demo-journey.ts --steps J0      # pre-demo health check only (auto-heals; --no-heal to just report)
 *
 * Needs: root .env.local (testnet keys), packages/shared/src/deployments/42431.json,
 * and the app running at MERCADO_API_URL (default http://localhost:3100) for J4/J5.
 * Coded against INTERFACES.md. ABIs are inlined as human-readable fragments, so the
 * script doesn't depend on the generated ABI exports.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  type Hash,
  type PublicClient,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatUnits,
  http,
  maxUint256,
  parseAbi,
  parseUnits,
} from 'viem'
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------- env / config ----------

function loadEnv(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}
loadEnv(join(ROOT, '.env.local'))

const API = process.env.MERCADO_API_URL ?? 'http://localhost:3100'
const RPC = process.env.TEMPO_RPC_URL ?? tempoModerato.rpcUrls.default.http[0]
const EXPLORER = tempoModerato.blockExplorers.default.url
// Fee token for every tx: AlphaUSD by default (matches shared FEE_TOKEN) (faucet-funded). Override with FEE_TOKEN.
const FEE_TOKEN = (process.env.FEE_TOKEN ?? '0x20c0000000000000000000000000000000000001') as Address
const chain = tempoModerato.extend({ feeToken: FEE_TOKEN })

const args = process.argv.slice(2)
const KEEP_GOING = args.includes('--keep-going')
// J0 tops up desk/pool/oracle when below these floors unless --no-heal (pre-demo health check)
const HEAL = !args.includes('--no-heal')
const FLOOR = {
  deskXmxn: parseUnits('5000', 6),
  deskOusd: parseUnits('250', 6),
  poolLiquidity: parseUnits('2000', 6),
  oracleMinHeadroomSec: 900, // refresh if it would go stale within 15 min (i.e. mid-demo)
}
const ONLY = (() => {
  const i = args.indexOf('--steps')
  return i >= 0 ? new Set(args[i + 1].split(',').map((s) => s.trim().toUpperCase())) : undefined
})()

// Demo amounts (6dp)
const AMT = {
  lpDeposit: parseUnits('1000', 6), // OUSD
  lpMintTargetRatioBps: 30000n, // mint so the LP sits at ~300%
  senderSwapIn: parseUnits('50', 6), // OUSD → xMXN
  slippageBps: 50n, // minOut = quote − 0.5%
  borrowCap: parseUnits('500', 6), // draw at most this much (or the attested max)
  billMxn: 100, // Telcel airtime, MXN
}

type Deployments = {
  chainId: number
  ousd: Address // Tempo testnet OpenUSD (faucet), the vault collateral
  xMXN: Address
  oracle: Address
  vault: Address
  swapDesk: Address
  creditPool: Address
  attestationSigner: Address
  merchant: Address
  [k: string]: unknown
}

function loadDeployments(): Deployments {
  const f = join(ROOT, 'packages/shared/src/deployments/42431.json')
  if (!existsSync(f)) throw new Error(`deployments not found at ${f}. Has contracts deployed yet?`)
  const d = JSON.parse(readFileSync(f, 'utf8'))
  d.ousd ??= d.dOUSD // fallback token, if contracts ever has to deploy dOUSD
  return d
}

function account(role: string): PrivateKeyAccount {
  const pk = process.env[`${role}_PRIVATE_KEY`]
  if (!pk) throw new Error(`${role}_PRIVATE_KEY missing from .env.local`)
  return privateKeyToAccount(pk as `0x${string}`)
}

// ---------- ABIs (from INTERFACES.md) ----------

const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function transfer(address,uint256) returns (bool)',
  'function mint(address,uint256)',
  'function totalSupply() view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 amount)',
  'error Unauthorized()',
])
const oracleAbi = parseAbi([
  'function price() view returns (uint256 mxnPerUsd, uint256 updatedAt)',
  'function isMock() view returns (bool)',
  'function maxAge() view returns (uint256)',
  'function peek() view returns (uint256 mxnPerUsd, uint256 updatedAt, bool valid)',
  'function paused() view returns (bool)',
  'function setPrice(uint256)',
  'error InvalidPrice()',
  'error PriceOutOfBand(uint256 price, uint256 minPrice, uint256 maxPrice)',
  'error PriceJumpTooLarge(uint256 previous, uint256 next, uint256 maxJumpBps)',
  'error OwnableUnauthorizedAccount(address account)',
])
const vaultAbi = parseAbi([
  'function depositCollateral(uint256)',
  'function mint(uint256)',
  'function repayAndBurn(uint256)',
  'function withdrawCollateral(uint256)',
  'function getPosition(address) view returns ((uint256 collateral, uint256 debt))',
  'function collateralRatio(address) view returns (uint256)',
  'function maxMintable(address) view returns (uint256)',
  'error RatioTooLow(uint256 ratioBps, uint256 requiredBps)',
])
const deskAbi = parseAbi([
  'function quote(bool ousdToXmxn, uint256 amountIn) view returns (uint256 amountOut, uint256 fee)',
  'function swapOusdForXmxn(uint256 amountIn, uint256 minOut) returns (uint256)',
  'function reserves() view returns (uint256 ousd, uint256 xmxn)',
  'function seed(uint256 ousd, uint256 xmxn)',
])
const poolAbi = parseAbi([
  'function supply(uint256)',
  'function borrow(uint256 amount, uint256 maxAmount, uint256 expiry, uint256 nonce, bytes32 dataHash, bytes signature)',
  'function repay(uint256)',
  'function getDebt(address) view returns (uint256)',
  'function availableLiquidity() view returns (uint256)',
  'function lenderBalance(address) view returns (uint256)',
  'function stats() view returns (uint256 totalSupplied, uint256 totalBorrowed, uint256 outstanding, uint256 realizedFees)',
  'function attestationSigner() view returns (address)',
  'function nonceUsed(address, uint256) view returns (bool)',
  'function feeBps() view returns (uint256)',
  'error NonceAlreadyUsed(uint256 nonce)',
  'error InvalidSigner()',
  'error AttestationExpired(uint256 expiry)',
  'error ExceedsAttestedMax(uint256 principalAfter, uint256 maxAmount)',
  'error ExceedsUserCap(uint256 principalAfter, uint256 cap)',
  'error InsufficientLiquidity(uint256 available, uint256 requested)',
])

// ---------- logging ----------

const C = { dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', c: '\x1b[36m', x: '\x1b[0m' }
const fmt = (v: bigint, d = 6) => Number(formatUnits(v, d)).toLocaleString('en-US', { maximumFractionDigits: d === 8 ? 4 : 2 })
const txUrl = (h: Hash) => `${EXPLORER}/tx/${h}`
const log = (s = '') => console.log(`   ${s}`)
const ok = (s: string) => console.log(`   ${C.g}✓${C.x} ${s}`)
const warn = (s: string) => console.log(`   ${C.y}!${C.x} ${s}`)

const evidence: Record<string, { status: 'pass' | 'fail' | 'skip'; txs: Record<string, string>; notes: string[]; error?: string }> = {}
let current = ''
const note = (s: string) => evidence[current]?.notes.push(s)

// ---------- chain helpers ----------

const pub = createPublicClient({ chain, transport: http(RPC) }) as PublicClient

async function send(label: string, acct: PrivateKeyAccount, req: { address: Address; abi: any; functionName: string; args?: readonly unknown[] }) {
  const wallet = createWalletClient({ account: acct, chain, transport: http(RPC) })
  // simulate first so reverts come back with a readable reason
  const { request } = await pub.simulateContract({ ...req, account: acct } as any)
  const hash = await wallet.writeContract(request as any)
  const rcpt = await pub.waitForTransactionReceipt({ hash })
  if (rcpt.status !== 'success') throw new Error(`${label} reverted on-chain: ${txUrl(hash)}`)
  ok(`${label}  ${C.dim}${txUrl(hash)}${C.x}`)
  evidence[current].txs[label] = txUrl(hash)
  return { hash, rcpt }
}

const bal = (token: Address, who: Address) => pub.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [who] })

async function approveIfNeeded(acct: PrivateKeyAccount, token: Address, spender: Address, amount: bigint, label: string) {
  const a = await pub.readContract({ address: token, abi: erc20, functionName: 'allowance', args: [acct.address, spender] })
  if (a >= amount) return
  await send(`approve ${label}`, acct, { address: token, abi: erc20, functionName: 'approve', args: [spender, amount] })
}

/** Make sure `who` holds `need` testnet OUSD; tops up from the Tempo faucet if short. */
async function ensureOusd(d: Deployments, who: Address, need: bigint, whoLabel: string) {
  const have = await bal(d.ousd, who)
  if (have >= need) return
  warn(`${whoLabel} has ${fmt(have)} OUSD, needs ${fmt(need)}; calling the faucet (tempo_fundAddress)`)
  await pub.request({ method: 'tempo_fundAddress' as any, params: [who] as any })
  for (let i = 0; i < 20 && (await bal(d.ousd, who)) < need; i++) await new Promise((r) => setTimeout(r, 1000))
  assert((await bal(d.ousd, who)) >= need, `${whoLabel} still short of OUSD after faucet`)
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const text = await res.text()
  let body: any
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { res, body }
}

/**
 * Mint `amount` xMXN to `acct` through its own vault position at ~300% (faucet OUSD as collateral).
 * Used to fund the desk/pool from *separate* positions, never from other users' collateral.
 */
async function mintXmxnFor(d: Deployments, acct: PrivateKeyAccount, label: string, amount: bigint) {
  const [px] = await pub.readContract({ address: d.oracle, abi: oracleAbi, functionName: 'price' })
  const collateral = (amount * 3n * 10n ** 8n) / px + 1n
  await ensureOusd(d, acct.address, collateral, label)
  await approveIfNeeded(acct, d.ousd, d.vault, collateral, `OUSD → vault (${label})`)
  await send(`${label} depositCollateral ${fmt(collateral)} OUSD`, acct, {
    address: d.vault,
    abi: vaultAbi,
    functionName: 'depositCollateral',
    args: [collateral],
  })
  await send(`${label} mint ${fmt(amount)} xMXN`, acct, { address: d.vault, abi: vaultAbi, functionName: 'mint', args: [amount] })
}

/** Pre-demo health check (lead decision on Q-003): oracle fresh, desk reserves and pool liquidity above floors. */
async function healthCheck(d: Deployments) {
  const problems: string[] = []
  // oracle
  const [opx, oat, valid] = await pub.readContract({ address: d.oracle, abi: oracleAbi, functionName: 'peek' })
  const paused = await pub.readContract({ address: d.oracle, abi: oracleAbi, functionName: 'paused' })
  const maxAge = await pub.readContract({ address: d.oracle, abi: oracleAbi, functionName: 'maxAge' })
  const age = Math.round(Date.now() / 1000) - Number(oat)
  const headroom = Number(maxAge) - age
  if (paused) problems.push('oracle is PAUSED (not auto-unpausing; ask @contracts)')
  else if (!valid || headroom < FLOOR.oracleMinHeadroomSec) {
    if (HEAL) {
      warn(`oracle ${valid ? `goes stale in ${headroom}s` : 'is stale/invalid'}; deployer re-pushes the same mock price ${fmt(opx, 8)}`)
      await send('oracle setPrice (refresh mock feed)', account('DEPLOYER'), { address: d.oracle, abi: oracleAbi, functionName: 'setPrice', args: [opx] })
    } else problems.push(`oracle stale or about to be (headroom ${headroom}s)`)
  } else ok(`health: oracle fresh (${age}s old, max ${maxAge}s)`)

  // swap desk inventory
  if (ZERO.test(d.swapDesk ?? '0x' + '0'.repeat(40))) warn('health: swap desk not deployed yet')
  else {
    const [rO, rX] = await pub.readContract({ address: d.swapDesk, abi: deskAbi, functionName: 'reserves' })
    if (rX < FLOOR.deskXmxn || rO < FLOOR.deskOusd) {
      const addX = rX < FLOOR.deskXmxn ? FLOOR.deskXmxn * 2n - rX : 0n
      const addO = rO < FLOOR.deskOusd ? FLOOR.deskOusd * 2n - rO : 0n
      if (HEAL) {
        warn(`desk low (${fmt(rO)} OUSD / ${fmt(rX)} xMXN); deployer reseeds +${fmt(addO)} OUSD / +${fmt(addX)} xMXN from its own vault position`)
        const dep = account('DEPLOYER')
        if (addX > 0n) await mintXmxnFor(d, dep, 'deployer', addX)
        if (addO > 0n) await ensureOusd(d, dep.address, addO, 'deployer')
        if (addO > 0n) await approveIfNeeded(dep, d.ousd, d.swapDesk, addO, 'OUSD → desk')
        if (addX > 0n) await approveIfNeeded(dep, d.xMXN, d.swapDesk, addX, 'xMXN → desk')
        await send('desk seed', dep, { address: d.swapDesk, abi: deskAbi, functionName: 'seed', args: [addO, addX] })
      } else problems.push(`desk reserves low: ${fmt(rO)} OUSD / ${fmt(rX)} xMXN`)
    } else ok(`health: desk reserves ${fmt(rO)} OUSD / ${fmt(rX)} xMXN`)
  }

  // credit pool cash
  if (ZERO.test(d.creditPool ?? '0x' + '0'.repeat(40))) warn('health: credit pool not deployed yet')
  else {
    const liq = await pub.readContract({ address: d.creditPool, abi: poolAbi, functionName: 'availableLiquidity' })
    if (liq < FLOOR.poolLiquidity) {
      const add = FLOOR.poolLiquidity * 2n - liq
      if (HEAL) {
        warn(`pool liquidity ${fmt(liq)} xMXN is low; LENDER mints ${fmt(add)} xMXN from its own vault position and supplies it`)
        const lender = account('LENDER')
        const have = await bal(d.xMXN, lender.address)
        if (have < add) await mintXmxnFor(d, lender, 'lender', add - have)
        await approveIfNeeded(lender, d.xMXN, d.creditPool, add, 'xMXN → pool')
        await send(`lender supply ${fmt(add)} xMXN`, lender, { address: d.creditPool, abi: poolAbi, functionName: 'supply', args: [add] })
      } else problems.push(`pool liquidity low: ${fmt(liq)} xMXN`)
    } else ok(`health: pool liquidity ${fmt(liq)} xMXN`)
  }

  if (problems.length) throw new Error(`health check failed: ${problems.join('; ')}`)
}

/** Thrown when a step can't run yet (e.g. contract not deployed). Recorded as SKIP, never as PASS. */
class SkipStep extends Error {}

const ZERO = /^0x0{40}$/i
function requireDeployed(d: Deployments, ...keys: (keyof Deployments)[]) {
  const missing = keys.filter((k) => typeof d[k] !== 'string' || ZERO.test(d[k] as string))
  if (missing.length) throw new SkipStep(`not deployed yet: ${missing.join(', ')}`)
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
}

// ---------- the journey ----------

type Ctx = { d: Deployments; driverBorrowed?: bigint }

const STEPS: { id: string; title: string; run: (ctx: Ctx) => Promise<void> }[] = [
  {
    id: 'J0',
    title: 'Preflight + health: chain, deployments, oracle freshness, desk reserves, pool liquidity',
    async run({ d }) {
      const id = await pub.getChainId()
      assert(id === 42431, `chain id ${id} != 42431`)
      ok(`connected to Tempo Moderato (chain ${id}) via ${RPC}`)
      for (const k of ['ousd', 'xMXN', 'oracle', 'vault', 'swapDesk', 'creditPool'] as const) {
        if (!d[k] || ZERO.test(d[k])) {
          warn(`${k.padEnd(10)} not deployed yet`)
          continue
        }
        const code = await pub.getCode({ address: d[k] })
        if (!code || code === '0x') warn(`${k} ${d[k]} has no code`)
        else log(`${k.padEnd(10)} ${d[k]}  ${C.dim}${EXPLORER}/address/${d[k]}${C.x}`)
      }
      await healthCheck(d)
      const [px, at] = await pub.readContract({ address: d.oracle, abi: oracleAbi, functionName: 'price' })
      const mock = await pub.readContract({ address: d.oracle, abi: oracleAbi, functionName: 'isMock' })
      ok(`oracle: ${fmt(px, 8)} MXN/USD, updated ${Math.round(Date.now() / 1000 - Number(at))}s ago${mock ? ' (MOCK admin feed, labeled)' : ''}`)
      note(`mxnPerUsd=${px} isMock=${mock}`)

      // oracle sanity rails, simulated as the real owner (no state change): zero, out-of-band and outlier
      // jumps are rejected, and only the owner can push prices
      const owner = account('DEPLOYER')
      const o = { address: d.oracle, abi: oracleAbi, functionName: 'setPrice' } as const
      await expectRevert('oracle setPrice(0)', { ...o, args: [0n], account: owner }, ['InvalidPrice'])
      await expectRevert('oracle setPrice(60 MXN/USD), outside the 5–50 band', { ...o, args: [60n * 10n ** 8n], account: owner }, ['PriceOutOfBand'])
      await expectRevert('oracle setPrice(+30% outlier jump)', { ...o, args: [(px * 13n) / 10n], account: owner }, ['PriceJumpTooLarge'])
      await expectRevert('oracle setPrice by a non-owner', { ...o, args: [px], account: account('SENDER') }, ['OwnableUnauthorizedAccount'])
    },
  },
  {
    id: 'J1',
    title: 'LP deposits OUSD collateral into the vault',
    async run({ d }) {
      requireDeployed(d, 'vault', 'ousd')
      const lp = account('LP')
      await ensureOusd(d, lp.address, AMT.lpDeposit, 'LP')
      const before = await pub.readContract({ address: d.vault, abi: vaultAbi, functionName: 'getPosition', args: [lp.address] })
      await approveIfNeeded(lp, d.ousd, d.vault, AMT.lpDeposit, 'OUSD → vault')
      await send(`depositCollateral ${fmt(AMT.lpDeposit)} OUSD`, lp, {
        address: d.vault,
        abi: vaultAbi,
        functionName: 'depositCollateral',
        args: [AMT.lpDeposit],
      })
      const after = await pub.readContract({ address: d.vault, abi: vaultAbi, functionName: 'getPosition', args: [lp.address] })
      assert(after.collateral - before.collateral === AMT.lpDeposit, 'position collateral increased by deposit')
      ok(`LP position: ${fmt(after.collateral)} OUSD collateral, ${fmt(after.debt)} xMXN debt`)
    },
  },
  {
    id: 'J2',
    title: 'Vault mints xMXN against the LP position',
    async run({ d }) {
      const lp = account('LP')
      const pos = await pub.readContract({ address: d.vault, abi: vaultAbi, functionName: 'getPosition', args: [lp.address] })
      const [px] = await pub.readContract({ address: d.oracle, abi: oracleAbi, functionName: 'price' })
      // target debt at ~300%: collateral(6dp) * px(8dp) / 1e8 * 1e4 / ratio
      const targetDebt = (pos.collateral * px * 10_000n) / (10n ** 8n * AMT.lpMintTargetRatioBps)
      const maxMint = await pub.readContract({ address: d.vault, abi: vaultAbi, functionName: 'maxMintable', args: [lp.address] })
      const amount = targetDebt > pos.debt ? targetDebt - pos.debt : 0n
      log(`maxMintable ${fmt(maxMint)} xMXN at 150%; minting ${fmt(amount)} to land at ~300%`)
      if (amount === 0n) return warn('LP already at/below target ratio; skipping mint')
      assert(amount <= maxMint, 'target mint within maxMintable')
      const supplyBefore = await pub.readContract({ address: d.xMXN, abi: erc20, functionName: 'totalSupply' })
      await send(`mint ${fmt(amount)} xMXN`, lp, { address: d.vault, abi: vaultAbi, functionName: 'mint', args: [amount] })
      const supplyAfter = await pub.readContract({ address: d.xMXN, abi: erc20, functionName: 'totalSupply' })
      assert(supplyAfter - supplyBefore === amount, 'xMXN totalSupply grew by exactly the minted debt')
      const ratio = await pub.readContract({ address: d.vault, abi: vaultAbi, functionName: 'collateralRatio', args: [lp.address] })
      ok(`LP collateral ratio ${(Number(ratio) / 100).toFixed(1)}%, xMXN balance ${fmt(await bal(d.xMXN, lp.address))}`)

      // negative check (simulation only, no gas): minting past 150% must revert
      const over = (await pub.readContract({ address: d.vault, abi: vaultAbi, functionName: 'maxMintable', args: [lp.address] })) + 1_000_000n
      await expectRevert('mint above the 150% limit', { address: d.vault, abi: vaultAbi, functionName: 'mint', args: [over], account: lp }, ['RatioTooLow'])
      // only the vault may mint xMXN: a direct TIP-20 mint from the LP must revert
      await expectRevert(
        'direct xMXN.mint by a non-vault account',
        { address: d.xMXN, abi: erc20, functionName: 'mint', args: [lp.address, 1_000_000n], account: lp },
        ['Unauthorized'],
      )
    },
  },
  {
    id: 'J3',
    title: 'Sender swaps OUSD→xMXN on the SwapDesk and sends to Recipient',
    async run({ d }) {
      requireDeployed(d, 'swapDesk')
      const sender = account('SENDER')
      const recipient = process.env.RECIPIENT_ADDRESS as Address
      await ensureOusd(d, sender.address, AMT.senderSwapIn, 'Sender')
      const [rO, rX] = await pub.readContract({ address: d.swapDesk, abi: deskAbi, functionName: 'reserves' })
      log(`desk reserves: ${fmt(rO)} OUSD / ${fmt(rX)} xMXN (separately seeded)`)
      const vaultCollBefore = await bal(d.ousd, d.vault)
      const [out, fee] = await pub.readContract({ address: d.swapDesk, abi: deskAbi, functionName: 'quote', args: [true, AMT.senderSwapIn] })
      const minOut = out - (out * AMT.slippageBps) / 10_000n
      log(`quote: ${fmt(AMT.senderSwapIn)} OUSD → ${fmt(out)} xMXN (fee ${fmt(fee)}), minOut ${fmt(minOut)}`)
      await approveIfNeeded(sender, d.ousd, d.swapDesk, AMT.senderSwapIn, 'OUSD → desk')
      const xBefore = await bal(d.xMXN, sender.address)
      await send(`swapOusdForXmxn ${fmt(AMT.senderSwapIn)} OUSD`, sender, {
        address: d.swapDesk,
        abi: deskAbi,
        functionName: 'swapOusdForXmxn',
        args: [AMT.senderSwapIn, minOut],
      })
      const got = (await bal(d.xMXN, sender.address)) - xBefore
      assert(got >= minOut, `received ${got} >= minOut ${minOut}`)
      assert((await bal(d.ousd, d.vault)) === vaultCollBefore, 'vault OUSD collateral untouched by the swap')
      ok(`sender received ${fmt(got)} xMXN; vault collateral untouched`)

      const rBefore = await bal(d.xMXN, recipient)
      await send(`transfer ${fmt(got)} xMXN → Recipient`, sender, { address: d.xMXN, abi: erc20, functionName: 'transfer', args: [recipient, got] })
      const delta = (await bal(d.xMXN, recipient)) - rBefore
      assert(delta === got, 'recipient balance increased by the amount sent')
      ok(`recipient ${recipient} received ${fmt(delta)} xMXN (on-chain delivery only, no SPEI cash-out)`)
    },
  },
  {
    id: 'J4',
    title: 'Driver: Demo Uber Data → signed attestation → borrow from CreditPool',
    async run(ctx) {
      const { d } = ctx
      requireDeployed(d, 'creditPool')
      const driver = account('DRIVER')
      const demo = await api('/api/driver/demo?profile=steady')
      assert(demo.res.ok, `GET /api/driver/demo → ${demo.res.status} ${JSON.stringify(demo.body).slice(0, 200)}`)
      assert(demo.body.demo === true && /Demo Uber Data/.test(demo.body.label), 'driver demo response carries demo:true + "Demo Uber Data" label')
      ok(`/api/driver/demo: ${demo.body.weeks?.length} weeks, label "${demo.body.label}"`)

      const score = await api('/api/driver/score', { method: 'POST', body: JSON.stringify({ borrower: driver.address, profile: 'steady' }) })
      assert(score.res.ok, `POST /api/driver/score → ${score.res.status} ${JSON.stringify(score.body).slice(0, 200)}`)
      const s = score.body
      assert(s.demo === true, 'score response carries demo:true')
      assert(s.eligible && s.attestation, 'steady driver is eligible with an attestation')
      const att = s.attestation
      log(`score ${s.score}, maxAmount ${fmt(BigInt(s.maxAmount))} xMXN, expires in ${Number(att.expiry) - Math.round(Date.now() / 1000)}s`)
      for (const line of (s.explanation ?? []).slice(0, 4)) log(`${C.dim}· ${line}${C.x}`)
      assert(Number(att.chainId) === 42431, 'attestation bound to chain 42431')
      assert(String(att.pool).toLowerCase() === d.creditPool.toLowerCase(), 'attestation bound to the deployed pool')
      const signer = await pub.readContract({ address: d.creditPool, abi: poolAbi, functionName: 'attestationSigner' })
      assert(signer.toLowerCase() === d.attestationSigner.toLowerCase(), 'pool signer matches deployments.attestationSigner')

      const maxAmount = BigInt(att.maxAmount)
      const liq = await pub.readContract({ address: d.creditPool, abi: poolAbi, functionName: 'availableLiquidity' })
      log(`pool available liquidity ${fmt(liq)} xMXN`)
      // availableToBorrow = what the pool can lend this borrower right now (CreditPool.borrowCapacity, R-006)
      const capacity = s.availableToBorrow !== undefined ? BigInt(s.availableToBorrow) : maxAmount
      log(`credit line ${fmt(maxAmount)} xMXN, available to draw now ${fmt(capacity)} xMXN`)
      let amount = [maxAmount, capacity, AMT.borrowCap].reduce((a, b) => (b < a ? b : a))
      if (amount > liq) throw new Error(`pool liquidity ${fmt(liq)} < borrow ${fmt(amount)}; LENDER must supply first`)
      const debtBefore = await pub.readContract({ address: d.creditPool, abi: poolAbi, functionName: 'getDebt', args: [driver.address] })
      const borrowArgs = [amount, maxAmount, BigInt(att.expiry), BigInt(att.nonce), att.dataHash, att.signature] as const
      // negative checks before the real draw (simulation only)
      const sim = { address: d.creditPool, abi: poolAbi, functionName: 'borrow', account: driver } as const
      await expectRevert('tampered attestation (maxAmount +1)', { ...sim, args: [amount, maxAmount + 1n, ...borrowArgs.slice(2)] }, ['InvalidSigner'])
      await expectRevert('expired attestation', { ...sim, args: [amount, maxAmount, BigInt(Math.floor(Date.now() / 1000) - 60), ...borrowArgs.slice(3)] }, [
        'AttestationExpired',
      ])
      await expectRevert('borrow above the attested max', { ...sim, args: [maxAmount + 1n, ...borrowArgs.slice(1)] }, ['ExceedsAttestedMax', 'ExceedsUserCap'])
      await send(`borrow ${fmt(amount)} xMXN`, driver, { address: d.creditPool, abi: poolAbi, functionName: 'borrow', args: borrowArgs })
      const debt = await pub.readContract({ address: d.creditPool, abi: poolAbi, functionName: 'getDebt', args: [driver.address] })
      const feeBps = await pub.readContract({ address: d.creditPool, abi: poolAbi, functionName: 'feeBps' })
      const expectedFee = (amount * feeBps + 9_999n) / 10_000n // CreditPool rounds the fee up
      ok(`driver debt ${fmt(debtBefore)} → ${fmt(debt)} xMXN (expected +${fmt(amount + expectedFee)} incl. ${Number(feeBps) / 100}% fee)`)
      assert(debt - debtBefore === amount + expectedFee, `debt delta ${debt - debtBefore} == amount+fee ${amount + expectedFee}`)
      ctx.driverBorrowed = amount

      // negative check: replaying the same attestation must revert
      const used = await pub.readContract({ address: d.creditPool, abi: poolAbi, functionName: 'nonceUsed', args: [driver.address, BigInt(att.nonce)] })
      assert(used, 'nonce marked used')
      await expectRevert(
        'replayed attestation',
        { address: d.creditPool, abi: poolAbi, functionName: 'borrow', args: [1_000_000n, ...borrowArgs.slice(1)], account: driver },
        ['NonceAlreadyUsed'],
      )
    },
  },
  {
    id: 'J5',
    title: 'Driver pays Telcel airtime via MPP HTTP 402, in pull AND push mode (SIMULATED fulfillment)',
    async run({ d }) {
      // pull: client signs, server broadcasts (default for local keys / demo personas)
      // push: client broadcasts, then retries with the tx hash (what Tempo Wallet / passkey wallets do)
      requireDeployed(d, 'xMXN', 'merchant')
      const need = parseUnits(String(AMT.billMxn * 3), 6)
      const have = await bal(d.xMXN, account('DRIVER').address)
      assert(have >= need, `driver holds ${fmt(have)} xMXN, needs ${fmt(need)} for 3 bill payments (run J4 first)`)
      for (const mode of ['pull', 'push'] as const) {
        log(`${C.b}— ${mode} mode —${C.x}`)
        await payBillVia(d, account('DRIVER'), mode)
      }
      // provider failure path: phones ending 0000 make the mock provider reject → FAILED + paidButUnfulfilled
      log(`${C.b}— provider failure (paid but unfulfilled) —${C.x}`)
      await payBillVia(d, account('DRIVER'), 'pull', { phone: '5512340000', expect: 'FAILED' })
    },
  },
  {
    id: 'J6',
    title: 'Driver repays; lender sees repayment and realized fees',
    async run({ d }) {
      requireDeployed(d, 'creditPool')
      const driver = account('DRIVER')
      const debt = await pub.readContract({ address: d.creditPool, abi: poolAbi, functionName: 'getDebt', args: [driver.address] })
      if (debt === 0n) return warn('driver has no outstanding debt; nothing to repay')
      const statsBefore = await pub.readContract({ address: d.creditPool, abi: poolAbi, functionName: 'stats' })
      const have = await bal(d.xMXN, driver.address)
      if (have < debt) {
        // the driver spent part of the advance on airtime, so top up from the LP
        // (stands in for "next week's earnings"; there's no automatic Uber deduction)
        const short_ = debt - have
        warn(`driver holds ${fmt(have)} xMXN, owes ${fmt(debt)}; LP sends ${fmt(short_)} as a stand-in for next week's earnings`)
        await send(`top-up ${fmt(short_)} xMXN LP → Driver`, account('LP'), {
          address: d.xMXN,
          abi: erc20,
          functionName: 'transfer',
          args: [driver.address, short_],
        })
      }
      await approveIfNeeded(driver, d.xMXN, d.creditPool, debt, 'xMXN → pool')
      await send(`repay ${fmt(debt)} xMXN`, driver, { address: d.creditPool, abi: poolAbi, functionName: 'repay', args: [debt] })
      const after = await pub.readContract({ address: d.creditPool, abi: poolAbi, functionName: 'getDebt', args: [driver.address] })
      assert(after === 0n, `driver debt after full repay is ${after}`)
      const stats = await pub.readContract({ address: d.creditPool, abi: poolAbi, functionName: 'stats' })
      ok(`driver debt ${fmt(debt)} → 0`)
      ok(
        `pool: lender claims ${fmt(stats[0])}, borrowed ${fmt(stats[1])}, outstanding ${fmt(statsBefore[2])} → ${fmt(stats[2])}, realized fees ${fmt(statsBefore[3])} → ${fmt(stats[3])} xMXN`,
      )
      assert(stats[3] > statsBefore[3], 'realized fees increased after repayment')
      const lender = process.env.LENDER_ADDRESS as Address
      ok(
        `lender claim: ${fmt(await pub.readContract({ address: d.creditPool, abi: poolAbi, functionName: 'lenderBalance', args: [lender] }))} xMXN (principal + realized fee share; no APY promised)`,
      )
    },
  },
  {
    id: 'J7',
    title: 'FX stress (runs last): peso appreciation makes a position liquidatable; everything is restored',
    async run({ d }) {
      const script = join(ROOT, 'packages/contracts/script/StressDemo.s.sol')
      if (!existsSync(script)) throw new SkipStep('packages/contracts/script/StressDemo.s.sol not there yet (pending @contracts)')
      requireDeployed(d, 'vault', 'oracle', 'swapDesk')
      const [pxBefore] = await pub.readContract({ address: d.oracle, abi: oracleAbi, functionName: 'peek' })
      const fromBlock = await pub.getBlockNumber()
      // ~/.local/bin/forge is an unrelated CLI on this box; use Foundry's explicitly
      const forge = process.env.FORGE_BIN ?? join(process.env.HOME ?? '', '.foundry/bin/forge')
      log(`running ${forge} script script/StressDemo.s.sol --broadcast (pause desk → 160% position → forceSet 20→13 → liquidate → restore → unpause)`)
      const { spawnSync } = await import('node:child_process')
      const r = spawnSync(forge, ['script', 'script/StressDemo.s.sol', '--rpc-url', RPC, '--broadcast'], {
        cwd: join(ROOT, 'packages/contracts'),
        env: process.env,
        encoding: 'utf8',
        timeout: 300_000,
      })
      if (r.status !== 0) throw new Error(`StressDemo.s.sol exited ${r.status}: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ')}`)
      // the script must print which accounts it used, so we check THAT liquidation, not any in the window
      const borrower = r.stdout.match(/STRESS_BORROWER=(0x[0-9a-fA-F]{40})/)?.[1]
      const liquidator = r.stdout.match(/STRESS_LIQUIDATOR=(0x[0-9a-fA-F]{40})/)?.[1]
      assert(borrower && liquidator, 'StressDemo output includes STRESS_BORROWER=0x… and STRESS_LIQUIDATOR=0x…')
      const liqLogs = await pub.getContractEvents({
        address: d.vault,
        abi: parseAbi(['event Liquidated(address indexed user, address indexed liquidator, uint256 debtCovered, uint256 collateralSeized)']),
        eventName: 'Liquidated',
        fromBlock,
      })
      const mine = liqLogs.filter((l) => l.args.user?.toLowerCase() === borrower.toLowerCase() && l.args.liquidator?.toLowerCase() === liquidator.toLowerCase())
      assert(mine.length > 0, `Liquidated(user=${borrower}, liquidator=${liquidator}) emitted during the stress run`)
      for (const l of mine) {
        evidence[current].txs[`liquidation ${l.args.user?.slice(0, 8)}`] = txUrl(l.transactionHash!)
        ok(
          `liquidated ${l.args.user}: covered ${fmt(l.args.debtCovered!)} xMXN, seized ${fmt(l.args.collateralSeized!)} OUSD  ${C.dim}${txUrl(l.transactionHash!)}${C.x}`,
        )
      }
      const [pxAfter] = await pub.readContract({ address: d.oracle, abi: oracleAbi, functionName: 'peek' })
      assert(pxAfter === pxBefore, `oracle restored to ${fmt(pxBefore, 8)} (now ${fmt(pxAfter, 8)})`)
      const deskPaused = await pub.readContract({ address: d.swapDesk, abi: parseAbi(['function paused() view returns (bool)']), functionName: 'paused' })
      assert(!deskPaused, 'swap desk unpaused after the stress run')
      ok(`oracle back at ${fmt(pxAfter, 8)} MXN/USD, desk unpaused`)
      const lpRatio = await pub.readContract({ address: d.vault, abi: vaultAbi, functionName: 'collateralRatio', args: [account('LP').address] })
      ok(`demo LP ratio ${lpRatio === maxUint256 ? 'n/a (no debt)' : `${(Number(lpRatio) / 100).toFixed(1)}%`}, untouched by the stress position`)
      log('re-running the J0 health check')
      await healthCheck(d)
    },
  },
]

/** One full MPP bill payment: quote → 402 → pay (mppx client, given mode) → verify on-chain → idempotent retry. */
async function payBillVia(
  d: Deployments,
  driver: PrivateKeyAccount,
  mode: 'pull' | 'push',
  opts: { phone?: string; expect?: 'FULFILLED_SIMULATED' | 'FAILED' } = {},
) {
  const expect = opts.expect ?? 'FULFILLED_SIMULATED'
  const quote = await api('/api/bills/quote', {
    method: 'POST',
    body: JSON.stringify({ provider: 'telcel', phone: opts.phone ?? '5512345678', amountMxn: AMT.billMxn }),
  })
  assert(quote.res.ok, `POST /api/bills/quote → ${quote.res.status} ${JSON.stringify(quote.body).slice(0, 200)}`)
  assert(quote.body.simulated === true, 'quote is labeled simulated')
  const token = quote.body.token as Address
  if (token.toLowerCase() !== d.xMXN.toLowerCase()) warn(`bills charge ${quote.body.tokenSymbol ?? token}, not xMXN (interim token?)`)
  ok(`quote ${quote.body.quoteId}: ${fmt(BigInt(quote.body.amount))} ${quote.body.tokenSymbol ?? 'xMXN'}`)
  const body = JSON.stringify({ quoteId: quote.body.quoteId, idempotencyKey: `journey-${mode}-${Date.now()}` })
  const post = { method: 'POST', headers: { 'content-type': 'application/json' }, body }

  // 1) unpaid request must get a real 402 challenge
  const unpaid = await fetch(`${API}/api/bills/pay`, post)
  const challenge = unpaid.headers.get('www-authenticate')
  assert(unpaid.status === 402, `unpaid /api/bills/pay → ${unpaid.status}, expected 402`)
  assert(challenge && /^payment /i.test(challenge), '402 carries a WWW-Authenticate: Payment challenge')
  ok(`unpaid request → 402, challenge: ${challenge.slice(0, 80)}…`)
  note(`[${mode}] 402 challenge: ${challenge}`)

  // 2) pay with the mppx client (402 → TIP-20 transfer bound to the challenge → retry with credential)
  const { Mppx, tempo } = await import('mppx/client')
  const mppx = Mppx.create({
    methods: [
      tempo({
        account: driver,
        mode,
        expectedChainId: 42431,
        expectedRecipients: [d.merchant],
        getClient: () => createWalletClient({ account: driver, chain, transport: http(RPC) }),
      }),
    ],
    polyfill: false,
  })
  const merchantBefore = await bal(token, d.merchant)
  const paid = await mppx.fetch(`${API}/api/bills/pay`, post)
  const order = await paid.json().catch(() => ({}))
  assert(paid.ok, `paid /api/bills/pay → ${paid.status} ${JSON.stringify(order).slice(0, 300)}`)
  assert(order.status === expect, `order ${order.orderId} status ${order.status}, expected ${expect}`)
  if (expect === 'FAILED') assert(order.paidButUnfulfilled === true, 'failed-after-payment order is flagged paidButUnfulfilled')
  assert(order.fulfillment?.simulated === true && /SIMULATED/.test(order.fulfillment?.label ?? ''), 'fulfillment labeled SIMULATED')
  assert(paid.headers.get('payment-receipt'), 'response carries a Payment-Receipt header')
  const txHash = order.receipt?.txHash as Hash
  assert(txHash, 'order carries receipt.txHash')
  evidence[current].txs[`MPP payment (${mode})`] = txUrl(txHash)
  ok(`order ${order.orderId}: ${order.status}, payment tx ${C.dim}${txUrl(txHash)}${C.x}`)
  ok(
    expect === 'FAILED'
      ? `provider rejected after payment → FAILED, paidButUnfulfilled=true (needs refund/manual retry), "${order.fulfillment.label}"`
      : `fulfillment ref ${order.fulfillment.reference}: "${order.fulfillment.label}"`,
  )

  // 3) the receipt must be a real on-chain transfer to the merchant for the quoted amount, from the driver
  const rcpt = await pub.getTransactionReceipt({ hash: txHash })
  assert(rcpt.status === 'success', 'payment tx succeeded on-chain')
  const transfers = rcpt.logs
    .filter((l) => l.address.toLowerCase() === token.toLowerCase())
    .map((l) => {
      try {
        return decodeEventLog({ abi: erc20, ...l }) as any
      } catch {
        return undefined
      }
    })
    .filter((e) => e?.eventName === 'Transfer' && e.args.to.toLowerCase() === d.merchant.toLowerCase())
  const paidAmt = transfers.reduce((a, e) => a + (e.args.amount as bigint), 0n)
  assert(paidAmt === BigInt(quote.body.amount), `on-chain transfer to merchant ${paidAmt} == quoted ${quote.body.amount}`)
  assert(
    transfers.every((e) => e.args.from.toLowerCase() === driver.address.toLowerCase()),
    'payment came from the driver',
  )
  ok(`on-chain: ${fmt(paidAmt)} driver → merchant ${d.merchant}`)

  // 4) retry with the same idempotency key → same order, no second charge or fulfillment
  const retry = await mppx.fetch(`${API}/api/bills/pay`, post)
  const again = await retry.json().catch(() => ({}))
  assert(again.orderId === order.orderId, `retry returned order ${again.orderId}, expected ${order.orderId}`)
  assert(again.fulfillment?.reference === order.fulfillment.reference, 'retry returned the same fulfillment reference')
  const delta = (await bal(token, d.merchant)) - merchantBefore
  assert(delta === paidAmt, `retry must not charge again: merchant received ${delta}, expected ${paidAmt}`)
  ok('retry with same idempotency key → same order + reference, not charged again')

  // 5) state machine recorded
  const hist = await api(`/api/bills/orders/${order.orderId}`)
  assert(hist.res.ok, `GET /api/bills/orders/${order.orderId} → ${hist.res.status}`)
  const states = (hist.body.history ?? hist.body.order?.history ?? []).map((h: any) => h.status)
  assert(JSON.stringify(states) === JSON.stringify(['CREATED', 'PAYMENT_VERIFIED', expect]), `order history ${JSON.stringify(states)}`)
  ok(`order history: ${states.join(' → ')}`)
}

/** Negative check via simulation (no gas). Passes only on a genuine contract revert, not on RPC/network errors. */
/** `expected` lists acceptable custom error names; a revert for any other reason (e.g. stale oracle) fails. */
async function expectRevert(
  what: string,
  req: { address: Address; abi: any; functionName: string; args?: readonly unknown[]; account: PrivateKeyAccount },
  expected?: string[],
) {
  try {
    await pub.simulateContract(req as any)
  } catch (e) {
    const revert = e instanceof BaseError ? (e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null) : null
    if (!revert) throw new Error(`${what}: expected a contract revert, got: ${short(e)}`)
    const name = revert.data?.errorName ?? revert.signature ?? revert.reason ?? 'unknown'
    if (expected && !expected.includes(name)) throw new Error(`${what}: reverted with ${name}, expected ${expected.join(' | ')}`)
    ok(`${what} reverts with ${name}`)
    return
  }
  throw new Error(`${what} did NOT revert`)
}

function short(e: any): string {
  return String(e?.shortMessage ?? e?.message ?? e)
    .split('\n')[0]
    .slice(0, 160)
}

async function main() {
  console.log(`${C.b}Mercado demo journey on Tempo Moderato${C.x}  ${C.dim}(testnet prototype; demo data; SIMULATED fulfillment; mock oracle)${C.x}`)
  console.log(`${C.dim}api ${API} · rpc ${RPC} · fee token ${FEE_TOKEN}${C.x}\n`)
  const ctx: Ctx = { d: loadDeployments() }
  let failed = 0
  let skipped = 0
  for (const step of STEPS) {
    if (ONLY && !ONLY.has(step.id) && step.id !== 'J0') continue
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
      console.log(`   ${C.r}${C.b}FAIL${C.x} ${short(e)}`)
      if (process.env.DEBUG) console.error(e)
      console.log()
      if (!KEEP_GOING) break
    }
  }
  const outDir = join(ROOT, 'scripts/evidence')
  mkdirSync(outDir, { recursive: true })
  const run = JSON.stringify({ at: new Date().toISOString(), api: API, steps: ONLY ? [...ONLY] : 'all', evidence }, null, 2)
  writeFileSync(join(outDir, 'last-run.json'), run)
  writeFileSync(join(outDir, `run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), run) // keep history for ACCEPTANCE links
  const summary = failed
    ? `${C.r}${failed} step(s) failed${C.x}${skipped ? `, ${skipped} skipped` : ''}`
    : skipped
      ? `${C.y}No failures, but ${skipped} step(s) SKIPPED (not a full pass)${C.x}`
      : `${C.g}${C.b}All steps passed${C.x}`
  console.log(summary, `${C.dim}evidence → scripts/evidence/last-run.json${C.x}`)
  process.exit(failed ? 1 : skipped ? 2 : 0)
}

main().catch((e) => {
  console.error(`${C.r}fatal:${C.x} ${short(e)}`)
  process.exit(1)
})
