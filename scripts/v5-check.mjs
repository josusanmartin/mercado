#!/usr/bin/env node
// v5 UI pass gate (lead 04:44): after each web/mobile push, READ-ONLY. For every route at 1440x900 in dark + light,
// with normal and reduced motion: HTTP 200, zero console errors, no horizontal overflow, the phone ending ≤868px
// (lead 04:53) or the page's primary action inside the first 900px fold, and under prefers-reduced-motion no long-running animations.
// Screenshots go to review/qa-v5/<label>/ for before/after comparison.
//   node scripts/v5-check.mjs before        # baseline
//   node scripts/v5-check.mjs after-<sha>   # after a push; exit 1 on any FAIL
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const { chromium } = require('@playwright/test')
const BASE = process.env.MERCADO_APP_URL ?? 'http://localhost:3100'
const label = process.argv[2] ?? 'run'
const OUT = new URL(`../review/qa-v5/${label}/`, import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

// route → the element that must sit in the first 900px (the phone, or the primary action)
const ROUTES = [
  { path: '/', name: 'home', fold: (p) => p.getByRole('link', { name: /Mint|Start|Tour/i }).first() },
  { path: '/mint', name: 'mint', fold: (p) => p.getByRole('tab').or(p.getByRole('button', { name: /Deposit|Depositar|Mint|Crear/i })).first() },
  { path: '/remesas', name: 'remesas', phone: true },
  { path: '/global', name: 'global', fold: (p) => p.getByRole('textbox').first() },
  { path: '/credito?tab=driver', name: 'credito', phone: true },
  { path: '/card?holder=driver', name: 'card', phone: true },
  { path: '/invest', name: 'invest', phone: true },
  { path: '/developers', name: 'developers' },
  { path: '/contracts', name: 'contracts' },
]

const results = []
const browser = await chromium.launch()
for (const theme of ['dark', 'light']) {
  for (const motion of ['no-preference', 'reduce']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: motion })
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('mercado.theme', t)
      } catch {}
    }, theme)
    for (const r of ROUTES) {
      // the reduced-motion pass only needs the checks, not a second full screenshot set in light mode
      const page = await ctx.newPage()
      const errors = []
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)))
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`))
      const row = { route: r.path, theme, motion, status: 0, errors: 0, overflowX: 0, fold: '-', anims: '-', ok: true, notes: [] }
      try {
        const res = await page.goto(BASE + r.path, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        row.status = res?.status() ?? 0
        await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
        await page.waitForTimeout(3000)
        row.overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        const target = r.phone ? page.getByRole('group', { name: /Android/ }).first() : r.fold?.(page)
        if (target) {
          const box = await target.boundingBox().catch(() => null)
          row.fold = box ? `${Math.round(box.y + box.height)}px` : 'missing'
          if (!box || box.y + box.height > (r.phone ? 868 : 900)) row.notes.push(r.phone ? 'phone below the fold' : 'primary action below the fold')
        }
        if (motion === 'reduce') {
          // anything still animating 1.5s after settle, longer than 1s and not a 1-frame tick, is a reduced-motion leak
          const leaks = await page.evaluate(() =>
            document
              .getAnimations()
              .filter((a) => a.playState === 'running')
              .map((a) => {
                const t = a.effect?.getTiming?.() ?? {}
                const el = a.effect?.target
                return { d: Number(t.duration) || 0, it: t.iterations, name: a.animationName ?? a.constructor.name, el: el ? `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}` : '' }
              })
              .filter((x) => x.d > 1000 || x.it === Infinity),
          )
          row.anims = String(leaks.length)
          if (leaks.length) row.notes.push(`reduced-motion: ${leaks.length} running (${leaks.slice(0, 2).map((l) => `${l.name}@${l.el}`).join(', ')})`)
        }
        if (motion === 'no-preference') await page.screenshot({ path: join(OUT, `${r.name}-${theme}.png`) })
      } catch (e) {
        row.notes.push(`error: ${e.message.split('\n')[0].slice(0, 120)}`)
      }
      row.errors = errors.length
      if (errors.length) row.notes.push(`console: ${errors[0]}`)
      if (row.status !== 200) row.notes.push(`HTTP ${row.status}`)
      if (row.overflowX > 0) row.notes.push(`horizontal overflow ${row.overflowX}px`)
      row.ok = row.notes.length === 0
      results.push(row)
      await page.close()
    }
    await ctx.close()
  }
}
await browser.close()

const fails = results.filter((r) => !r.ok)
const lines = results.map((r) => `${r.ok ? '✅' : '❌'} ${r.route.padEnd(22)} ${r.theme.padEnd(5)} ${r.motion.padEnd(13)} fold ${String(r.fold).padEnd(7)} ${r.notes.join(' · ')}`)
const report = `v5-check ${label} · ${BASE} · ${new Date().toISOString().slice(0, 19)}Z\n\n${lines.join('\n')}\n\n${fails.length ? `❌ ${fails.length} FAIL` : '✅ ALL PASS'} of ${results.length}\n`
writeFileSync(join(OUT, 'report.txt'), report)
console.log(report)
process.exit(fails.length ? 1 : 0)
