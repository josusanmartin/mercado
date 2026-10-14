import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Locator, type Page, test } from '@playwright/test'

// v7 deck captures (lead 03:38): DARK theme, '?present=1' (capture-only: hides in-app honesty labels; the app
// without the flag is unchanged), ELEMENT-level at deviceScaleFactor 2: phones as transparent PNGs, tight panels.
//   CAPTURE=1 npx playwright test -c apps/web/e2e capture-v7 --project desktop
// The Card step sends ONE real charge (Javier → Tienda Doña Mary) to get a genuine POS receipt.
const OUT = join(__dirname, '../../../deck/assets/v7')

test.skip(!process.env.CAPTURE, 'set CAPTURE=1 to capture deck assets')
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
test.setTimeout(240_000)

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop captures only')
  mkdirSync(OUT, { recursive: true })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mercado.theme', 'dark')
    } catch {}
  })
})

async function go(page: Page, path: string) {
  await page.goto(path + (path.includes('?') ? '&' : '?') + 'present=1', { waitUntil: 'domcontentloaded' })
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(3500) // live reads settle
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.locator('html')).toHaveAttribute('data-present', /1|true/)
}

const phoneOf = (page: Page) => page.getByRole('group', { name: /Android/ }).first()

/** The phone alone, floating: make every ancestor's background transparent, then omitBackground. */
async function shootPhone(page: Page, name: string) {
  const phone = phoneOf(page)
  await phone.scrollIntoViewIfNeeded()
  await phone.evaluate((el) => {
    let n: HTMLElement | null = el.parentElement
    while (n) {
      n.style.setProperty('background', 'transparent', 'important')
      n.style.setProperty('box-shadow', 'none', 'important')
      n = n.parentElement
    }
  })
  await page.waitForTimeout(300)
  await phone.screenshot({ path: join(OUT, `${name}.png`), omitBackground: true, animations: 'disabled' })
}

/** Tightest container holding all the given texts (innermost match). */
function panel(page: Page, texts: RegExp[]): Locator {
  let l = page.locator('section, article, div')
  for (const t of texts) l = l.filter({ hasText: t })
  return l.last()
}
async function shootPanel(loc: Locator, name: string) {
  await loc.scrollIntoViewIfNeeded()
  await loc.page().waitForTimeout(300)
  await loc.screenshot({ path: join(OUT, `${name}.png`), animations: 'disabled' })
}

test('remesas: home + send quote (review sheet, no send)', async ({ page }) => {
  await go(page, '/remesas')
  await shootPhone(page, 'phone-remesas-home')
  const phone = phoneOf(page)
  await phone.getByRole('button', { name: /^Enviar$/ }).first().click()
  for (const k of '500') await phone.getByRole('button', { name: k, exact: true }).first().click()
  await phone.getByRole('button', { name: /^Continuar$/ }).first().click()
  await expect(phone.getByText(/Tipo de cambio/).first()).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1200)
  await shootPhone(page, 'phone-remesas-quote')
})

test('credito: driver Inicio + advance sheet (no draw)', async ({ page }) => {
  await go(page, '/credito?tab=driver')
  const phone = phoneOf(page)
  const connect = phone.getByRole('button', { name: /Continuar con Uber/i })
  const ready = phone.getByText(/Disponible ahora/i).first()
  await expect(connect.or(ready).first()).toBeVisible({ timeout: 60_000 })
  if (await connect.isVisible()) {
    await connect.click()
    await phone.getByRole('button', { name: /Permitir/i }).click()
    await expect(ready).toBeVisible({ timeout: 60_000 })
  }
  await page.waitForTimeout(1500)
  await shootPhone(page, 'phone-credito-inicio')
  await phone.getByRole('button', { name: /^Adelanto$/ }).click()
  await expect(page.getByLabel('Pedir adelanto')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(1000)
  await shootPhone(page, 'phone-credito-adelanto')
})

test('card: Javier pays MX$450 at Tienda Doña Mary (one real charge) → phone + POS receipt', async ({ page }) => {
  await go(page, '/card?holder=driver')
  const phone = phoneOf(page)
  await expect(phone.getByText(/Hola, Javier/i)).toBeVisible({ timeout: 60_000 })
  const pos = page.getByLabel('Shop terminal')
  for (const k of '450') await pos.getByRole('button', { name: k, exact: true }).click()
  await pos.getByRole('button', { name: /Cobrar con Mercado Card/ }).click()
  const sheet = phone.getByRole('dialog').first()
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(800)
  await shootPhone(page, 'phone-card-approve') // the tap prompt: "Tienda Doña Mary te cobra"
  await sheet.getByRole('button', { name: /Aprobar/ }).click()
  await expect(pos.getByText(/Cobrado · Charged/)).toBeVisible({ timeout: 120_000 })
  await expect(phone.getByText(/Aún no hay cobros con esta tarjeta/)).toBeHidden({ timeout: 30_000 })
  await page.waitForTimeout(3500) // paid sheet auto-closes; Movimientos shows the charge
  await shootPhone(page, 'phone-card-holder')
  await shootPanel(pos, 'panel-card-pos-receipt')
})

test('invest: phone with the real-time counters', async ({ page }) => {
  await go(page, '/invest')
  await page.waitForTimeout(2500)
  await shootPhone(page, 'phone-invest')
})

test('panels: Mint Risk numbers, Global quote, Crédito loan book, 402 trace, verified contracts', async ({ page }) => {
  await go(page, '/mint')
  await page.getByRole('tab', { name: /^(Risk|Riesgo)/i }).or(page.getByRole('button', { name: /^(Risk|Riesgo)/i })).first().click()
  await page.waitForTimeout(2500)
  await shootPanel(panel(page, [/01 · Respaldo del intercambio/i, /02 · Respaldo del sistema/i]), 'panel-mint-risk')

  await go(page, '/global')
  await shootPanel(panel(page, [/Indicative quote/i, /Rate/i]), 'panel-global-quote')

  await go(page, '/credito?tab=backoffice')
  await shootPanel(panel(page, [/^Loan book/]), 'panel-credito-loanbook')

  await go(page, '/developers')
  await shootPanel(panel(page, [/The 402 challenge/i]), 'panel-developers-402')

  await go(page, '/contracts')
  await shootPanel(panel(page, [/01 · Mint/i, /Verified|verificad|exact/i]), 'panel-contracts-verified')
})
