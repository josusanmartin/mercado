import { expect, type Page, test } from '@playwright/test'

// Mercado UI smoke: every tab renders, honesty labels are visible, no console errors, no horizontal
// overflow on mobile, and the API carries its demo/simulated labels. Read-only: no transactions are sent.

const TABS = [
  { path: '/', name: 'Home' },
  { path: '/mint', name: 'Create pesos' },
  { path: '/send', name: 'Send money' },
  { path: '/credit', name: 'Get an advance' },
  { path: '/pay', name: 'Pay bills' },
  { path: '/earn', name: 'Earn' },
]

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    // wallet/RPC noise isn't a UI failure; real React/runtime errors are
    if (m.type() === 'error' && !/favicon|Failed to load resource|WalletConnect|metamask/i.test(m.text())) errors.push(`console: ${m.text()}`)
  })
  return errors
}

for (const tab of TABS) {
  test(`${tab.name} (${tab.path}) renders with the testnet banner and network badge`, async ({ page }) => {
    const errors = trackErrors(page)
    const res = await page.goto(tab.path)
    expect(res?.status(), `${tab.path} HTTP status`).toBeLessThan(400)
    await expect(page.getByText(/testnet prototype/i).filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByText(/moderato|42431/i).filter({ visible: true }).first()).toBeVisible()
    // honesty line: collateral has no value and xMXN isn't redeemable (must be visible on mobile too)
    await expect(page.getByText(/no real value/i).filter({ visible: true }).first()).toBeVisible()
    // no horizontal scroll (mobile layout check, harmless on desktop)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `${tab.path} horizontal overflow in px`).toBeLessThanOrEqual(1)
    expect(errors, `${tab.path} runtime errors`).toEqual([])
  })
}

test('Create pesos labels the oracle as a mock and the collateral as testnet OUSD', async ({ page }) => {
  await page.goto('/mint')
  await expect(page.getByText(/testnet OUSD|no real value/i).filter({ visible: true }).first()).toBeVisible()
  await page.getByText('Exchange rate', { exact: true }).click()
  await expect(page.getByText(/mock/i).filter({ visible: true }).first()).toBeVisible()
})

test('Send money says on-chain delivery only (no SPEI cash-out)', async ({ page }) => {
  await page.goto('/send')
  await expect(page.getByText(/on-?chain delivery only|no SPEI|SPEI|no bank cash-?out/i).filter({ visible: true }).first()).toBeVisible()
})

test('Get an advance shows the Demo Uber Data label and a no-credit-model disclaimer', async ({ page }) => {
  await page.goto('/credit')
  await expect(page.getByText(/Demo Uber Data/i).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText(/not a (validated )?credit|illustrative/i).filter({ visible: true }).first()).toBeVisible()
})

test('Pay bills marks fulfillment SIMULATED', async ({ page }) => {
  await page.goto('/pay')
  await expect(page.getByText(/SIMULATED/).filter({ visible: true }).first()).toBeVisible()
})

test('Earn makes no APY promise', async ({ page }) => {
  await page.goto('/earn')
  await expect(page.getByText(/no guaranteed (APY|return|yield)|not guaranteed|no yield/i).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText(/guaranteed (APY|yield|return)/i).filter({ hasNotText: /no |not /i })).toHaveCount(0)
})

test.describe('API labels', () => {
  test.skip(({ isMobile }) => isMobile, 'API checks run once')

  test('/api/fx is labeled as a mock feed', async ({ request }) => {
    const fx = await (await request.get('/api/fx')).json()
    expect(fx.isMock).toBe(true)
    expect(fx.label).toMatch(/mock|illustrative/i)
  })

  test('/api/driver/demo carries demo:true + "Demo Uber Data"', async ({ request }) => {
    const d = await (await request.get('/api/driver/demo?profile=steady')).json()
    expect(d.demo).toBe(true)
    expect(d.label).toMatch(/Demo Uber Data/)
  })

  test('new-driver profile is ineligible and gets no attestation', async ({ request }) => {
    const r = await request.post('/api/driver/score', {
      data: { borrower: '0x871aF8b66406F96C6b5f8a156242d9B7a026cC63', profile: 'new-driver' },
    })
    const s = await r.json()
    expect(s.demo).toBe(true)
    expect(s.eligible).toBe(false)
    expect(s.attestation).toBeUndefined()
  })

  test('unpaid /api/bills/pay returns a real 402 Payment challenge; quote is SIMULATED', async ({ request }) => {
    const q = await request.post('/api/bills/quote', { data: { provider: 'telcel', phone: '5512345678', amountMxn: 50 } })
    expect(q.status()).toBe(200)
    const quote = await q.json()
    expect(quote.simulated).toBe(true)
    const pay = await request.post('/api/bills/pay', { data: { quoteId: quote.quoteId, idempotencyKey: `e2e-${Date.now()}` } })
    expect(pay.status()).toBe(402)
    expect(pay.headers()['www-authenticate'] ?? '').toMatch(/^Payment /i)
  })

  test('invalid input is rejected with 400, not 500', async ({ request }) => {
    expect((await request.post('/api/driver/score', { data: { borrower: '0xnope', profile: 'steady' } })).status()).toBe(400)
    expect((await request.get('/api/driver/demo?profile=evil')).status()).toBe(400)
    expect((await request.post('/api/bills/quote', { data: { provider: 'telcel', amountMxn: -5 } })).status()).toBe(400)
  })
})
