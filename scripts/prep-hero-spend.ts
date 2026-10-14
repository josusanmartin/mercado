// Prepare v2 state for the spending-proof take: Javier debt-free on pool v2, his own Mercado Card (limit 1,000,
// not frozen) with allowance; Familia's card unfrozen. Real txs only.
process.env.MERCADO_PROTOCOL = 'v2'
import { readFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
for (const l of readFileSync('/home/josu/dev/mercado/.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2] }
const S: any = await import('@mercado/shared')
const A = S.activeAddresses('v2'); const card: Address = A.card ?? S.moderatoDeployment.v2.card
const chain = tempoModerato.extend({ feeToken: '0x20c0000000000000000000000000000000000001' as Address })
const pub = createPublicClient({ chain, transport: http() })
const acct = (r: string) => privateKeyToAccount(process.env[`${r}_PRIVATE_KEY`] as `0x${string}`)
const f = (v: bigint) => formatUnits(v, 6)
async function tx(who: any, req: any, label: string) { const w = createWalletClient({ account: who, chain, transport: http() }); const { request } = await pub.simulateContract({ ...req, account: who }); const h = await w.writeContract(request as any); await pub.waitForTransactionReceipt({ hash: h }); console.log('✓', label, h) }
const rd = (address: Address, abi: any, functionName: string, args: any[] = []) => pub.readContract({ address, abi, functionName, args } as any) as Promise<any>
const driver = acct('DRIVER'), lp = acct('LP'), fam = acct('RECIPIENT')
// 1) driver debt-free on pool v2
const debt: bigint = await rd(A.creditPool, S.creditPoolAbi, 'getDebt', [driver.address])
if (debt > 0n) {
  const have: bigint = await rd(A.xMXN, S.tip20Abi, 'balanceOf', [driver.address])
  if (have < debt) await tx(lp, { address: A.xMXN, abi: S.tip20Abi, functionName: 'transfer', args: [driver.address, debt - have] }, `LP tops driver ${f(debt - have)}`)
  await tx(driver, { address: A.xMXN, abi: S.tip20Abi, functionName: 'approve', args: [A.creditPool, debt] }, 'approve pool')
  await tx(driver, { address: A.creditPool, abi: S.creditPoolAbi, functionName: 'repay', args: [debt] }, `driver repays ${f(debt)}`)
}
// 2) Javier's card
let ids: bigint[] = await rd(card, S.mercadoCardAbi, 'cardsOf', [driver.address])
if (!ids.length) { await tx(driver, { address: card, abi: S.mercadoCardAbi, functionName: 'issueCard', args: [parseUnits('1000', 6)] }, 'issue Javier a card'); ids = await rd(card, S.mercadoCardAbi, 'cardsOf', [driver.address]) }
const jc = await rd(card, S.mercadoCardAbi, 'getCard', [ids[ids.length - 1]])
if (jc.frozen) await tx(driver, { address: card, abi: S.mercadoCardAbi, functionName: 'setFrozen', args: [ids[ids.length - 1], false] }, 'unfreeze Javier card')
await tx(driver, { address: A.xMXN, abi: S.tip20Abi, functionName: 'approve', args: [card, parseUnits('1000', 6)] }, 'Javier card allowance 1,000')
// 3) Familia's demo card unfrozen
for (const id of (await rd(card, S.mercadoCardAbi, 'cardsOf', [fam.address])) as bigint[]) { const c = await rd(card, S.mercadoCardAbi, 'getCard', [id]); if (c.frozen) await tx(fam, { address: card, abi: S.mercadoCardAbi, functionName: 'setFrozen', args: [id, false] }, `unfreeze Familia card #${id}`) }
const after = await rd(card, S.mercadoCardAbi, 'getCard', [ids[ids.length - 1]])
console.log(`Javier card #${ids[ids.length - 1]} •••• ${after.last4} limit ${f(after.dailyLimit)} available ${f(after.availableToday)} frozen ${after.frozen}; debt ${f(await rd(A.creditPool, S.creditPoolAbi, 'getDebt', [driver.address]))}; xMXN v2 ${f(await rd(A.xMXN, S.tip20Abi, 'balanceOf', [driver.address]))}; pool cash ${f(await rd(A.creditPool, S.creditPoolAbi, 'availableLiquidity'))}`)
