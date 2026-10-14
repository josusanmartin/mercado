import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@playwright/test'

// Deck assets: screenshots of every tab at 1440x900 (desktop project) and phone size (mobile project).
//   CAPTURE=1 npx playwright test -c apps/web/e2e capture
// Writes to deck/assets/ (then `touch deck/PUBLISH` so lead uploads them for @slides).
const OUT = join(__dirname, '../../../deck/assets')
const TABS = ['/', '/mint', '/send', '/credit', '/pay', '/earn']

test.skip(!process.env.CAPTURE, 'set CAPTURE=1 to capture deck screenshots')

for (const path of TABS) {
  test(`capture ${path}`, async ({ page, isMobile }) => {
    mkdirSync(OUT, { recursive: true })
    if (!isMobile) await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(path)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1500) // let charts/quotes settle
    const name = `${path === '/' ? 'home' : path.slice(1)}-${isMobile ? 'mobile' : 'desktop'}.png`
    await page.screenshot({ path: join(OUT, name), fullPage: !isMobile })
  })
}
