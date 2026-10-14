import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { type Page, test } from '@playwright/test'

// v5 (PRINCIPLES restyle) deck captures, desktop 1440x900, top-scrolled, dev overlay hidden. Read-only.
//   CAPTURE=1 npx playwright test -c apps/web/e2e capture-v5 --project desktop
const OUT = join(__dirname, '../../../deck/assets')
const SHOTS: { name: string; path: string; tab?: RegExp }[] = [
  { name: 'home', path: '/' },
  { name: 'mint', path: '/mint' },
  { name: 'mint-risk', path: '/mint', tab: /^(Risk|Riesgo)/i },
  { name: 'remesas', path: '/remesas' },
  { name: 'global', path: '/global' },
  { name: 'credito-backoffice', path: '/credito?tab=backoffice' },
  { name: 'developers', path: '/developers' },
  { name: 'contracts', path: '/contracts' },
]

test.skip(!process.env.CAPTURE, 'set CAPTURE=1 to capture deck screenshots')
test.use({ viewport: { width: 1440, height: 900 } })

async function settle(page: Page) {
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(4000) // live reads (chain + API) settle
  await page.evaluate(() => window.scrollTo({ top: 0 }))
  await page.waitForTimeout(400)
}

for (const s of SHOTS) {
  test(`capture ${s.name}-v5`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop captures only')
    mkdirSync(OUT, { recursive: true })
    const res = await page.goto(s.path)
    test.skip((res?.status() ?? 404) >= 400, `${s.path} not live`)
    if (s.tab) {
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.getByRole('tab', { name: s.tab }).or(page.getByRole('button', { name: s.tab })).first().click()
    }
    await settle(page)
    await page.screenshot({ path: join(OUT, `${s.name}-v5.png`) })
  })
}
