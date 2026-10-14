// Stage card proof N× in a row (lead 04:48 / CR-08): freeze → decline → Cerrar → unfreeze → MX$150 → Aprobar → 'Cobrado' on the POS AND exactly +1 chargeCount on-chain. SENDS REAL TXS on Javier (N × 150 xMXN, 4 txs/run). Announce first; run preflight after.
//   node scripts/card-proof-loop.mjs 5
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
const chargeCount = () => Number(execFileSync(process.env.HOME + '/.foundry/bin/cast', ['call', '0x052081d43f9A1e3637c2bBFC3b571b49d0C1F8b6', 'chargeCount()(uint256)', '--rpc-url', 'https://rpc.moderato.tempo.xyz']).toString().split(' ')[0])
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const { chromium, expect } = require('@playwright/test')
const N = Number(process.argv[2] ?? 5)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const bad = []
page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url().replace('http://localhost:3100', '').slice(0, 80)}`) })
page.on('console', (m) => m.type() === 'error' && bad.push('console: ' + m.text().slice(0, 120)))
await page.goto('http://localhost:3100/card?holder=driver', { waitUntil: 'domcontentloaded' })
const hp = page.getByLabel('Cardholder phone, Android preview')
await expect(hp.getByText(/Hola, Javier/i)).toBeVisible({ timeout: 90_000 })
const pos = page.getByLabel('Shop terminal'); const sheet = hp.getByRole('dialog').first()
const freeze = hp.getByRole('switch', { name: /Congelar/ })
const tap = async () => { for (const k of '150') await pos.getByRole('button', { name: k, exact: true }).click(); await pos.getByRole('button', { name: /Cobrar con Mercado Card/ }).click(); await expect(sheet).toBeVisible({ timeout: 30_000 }); await sheet.getByRole('button', { name: /Aprobar/ }).click() }
let pass = 0
for (let i = 1; i <= N; i++) {
  const t0 = Date.now(); const b0 = bad.length; const c0 = chargeCount()
  try {
    if ((await freeze.getAttribute('aria-checked')) !== 'true') await freeze.click()
    await expect(freeze).toHaveAttribute('aria-checked', 'true', { timeout: 60_000 })
    await tap()
    await expect(sheet.getByText(/Tarjeta congelada|Rechazado/i).first()).toBeVisible({ timeout: 60_000 })
    await sheet.getByRole('button', { name: /^Cerrar$/ }).first().click(); await expect(sheet).toBeHidden({ timeout: 10_000 })
    await freeze.click(); await expect(freeze).toHaveAttribute('aria-checked', 'false', { timeout: 60_000 })
    await tap()
    // pass = the terminal's receipt + exactly one new on-chain charge; 'Pagado' in the phone is best-effort (the sheet may auto-close first)
    const sawPagado = await expect(hp.getByText(/Pagado/).first()).toBeVisible({ timeout: 60_000 }).then(() => true, () => false)
    const tx = await pos.getByRole('link').filter({ hasText: /0x/ }).first().getAttribute('href').catch(() => '')
    await expect(pos.getByText(/Cobrado · Charged 150\.00/)).toBeVisible({ timeout: 30_000 })
    await expect(sheet).toBeHidden({ timeout: 10_000 })
    await page.waitForTimeout(3000); const dc = chargeCount() - c0
    if (dc !== 1) throw new Error(`chargeCount +${dc}, expected +1`)
    pass++
    console.log(`run ${i}: PASS (+1 charge on-chain, #${c0 + 1}, phone 'Pagado' ${sawPagado ? 'seen' : 'not seen'}) in ${((Date.now() - t0) / 1000).toFixed(1)}s ${tx ?? ''} ${bad.length > b0 ? 'non-200: ' + bad.slice(b0).join(' | ') : ''}`)
  } catch (e) {
    const st = (await sheet.isVisible()) ? (await sheet.innerText()).replace(/\s+/g, ' ').slice(0, 120) : '(no sheet)'
    console.log(`run ${i}: FAIL (chargeCount +${chargeCount() - c0}) ${e.message.split('\n')[0].slice(0, 100)} | sheet: ${st} | ${bad.slice(b0).join(' | ')}`)
    await page.screenshot({ path: new URL(`../review/qa-card-loop-fail-${i}.png`, import.meta.url).pathname })
    await page.reload({ waitUntil: 'domcontentloaded' }); await expect(hp.getByText(/Hola, Javier/i)).toBeVisible({ timeout: 90_000 })
  }
}
console.log(`${pass}/${N} PASS`)
await browser.close()
