/**
 * Machine-to-machine MPP demo: a third-party underwriting bot buys a driver's (demo) underwriting
 * report from Mercado's paid API. No API key and no account signup: it gets an HTTP 402, pays 2 xMXN
 * on Tempo, and gets the report plus a receipt.
 *
 *   npx tsx scripts/underwriter-agent.ts                    # fresh throwaway agent wallet (faucet-funded)
 *   UNDERWRITER_PRIVATE_KEY=0x… npx tsx scripts/underwriter-agent.ts
 *   npx tsx scripts/underwriter-agent.ts --profile irregular
 *
 * The report is an illustrative heuristic on Demo Uber Data, NOT a credit model. The paid report
 * carries no borrow attestation: only the borrower's own app session can get one.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Address, type Hash, createPublicClient, createWalletClient, decodeEventLog, formatUnits, http, parseAbi, parseUnits } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const line of existsSync(join(ROOT, '.env.local')) ? readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n') : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
}

const API = process.env.MERCADO_API_URL ?? 'http://localhost:3100'
const RPC = process.env.TEMPO_RPC_URL ?? tempoModerato.rpcUrls.default.http[0]
const EXPLORER = tempoModerato.blockExplorers.default.url
const ALPHA_USD = '0x20c0000000000000000000000000000000000001' as Address
const chain = tempoModerato.extend({ feeToken: ALPHA_USD })
const args = process.argv.slice(2)
const PROFILE = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : 'steady'
const BORROWER = (process.env.DRIVER_ADDRESS ?? '0x871aF8b66406F96C6b5f8a156242d9B7a026cC63') as Address

// addresses for the ACTIVE protocol (MERCADO_PROTOCOL=v1|v2), never mixed (crew/V2-SWITCH.md)
const { activeAddresses } = await import('@mercado/shared')
const d = activeAddresses() as { protocol: string; xMXN: Address; ousd: Address; merchant: Address; swapDesk?: Address; vamm?: Address }
const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 amount)',
])
const deskAbi = parseAbi([
  'function quote(bool,uint256) view returns (uint256 amountOut, uint256 fee)',
  'function swapOusdForXmxn(uint256 amountIn, uint256 minOut) returns (uint256)',
])
const vammAbi = parseAbi([
  'function quote(bool usdToMxn, uint256 amountIn) view returns (uint256 amountOut, uint256 fee, uint256 midPrice, uint256 impactBps)',
  'function swapOusdForXmxn(uint256 amountIn, uint256 minOut, address to) returns (uint256)',
])

const C = { dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', c: '\x1b[36m', m: '\x1b[35m', x: '\x1b[0m' }
const say = (who: 'agent' | 'mercado' | 'tempo', s: string) =>
  console.log(`${{ agent: C.c, mercado: C.m, tempo: C.y }[who]}${C.b}${who.padEnd(7)}${C.x} ${s}`)
const fmt = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString('en-US', { maximumFractionDigits: 6 })
const tx = (h: Hash) => `${C.dim}${EXPLORER}/tx/${h}${C.x}`

const pub = createPublicClient({ chain, transport: http(RPC) })
const agent = privateKeyToAccount((process.env.UNDERWRITER_PRIVATE_KEY as `0x${string}`) ?? generatePrivateKey())
const wallet = createWalletClient({ account: agent, chain, transport: http(RPC) })
const bal = (t: Address) => pub.readContract({ address: t, abi: erc20, functionName: 'balanceOf', args: [agent.address] })

async function write(req: Parameters<typeof wallet.writeContract>[0]) {
  const { request } = await pub.simulateContract({ ...(req as any), account: agent })
  const hash = await wallet.writeContract(request as any)
  const r = await pub.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') throw new Error(`tx reverted ${hash}`)
  return hash
}

async function main() {
  console.log(`${C.b}Underwriter agent → Mercado paid API (MPP over HTTP 402, Tempo Moderato, protocol ${d.protocol})${C.x}  ${C.dim}${API}${C.x}`)
  console.log(`${C.dim}testnet prototype · Demo Uber Data · illustrative score, not a credit model${C.x}\n`)
  say('agent', `I'm a third-party underwriting bot with wallet ${agent.address}. No API key, no signup.`)

  // 0) wallet setup: faucet (fee tokens + OUSD), then swap a little OUSD → xMXN on Mercado's desk
  const fee = parseUnits('2', 6)
  if ((await bal(d.xMXN)) < fee) {
    if ((await bal(ALPHA_USD)) === 0n) {
      say('tempo', 'funding the fresh agent wallet from the Moderato faucet (tempo_fundAddress)…')
      await pub.request({ method: 'tempo_fundAddress' as any, params: [agent.address] as any })
      for (let i = 0; i < 30 && ((await bal(ALPHA_USD)) === 0n || (await bal(d.ousd)) === 0n); i++) await new Promise((r) => setTimeout(r, 1000))
    }
    const ousdIn = parseUnits('1', 6)
    // v2: the vault-integrated vAMM mints xMXN to the agent; v1: the capped swap desk sells inventory
    const venue = (d.protocol === 'v2' ? d.vamm : d.swapDesk)!
    const [out] = (await pub.readContract({ address: venue, abi: d.protocol === 'v2' ? vammAbi : deskAbi, functionName: 'quote', args: [true, ousdIn] } as any)) as bigint[]
    await write({ address: d.ousd, abi: erc20, functionName: 'approve', args: [venue, ousdIn] } as any)
    const h =
      d.protocol === 'v2'
        ? await write({ address: venue, abi: vammAbi, functionName: 'swapOusdForXmxn', args: [ousdIn, (out * 99n) / 100n, agent.address] } as any)
        : await write({ address: venue, abi: deskAbi, functionName: 'swapOusdForXmxn', args: [ousdIn, (out * 99n) / 100n] } as any)
    say('agent', `swapped 1 OUSD → ${fmt(out)} xMXN on Mercado ${d.protocol === 'v2' ? 'Global (vAMM mint)' : 'swap desk'} to pay in pesos ${tx(h)}`)
  }

  // 1) ask for the report with no payment → 402
  const url = `${API}/api/driver/score?access=underwriter`
  const body = JSON.stringify({ borrower: BORROWER, profile: PROFILE })
  say('agent', `POST /api/driver/score?access=underwriter  { borrower: ${BORROWER.slice(0, 10)}…, profile: "${PROFILE}" }`)
  const unpaid = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  if (unpaid.status !== 402) throw new Error(`expected 402, got ${unpaid.status}: ${await unpaid.text()}`)
  const { Challenge, Receipt } = await import('mppx')
  const ch = Challenge.fromResponse(unpaid) as any
  const reqd = ch.request ?? {}
  say(
    'mercado',
    `${C.b}402 Payment Required${C.x}: ${reqd.amount ? fmt(BigInt(reqd.amount)) : '?'} of ${reqd.currency?.toLowerCase() === d.xMXN.toLowerCase() ? 'xMXN' : reqd.currency} → ${reqd.recipient}, method ${ch.method}/${ch.intent}, expires ${ch.expires ?? '?'}`,
  )

  // 2) pay and retry automatically with the mppx client
  const { Mppx, tempo } = await import('mppx/client')
  const mppx = Mppx.create({
    polyfill: false,
    methods: [
      tempo({
        account: agent,
        expectedChainId: 42431,
        expectedRecipients: [d.merchant],
        getClient: () => createWalletClient({ account: agent, chain, transport: http(RPC) }),
      }),
    ],
  })
  mppx.onCredentialCreated?.(() => say('agent', 'signed a TIP-20 xMXN transfer bound to that challenge (memo = challenge id), retrying with the credential…'))
  const paid = await mppx.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  const report = await paid.json()
  if (!paid.ok) throw new Error(`paid request failed ${paid.status}: ${JSON.stringify(report)}`)
  const receipt = Receipt.fromResponse(paid) as any
  const txHash = (report.payment?.txHash ?? receipt.reference) as Hash
  say('tempo', `settled on-chain ${tx(txHash)}`)
  say('mercado', `${C.g}${C.b}200 OK${C.x} + Payment-Receipt { status: ${receipt.status}, method: ${receipt.method}, reference: ${String(receipt.reference).slice(0, 18)}… }`)

  // 3) verify the payment on-chain independently
  const rc = await pub.getTransactionReceipt({ hash: txHash })
  const paidAmt = rc.logs
    .filter((l) => l.address.toLowerCase() === d.xMXN.toLowerCase())
    .map((l) => {
      try {
        return decodeEventLog({ abi: erc20, ...l }) as any
      } catch {
        return undefined
      }
    })
    .filter((e) => e?.eventName === 'Transfer' && e.args.from.toLowerCase() === agent.address.toLowerCase() && e.args.to.toLowerCase() === d.merchant.toLowerCase())
    .reduce((a, e) => a + (e.args.amount as bigint), 0n)
  if (paidAmt !== fee) throw new Error(`on-chain transfer ${paidAmt} != 2 xMXN`)
  say('agent', `verified: ${fmt(paidAmt)} xMXN agent → merchant in block ${rc.blockNumber}`)

  // 4) the goods
  if (report.attestation) throw new Error('paid underwriter report must not carry a borrow attestation')
  say('agent', `${C.b}report:${C.x} ${report.label}`)
  say('agent', `  score ${report.score} (floor ${report.scoreFloor}) · eligible ${report.eligible} · credit line ${fmt(BigInt(report.maxAmount))} xMXN · dataHash ${String(report.dataHash).slice(0, 14)}…`)
  for (const line of (report.explanation ?? []).slice(0, 4)) say('agent', `  ${C.dim}· ${line}${C.x}`)
  say('agent', `  no borrow attestation included (only the borrower's own session gets one) ✓`)
  console.log(`PAYMENT_TX=${txHash}`)
  console.log(`\n${C.g}${C.b}Machine-to-machine payment complete:${C.x} 402 → 2 xMXN on Tempo → report + receipt. No API key, no account, no card.`)
}

main().catch((e) => {
  console.error(`fatal: ${e?.shortMessage ?? e?.message ?? e}`)
  process.exit(1)
})
