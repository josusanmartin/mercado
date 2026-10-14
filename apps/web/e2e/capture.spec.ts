import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@playwright/test'

// Deck assets: Brand v4 product screens at 1440x900 (desktop project) and 390px (mobile).
//   CAPTURE=1 npx playwright test -c apps/web/e2e capture
// Writes deck/assets/qa-<product>-<desktop|mobile>.png, then `touch deck/PUBLISH` so lead uploads them for @slides.
const OUT = join(__dirname, '../../../deck/assets')
const ROUTES = [
  ['/', 'home'],
  ['/mint', 'mint'],
  ['/remesas', 'remesas'],
  ['/global', 'global'],
  ['/credito', 'credito'],
  ['/card', 'card'],
] as const

test.skip(!process.env.CAPTURE, 'set CAPTURE=1 to capture deck screenshots')

for (const [path, name] of ROUTES) {
  test(`capture ${name}`, async ({ page, isMobile }) => {
    mkdirSync(OUT, { recursive: true })
    if (isMobile) await page.setViewportSize({ width: 390, height: 844 })
    else await page.setViewportSize({ width: 1440, height: 900 })
    const res = await page.goto(path)
    test.skip((res?.status() ?? 404) >= 400, `${path} not live yet`)
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }) // dev overlay never in deck assets
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(4000) // live reads (balances, KPIs, activity) settle
    await page.screenshot({ path: join(OUT, `qa-${name}-${isMobile ? 'mobile' : 'desktop'}.png`) })
  })
}
