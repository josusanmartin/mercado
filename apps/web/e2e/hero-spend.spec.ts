import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'

// SPENDING-PROOF hero (judge item 2): Javier draws a real advance in the Crédito driver app, then pays at
// "Tienda Doña Mary" with HIS Mercado Card: first tap is declined (card frozen), he unfreezes, the retry is
// charged exactly once on-chain → receipts on both sides + his remaining debt. Sends REAL testnet txs (v2).
//   HERO=1 npx playwright test -c apps/web/e2e hero-spend --project desktop
// Output: deck/assets/hero-spend.webm (+ .mp4 via ffmpeg) and stills hero-spend-{advance,declined,paid}.png
const OUT = join(__dirname, '../../../deck/assets')
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const CHARGE = '150' // xMXN at the shop

test.skip(!process.env.HERO, 'set HERO=1 to record (sends testnet txs)')
test.use({ viewport: { width: 1440, height: 900 }, video: { mode: 'on', size: { width: 1440, height: 900 } } })
test.setTimeout(420_000)

const top = (page: Page) => page.evaluate(() => window.scrollTo({ top: 0 }))

async function hideDevOverlay(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style')
      st.textContent = 'nextjs-portal{display:none!important}'
      document.head.appendChild(st)
    })
  })
}

test('hero: advance → Mercado Card tap (frozen decline → unfreeze → one charge) → receipts + remaining debt', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop recording only')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)))
  await hideDevOverlay(page)
  mkdirSync(OUT, { recursive: true })

  // 1) Crédito · driver app: connect a platform (simulated consent) → draw a real advance
  await page.goto('/credito?tab=drivers', { waitUntil: 'domcontentloaded' })
  const phone = page.getByLabel('Driver app, Android phone preview')
  await expect(phone).toBeVisible({ timeout: 90_000 })
  await pause(1500)
  const connect = phone.getByRole('button', { name: /Continuar con Uber/i })
  if (await connect.isVisible().catch(() => false)) {
    await connect.click()
    await pause(1800) // simulated consent sheet: "Demo connection … never asks your password"
    await phone.getByRole('button', { name: /Permitir/i }).click()
  }
  await expect(phone.getByText(/Disponible ahora/i)).toBeVisible({ timeout: 60_000 })
  await pause(2000) // earnings + credit line
  await phone.getByRole('button', { name: /^Recibir .* xMXN/ }).click()
  await expect(phone.getByText(/Debes · You owe/)).toBeVisible({ timeout: 120_000 })
  await top(page)
  await pause(1500)
  await page.screenshot({ path: join(OUT, 'hero-spend-advance.png') })

  // 2) Mercado Card as Javier, at Tienda Doña Mary
  await page.goto('/card?holder=driver', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText(/Hola, Javier/)).toBeVisible({ timeout: 90_000 })
  const holderPhone = page.getByLabel('Cardholder phone, Android preview')
  const pos = page.getByRole('region', { name: 'Shop terminal' }).or(page.getByLabel('Shop terminal'))
  const freeze = holderPhone.getByRole('switch')
  await pause(1500)

  // 2a) freeze → the tap is declined, nothing charged
  if ((await freeze.getAttribute('aria-checked')) !== 'true') await freeze.click()
  await expect(freeze).toHaveAttribute('aria-checked', 'true', { timeout: 60_000 })
  await pause(1500)
  for (const k of CHARGE) await pos.getByRole('button', { name: k, exact: true }).click()
  await pause(800)
  await pos.getByRole('button', { name: /Cobrar con Mercado Card/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Approve card payment' })
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  await pause(1500)
  await sheet.getByRole('button', { name: /Aprobar/ }).click()
  // the friendly decline copy (contracts' readableError: 'Tarjeta congelada · Card is frozen')
  await expect(sheet.getByText(/Tarjeta congelada|Card is frozen/i)).toBeVisible({ timeout: 60_000 })
  await top(page)
  await pause(1500)
  await page.screenshot({ path: join(OUT, 'hero-spend-declined.png') })
  // close the sheet so the freeze toggle is reachable (no waiting out the tap deadline)
  const close = sheet.getByRole('button', { name: /Cerrar|Close|Listo|OK/i })
  if (await close.isVisible().catch(() => false)) await close.click()
  await expect(sheet).toBeHidden({ timeout: 10_000 })

  // 2b) unfreeze → retry once → charged exactly once
  await freeze.click()
  await expect(freeze).toHaveAttribute('aria-checked', 'false', { timeout: 60_000 })
  await pause(1500)
  for (const k of CHARGE) await pos.getByRole('button', { name: k, exact: true }).click()
  await pause(800)
  await pos.getByRole('button', { name: /Cobrar con Mercado Card/ }).click()
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  await pause(1500)
  await sheet.getByRole('button', { name: /Aprobar/ }).click()
  // the paid sheet auto-closes after 2.5s, so gate on the POS's persistent receipt
  await expect(pos.getByText(/Cobrado · Charged/)).toBeVisible({ timeout: 120_000 })
  // wait for the live reads to reflect the charge before the final still: left-today drops by 150 and the
  // charge shows up in Card activity (CardCharged event)
  await expect(page.getByText(/No charges on this card yet/)).toBeHidden({ timeout: 60_000 })
  await expect(holderPhone.getByText(/^\d+ \/ 1,000 gastado$/).filter({ hasNotText: /^0 \// })).toBeVisible({ timeout: 60_000 }).catch(() => {})
  await top(page)
  await pause(2500)
  await page.screenshot({ path: join(OUT, 'hero-spend-paid.png') })
  await pause(4000) // receipts on both sides + remaining debt

  expect(errors, 'page errors during the take').toEqual([])
  const video = page.video()
  await page.close()
  if (video) copyFileSync(await video.path(), join(OUT, 'hero-spend.webm'))
})
