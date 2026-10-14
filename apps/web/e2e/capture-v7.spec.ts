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
  // web sets html[data-present] as an empty boolean attribute; presence = capture mode on
  await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-present')), { timeout: 10_000 }).toBe(true)
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
/** The Panel component renders a <section>: take the heading's nearest section. */
const sectionOf = (page: Page, heading: RegExp) => page.getByRole('heading', { name: heading }).first().locator('xpath=ancestor::section[1]')
/** Sticky/fixed bars (top bar, footer) would overlap element shots: hide them for capture. */
async function hideChrome(page: Page) {
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const pos = getComputedStyle(el).position
      if (pos === 'sticky' || pos === 'fixed') el.style.setProperty('visibility', 'hidden', 'important')
    }
  })
}
/** Screenshot the union of several elements' boxes (+pad), with the sticky chrome hidden. */
async function shootUnion(page: Page, locs: Locator[], name: string, pad = 16) {
  await hideChrome(page)
  await locs[0].scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  const boxes = (await Promise.all(locs.map((l) => l.boundingBox()))).filter((b): b is NonNullable<typeof b> => !!b)
  expect(boxes.length, `all ${name} parts visible`).toBe(locs.length)
  const x = Math.min(...boxes.map((b) => b.x)) - pad
  const y = Math.min(...boxes.map((b) => b.y)) - pad
  const r = Math.max(...boxes.map((b) => b.x + b.width)) + pad
  const btm = Math.max(...boxes.map((b) => b.y + b.height)) + pad
  await page.screenshot({ path: join(OUT, `${name}.png`), clip: { x: Math.max(0, x), y: Math.max(0, y), width: r - Math.max(0, x), height: btm - Math.max(0, y) } })
}
async function shootPanel(loc: Locator, name: string) {
  await hideChrome(loc.page())
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
  // lead 04:29: Javier raises HIS OWN daily limit (one holder-signed tx) so 'Disponible hoy' covers MX$450
  const limitRow = phone.getByRole('button', { name: /Límite diario/ }).first()
  if (!/5,000/.test((await limitRow.textContent()) ?? '')) {
    await limitRow.click()
    await phone.getByLabel('Límite diario en xMXN').fill('5000')
    await phone.getByRole('button', { name: /Guardar límite/ }).click()
    await expect(limitRow).toContainText('5,000', { timeout: 120_000 })
    await page.waitForTimeout(2500) // sheet closes, availableToday refreshes
    await phone.getByText(/Hola, Javier/i).scrollIntoViewIfNeeded() // back to the top of the app
  }
  const pos = page.getByLabel('Shop terminal')
  for (const k of '450') await pos.getByRole('button', { name: k, exact: true }).click()
  await pos.getByRole('button', { name: /Cobrar con Mercado Card/ }).click()
  const sheet = phone.getByRole('dialog').first()
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(800)
  await shootPhone(page, 'phone-card-approve') // the tap prompt: "Tienda Doña Mary te cobra"
  const saldo = async () => ((await phone.getByLabel('Saldo').innerText().catch(() => '')) || '').replace(/\s+/g, '')
  const before = (await saldo()).match(/MX\$[\d,]+/)?.[0]
  await sheet.getByRole('button', { name: /Aprobar/ }).click()
  await expect(pos.getByText(/Cobrado · Charged/)).toBeVisible({ timeout: 120_000 })
  // CR-08 freshness: POS receipt → the phone's balance changes (target ≤ 2 s)
  const t0 = Date.now()
  await expect.poll(async () => (await saldo()).match(/MX\$[\d,]+/)?.[0], { timeout: 30_000, intervals: [50] }).not.toBe(before)
  console.log(`[freshness] POS receipt → phone balance ${before} → ${(await saldo()).match(/MX\$[\d,]+/)?.[0]}: ${Date.now() - t0} ms`)
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

test('panels: Mint Risk numbers, Crédito loan book, 402 trace, verified contracts', async ({ page }) => {
  await go(page, '/mint')
  await page.getByRole('tab', { name: /^(Risk|Riesgo)/i }).or(page.getByRole('button', { name: /^(Risk|Riesgo)/i })).first().click()
  await page.waitForTimeout(2500)
  // v6 (contracts 10:17): English labels + the FX gauge under them; clip the two big numbers through the gauge's caption
  await shootUnion(
    page,
    [page.getByText(/01 · Exchange coverage/i).first(), page.getByText(/02 · System backing/i).first(), page.locator('figure[aria-label^="USD/MXN today"]').first()],
    'panel-mint-risk',
  )

  await go(page, '/credito?tab=backoffice')
  await shootPanel(sectionOf(page, /^Loan book/i), 'panel-credito-loanbook')

  await go(page, '/developers')
  await shootPanel(sectionOf(page, /^The 402 challenge/i), 'panel-developers-402')

  // /contracts v6 (contracts 10:17): the permissions graph + the 'Verified ✓ N of M' tally under it. The 'how xMXN is
  // minted' dots play ~1.2 s on arrival, so wait for the still frame.
  await go(page, '/contracts')
  await page.waitForTimeout(1800)
  await shootUnion(page, [page.locator('figure[aria-label^="Contract architecture"]').first(), page.getByRole('link', { name: /Verified ✓ \d+ of \d+/ }).first()], 'panel-contracts-verified')
})

// lead 04:24: the deck's Global example is US$1,000 (quote only, nothing is sent)
test('global: US$1,000 supplier quote panel', async ({ page }) => {
  await go(page, '/global')
  const pay = page.getByLabel(/You pay/i).or(page.getByRole('textbox').first()).first()
  await pay.fill('1000')
  await page.waitForTimeout(3000) // quote refresh
  await expect(sectionOf(page, /^Indicative quote/i).getByText(/18,\d{3}\.\d\d/).first()).toBeVisible({ timeout: 20_000 })
  await shootPanel(sectionOf(page, /^Indicative quote/i), 'panel-global-quote')
})
