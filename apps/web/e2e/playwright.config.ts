import { defineConfig, devices } from '@playwright/test'

// Smoke tests run against the already-running dev server (owned by `web`, tmux mercado:dev).
//   npx playwright test -c apps/web/e2e
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  outputDir: 'results',
  use: {
    baseURL: process.env.MERCADO_API_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
