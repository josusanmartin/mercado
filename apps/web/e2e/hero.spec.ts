import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

// HERO RECORDING (deck + live-demo backup): Javier the driver → advance → 402 bill payment → receipt
// beside the remaining debt. Sends REAL testnet transactions as the demo Driver persona.
//   HERO=1 npx playwright test -c apps/web/e2e hero --project desktop
// Output: deck/assets/hero-driver.webm (+ a final still hero-driver-receipt.png)
const OUT = join(__dirname, '../../../deck/assets')
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

test.skip(!process.env.HERO, 'set HERO=1 to record the hero flow (sends testnet txs)')
test.use({ viewport: { width: 1440, height: 900 }, video: { mode: 'on', size: { width: 1440, height: 900 } } })
test.setTimeout(360_000)

test('hero: driver advance → MPP 402 bill payment → receipt + remaining debt', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop recording only')

  // 1) Get an advance as Javier (demo persona)
  await page.goto('/credit', { waitUntil: 'domcontentloaded' })
  await page.getByText('Steady driver').waitFor({ timeout: 90_000 })
  await pause(1500)
  await page.getByRole('button', { name: /^Connect$/ }).click()
  await pause(800)
  await page.getByRole('button', { name: /Javier/i }).first().click()
  await expect(page.getByRole('button', { name: /^Connect$/ })).toBeHidden({ timeout: 30_000 })
  await pause(1500)
  await page.getByText('Steady driver').click()
  await pause(1500)
  await page.getByRole('button', { name: 'Check eligibility' }).click()
  await page.getByText('Available now').waitFor({ timeout: 30_000 })
  await pause(3000) // score + why-offered explanation
  const amount = page.getByPlaceholder('Amount in xMXN')
  await amount.click()
  await amount.pressSequentially('300', { delay: 150 })
  await pause(1200)
  await page.getByRole('button', { name: 'Draw advance' }).click()
  await page.getByText(/Draw advance ✓/).waitFor({ timeout: 90_000 })
  await pause(3000) // advance landed + explorer link

  // 2) Pay Telcel airtime through the real MPP 402 flow
  await page.getByRole('link', { name: 'Pay bills' }).click()
  await pause(1500)
  await page.getByRole('button', { name: '$100', exact: true }).click()
  await pause(1200)
  await page.getByRole('button', { name: 'Get quote' }).click()
  await page.getByText('Checkout').waitFor({ timeout: 30_000 })
  await pause(2500) // quote locked: amount, merchant, SIMULATED label
  await page.getByRole('button', { name: /^Pay 100/ }).click()
  await page.getByText('Reference', { exact: true }).waitFor({ timeout: 120_000 })
  await pause(1500)
  mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: join(OUT, 'hero-driver-receipt.png') })
  // result view: Payment (on-chain tx) | Top-up (SIMULATED) | Your advance (still owed), side by side
  await pause(5000)

  const video = page.video()
  await page.close()
  if (video) copyFileSync(await video.path(), join(OUT, 'hero-driver.webm'))
})
