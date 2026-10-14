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

  // dev-only Next.js overlay ("N" / issues badge) must not appear in a deck recording; real errors are
  // still collected and printed below so they get fixed by the owner
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)))
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`))
  await page.addInitScript(() => {
    const css = 'nextjs-portal{display:none!important}'
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style')
      st.textContent = css
      document.head.appendChild(st)
    })
  })
  const persona = async () => {
    if (!(await page.getByRole('button', { name: /\(active\)/ }).count())) await page.getByRole('button', { name: /^Javier/ }).first().click()
    await page.getByRole('button', { name: /\(active\)/ }).first().waitFor({ timeout: 60_000 })
  }

  // 1) Get an advance as Javier (demo persona)
  await page.goto('/credit', { waitUntil: 'domcontentloaded' })
  await page.getByText('Steady driver').waitFor({ timeout: 90_000 })
  await pause(3000)
  await persona()
  await pause(1500)
  await page.getByText('Steady driver').click()
  await pause(2000) // Demo Uber Data weekly earnings
  await page.getByRole('button', { name: 'Check eligibility' }).click()
  await page.getByText('Available now').waitFor({ timeout: 30_000 })
  await pause(6000) // score + why-offered explanation
  await page.getByRole('button', { name: 'Draw an advance' }).click()
  await pause(1200)
  const amount = page.getByPlaceholder('Amount in xMXN')
  await amount.click()
  await amount.pressSequentially('300', { delay: 150 })
  await pause(1200)
  await page.getByRole('button', { name: 'Draw advance' }).click()
  await page.getByText(/Advance received|Draw advance ✓/).first().waitFor({ timeout: 90_000 })
  await pause(3500) // advance landed + explorer link
  mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: join(OUT, 'hero-driver-advance.png') })

  // 2) Pay Telcel airtime through the real MPP 402 flow
  await page.goto('/pay', { waitUntil: 'domcontentloaded' })
  await pause(3000)
  await persona()
  await pause(1200)
  await page.getByRole('button', { name: '$100', exact: true }).click()
  await pause(1200)
  await page.getByRole('button', { name: 'Get quote' }).click()
  await page.getByRole('heading', { name: 'Checkout' }).waitFor({ timeout: 30_000 })
  await pause(5000) // quote locked: amount, merchant, SIMULATED label
  await page.getByRole('button', { name: /^Pay 100/ }).click()
  await page.getByText('Reference', { exact: true }).waitFor({ timeout: 120_000 })
  await pause(1500)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(OUT, 'hero-driver-receipt.png') })
  // Receipt panel: on-chain payment | SIMULATED top-up | still owed, together
  await page.mouse.wheel(0, 300)
  await pause(8000)

  if (errors.length) console.log(`console errors during the take:\n${errors.join('\n')}`)
  const video = page.video()
  await page.close()
  if (video) copyFileSync(await video.path(), join(OUT, 'hero-driver.webm'))
})
