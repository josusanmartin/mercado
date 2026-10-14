import { expect, test } from '@playwright/test'
import { createPublicClient, http, type Abi } from 'viem'
import { activeAddresses, mercadoCardAbi, TEMPO_RPC_URL } from '@mercado/shared'

// P0 residual (lead 04:48): a failed card charge must never vanish, and its retry must charge exactly once.
// Injects HTTP 429 into the terminal's charge broadcast (eth_sendRawTransaction through /api/rpc) until the
// POS gives up, checks the POS keeps the ticket amount and offers "Reintentar", then lifts the fault and
// retries: the SAME signed tap is resubmitted, and MercadoCard.chargeCount() rises by exactly 1.
// Sends ONE real testnet charge (1 xMXN, Javier at Tienda Doña Mary):
//   CARD_RETRY=1 npx playwright test -c apps/web/e2e card-retry --project desktop
test.skip(!process.env.CARD_RETRY, 'set CARD_RETRY=1 (sends one real testnet charge)')
test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(300_000)

const CARD = activeAddresses('v2').card!
const chain = createPublicClient({ transport: http(TEMPO_RPC_URL) })
const chargeCount = () => chain.readContract({ address: CARD, abi: mercadoCardAbi as Abi, functionName: 'chargeCount' }) as Promise<bigint>

test('card charge: injected 429 → POS keeps the amount + Reintentar → retry charges exactly once', async ({ page }) => {
  let fault = true
  let injected = 0
  await page.route('**/api/rpc', async (route) => {
    const body = route.request().postData() ?? ''
    if (fault && /eth_sendRawTransaction/.test(body)) {
      injected++
      return route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"rate limited (injected by card-retry.spec)"}' })
    }
    return route.continue()
  })

  await page.goto('/card?holder=driver', { waitUntil: 'domcontentloaded' })
  const holderPhone = page.getByLabel('Cardholder phone, Android preview')
  await expect(holderPhone.getByText(/Hola, Javier/i)).toBeVisible({ timeout: 90_000 })
  const pos = page.getByLabel('Shop terminal')
  const freeze = holderPhone.getByRole('switch', { name: /Congelar/ })
  if ((await freeze.getAttribute('aria-checked')) === 'true') {
    await freeze.click()
    await expect(freeze).toHaveAttribute('aria-checked', 'false', { timeout: 60_000 })
  }
  const before = await chargeCount()

  await pos.getByRole('button', { name: '1', exact: true }).click()
  await pos.getByRole('button', { name: /Cobrar con Mercado Card/ }).click()
  const sheet = holderPhone.getByRole('dialog').first()
  await sheet.getByRole('button', { name: /Aprobar/ }).click()

  // The charge fails: the POS must say so, keep the ticket's amount (not reset to 0) and offer a retry.
  await expect(pos.getByText(/No se pudo cobrar/)).toBeVisible({ timeout: 180_000 })
  await expect(pos.locator('p').filter({ hasText: /xMXN/ }).first()).toContainText('1.00')
  expect(injected).toBeGreaterThan(0)
  expect(await chargeCount()).toBe(before) // nothing was charged

  // The shopper's phone shows the same error; they close it (its sheet is modal), then the shop retries.
  await sheet.getByRole('button', { name: /^Cerrar$/ }).click()
  fault = false
  await pos.getByRole('button', { name: /Reintentar/ }).click()
  await expect(pos.getByText(/Cobrado · Charged 1(\.00)? xMXN/)).toBeVisible({ timeout: 120_000 })
  await expect.poll(chargeCount, { timeout: 30_000 }).toBe(before + 1n)
  // and no second charge appears afterwards
  await page.waitForTimeout(8_000)
  expect(await chargeCount()).toBe(before + 1n)
})
