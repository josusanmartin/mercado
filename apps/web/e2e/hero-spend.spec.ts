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

  // 1) Crédito · driver app (restyled): connect Uber (simulated consent) → draw an advance (25% ≈ 375 xMXN)
  await page.goto('/credito?tab=driver', { waitUntil: 'domcontentloaded' })
  const phone = page.getByLabel(/Driver app/)
  await expect(phone).toBeVisible({ timeout: 90_000 })
  await pause(1200)
  const connect = phone.getByRole('button', { name: /Continuar con Uber/i })
  const ready = phone.getByText(/Disponible ahora/i).first()
  // wait for the phone to settle on either the connect screen or an already-connected home (no race)
  await expect(connect.or(ready).first()).toBeVisible({ timeout: 60_000 })
  if (await connect.isVisible()) {
    await connect.click()
    await pause(1500) // simulated consent sheet
    await phone.getByRole('button', { name: /Permitir/i }).click()
  }
  await expect(phone.getByText(/Disponible ahora/i).first()).toBeVisible({ timeout: 60_000 })
  await pause(1500)
  await phone.getByRole('button', { name: /^Adelanto$/ }).click()
  const sheetA = page.getByLabel('Pedir adelanto')
  await expect(sheetA).toBeVisible({ timeout: 15_000 })
  await sheetA.getByRole('button', { name: /^25%$/ }).click()
  await pause(1000)
  await sheetA.getByRole('button', { name: /^Recibir .* xMXN/ }).click()
  await expect(page.getByText(/Ya es tuyo/)).toBeVisible({ timeout: 120_000 })
  await pause(1200)
  await page.getByRole('button', { name: /Ver mi adelanto/ }).click()
  await expect(phone.getByText(/^Debes$/i).first()).toBeVisible({ timeout: 30_000 })
  await top(page)
  await pause(1500)
  await page.screenshot({ path: join(OUT, 'hero-spend-final-advance.png') })

  // 2) Mercado Card as Javier at Tienda Doña Mary
  await page.goto('/card?holder=driver', { waitUntil: 'domcontentloaded' })
  const holderPhone = page.getByLabel('Cardholder phone, Android preview')
  await expect(holderPhone.getByText(/Hola, Javier/i)).toBeVisible({ timeout: 90_000 })
  const pos = page.getByLabel('Shop terminal')
  const freeze = holderPhone.getByRole('switch', { name: /Congelar/ })
  // the tap sheet inside the phone (target by role + its Aprobar/Rechazar/Cerrar content, not by name)
  const sheet = holderPhone.getByRole('dialog').first()
  await pause(1200)

  // 2a) frozen → the tap is declined, nothing charged → Cerrar
  if ((await freeze.getAttribute('aria-checked')) !== 'true') await freeze.click()
  await expect(freeze).toHaveAttribute('aria-checked', 'true', { timeout: 60_000 })
  await pause(800)
  for (const k of CHARGE) await pos.getByRole('button', { name: k, exact: true }).click()
  await pos.getByRole('button', { name: /Cobrar con Mercado Card/ }).click()
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  await pause(1000)
  await sheet.getByRole('button', { name: /Aprobar/ }).click()
  await expect(sheet.getByText(/Tarjeta congelada|Card is frozen|Rechazado/i).first()).toBeVisible({ timeout: 60_000 })
  await top(page)
  await pause(1500)
  await page.screenshot({ path: join(OUT, 'hero-spend-final-declined.png') })
  await sheet.getByRole('button', { name: /^Cerrar$/ }).first().click()
  await expect(sheet).toBeHidden({ timeout: 10_000 })

  // 2b) unfreeze → retry once → charged exactly once
  await freeze.click()
  await expect(freeze).toHaveAttribute('aria-checked', 'false', { timeout: 60_000 })
  await pause(800)
  for (const k of CHARGE) await pos.getByRole('button', { name: k, exact: true }).click()
  await pos.getByRole('button', { name: /Cobrar con Mercado Card/ }).click()
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  await pause(1000)
  await sheet.getByRole('button', { name: /Aprobar/ }).click()
  await expect(pos.getByText(/Cobrado · Charged/)).toBeVisible({ timeout: 120_000 }) // paid sheet auto-closes
  await expect(holderPhone.getByText(/Aún no hay cobros con esta tarjeta/)).toBeHidden({ timeout: 60_000 }) // Movimientos shows the charge
  await top(page)
  await pause(2000)
  await page.screenshot({ path: join(OUT, 'hero-spend-final-paid.png') })
  await pause(2000) // receipts on both sides + 'Adelanto pendiente'

  // 3) back to Crédito: the advance is still owed (spending didn't touch the debt)
  await page.goto('/credito?tab=driver', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel(/Driver app/).getByText(/^Debes$/i).first()).toBeVisible({ timeout: 60_000 })
  await top(page)
  await pause(2500)

  expect(errors, 'page errors during the take').toEqual([])
  const video = page.video()
  await page.close()
  if (video) copyFileSync(await video.path(), join(OUT, 'hero-spend-final.webm'))
})
