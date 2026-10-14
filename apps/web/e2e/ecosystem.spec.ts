import { expect, type Page, test } from '@playwright/test'

// Ecosystem IA (crew/DESIGN-ECOSYSTEM.md): one currency, four products. Read-only: no transactions.
//   npx playwright test -c apps/web/e2e ecosystem
const PRODUCTS = [
  { path: '/mint', name: /Mercado Mint/i },
  { path: '/remesas', name: /Mercado Remesas/i },
  { path: '/global', name: /Mercado Global/i },
  { path: '/credito', name: /Mercado Cr[ée]dito/i },
]

const visible = (page: Page, re: RegExp) => page.getByText(re).filter({ visible: true }).first()

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource|WalletConnect|metamask|402/i.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`)
  })
  return errors
}

async function honesty(page: Page) {
  await expect(visible(page, /testnet/i)).toBeVisible()
  await expect(visible(page, /no real value/i)).toBeVisible()
  await expect(visible(page, /not redeemable/i)).toBeVisible()
  await expect(visible(page, /moderato|42431/i)).toBeVisible()
}

test('home: the ecosystem map names all four products around xMXN', async ({ page }) => {
  const errors = trackErrors(page)
  expect((await page.goto('/'))?.status()).toBeLessThan(400)
  for (const p of PRODUCTS) await expect(visible(page, p.name)).toBeVisible()
  await expect(visible(page, /xMXN/)).toBeVisible()
  await honesty(page)
  expect(errors).toEqual([])
})

for (const p of PRODUCTS) {
  test(`${p.path}: product page renders with its name, honesty labels and no runtime errors`, async ({ page }) => {
    const errors = trackErrors(page)
    expect((await page.goto(p.path))?.status()).toBeLessThan(400)
    await expect(visible(page, p.name)).toBeVisible()
    await honesty(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `${p.path} horizontal overflow`).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}

test('the persona selector is gone (Demo mode replaces it)', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Profiles' })).toHaveCount(0)
  await expect(visible(page, /demo mode/i)).toBeVisible()
})

test('product-specific mock labels', async ({ page }) => {
  await page.goto('/credito')
  await expect(visible(page, /Demo Uber Data/)).toBeVisible()
  await expect(visible(page, /illustrative/i)).toBeVisible()
  await page.goto('/remesas')
  await expect(visible(page, /SIMULATED|simulad/i)).toBeVisible()
  await page.goto('/global')
  await expect(visible(page, /indicativ/i)).toBeVisible() // "signed indicative quote", never "firm"
  await expect(page.getByText(/\bfirm quote\b/i)).toHaveCount(0)
  await page.goto('/mint')
  await expect(visible(page, /mock|admin-relayed|reference rate/i)).toBeVisible()
})

test.describe('old routes redirect into the products', () => {
  for (const [from, to] of [
    ['/credit', /\/credito\?tab=drivers/],
    ['/earn', /\/credito\?tab=lenders/],
    ['/pay', /\/remesas\?screen=aire/], // lands on the airtime intent, not Send
    ['/send', /\/remesas/],
  ] as const) {
    test(`${from} → ${to}`, async ({ page }) => {
      await page.goto(from)
      await expect(page).toHaveURL(to)
    })
  }
})

test('remesas: Android phone frame on desktop, full-screen app at phone width', async ({ page, isMobile }) => {
  await page.goto('/remesas')
  const frame = page.getByRole('group', { name: 'Android phone preview' })
  if (isMobile) {
    await expect(frame).toBeHidden()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, 'remesas full-screen overflow').toBeLessThanOrEqual(1)
  } else {
    await expect(frame).toBeVisible()
    const box = await frame.boundingBox()
    expect(box?.width ?? 0, 'phone frame ~360px wide').toBeLessThan(420)
  }
  await honesty(page)
})

test('remesas at exactly 390px: full-screen (no frame)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/remesas')
  await expect(page.getByRole('group', { name: 'Android phone preview' })).toBeHidden()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await honesty(page)
})

test.describe('credito tabs', () => {
  for (const [tab, label, re] of [
    ['drivers', 'Drivers', /Demo Uber Data/],
    ['lenders', 'Lenders', /no guaranteed return/i],
    ['api', 'Underwriting API', /402/],
  ] as const) {
    test(`${label} tab`, async ({ page }) => {
      const errors = trackErrors(page)
      await page.goto('/credito')
      await page.getByRole('tab', { name: new RegExp(label) }).or(page.getByRole('button', { name: new RegExp(`^${label}`) })).first().click()
      await expect(page).toHaveURL(new RegExp(`tab=${tab}`))
      await expect(visible(page, re)).toBeVisible()
      await honesty(page)
      expect(errors).toEqual([])
    })
  }
})
