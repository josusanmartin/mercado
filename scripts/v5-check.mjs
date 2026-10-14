#!/usr/bin/env node
// v5 UI pass gate (lead 04:44): after each web/mobile push, READ-ONLY. For every route at 1440x900 in dark + light,
// with normal and reduced motion, plus a 390x844 phone-width pass (dark): HTTP 200, zero console errors, no horizontal overflow, the phone ending ≤868px
// (lead 04:53) or the page's primary action inside the first 900px fold, and under prefers-reduced-motion no long-running animations.
// Motion (v6): no animation > 2 s after settle unless it's an intentional loop (live counters/tickers; [data-loop] only on Home, lead 09:21; FlowPath
// dots must be still at arrival, lead 09:12 V6 #2),
// and nothing long or infinite under reduced motion. CLS on arrival ≤ 0.05 (desktop gate).
// Headings: h1/h2 accessible names must be words, not spaced letters (lead 06:11).
// v6: product pages keep ≥1 visible data-honesty label in normal mode (gate); 'walls' = paragraphs > 30 words in the
// desktop panels outside phones/closed <details> (informational: v6 should drive it toward 0).
// Screenshots go to review/qa-v5/<label>/ for before/after comparison.
//   node scripts/v5-check.mjs before        # baseline
//   node scripts/v5-check.mjs after-<sha>   # after a push; exit 1 on any FAIL
//   node scripts/v5-check.mjs x --only nojs # one pass: desktop | 390 | nojs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const { chromium } = require('@playwright/test')
const BASE = process.env.MERCADO_APP_URL ?? 'http://localhost:3100'
const label = process.argv[2] ?? 'run'
// --only desktop|390|nojs runs one pass (the full gate is all three)
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined
const OUT = new URL(`../review/qa-v5/${label}/`, import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

// route → the element that must sit in the first 900px (the phone, or the primary action)
const ROUTES = [
  { path: '/', name: 'home', fold: (p) => p.getByRole('link', { name: /Start the Demo Tour/i }).or(p.getByRole('button', { name: /Start the Demo Tour/i })).first() },
  { path: '/mint', name: 'mint', fold: (p) => p.getByRole('tab', { name: /Issue & manage|Emitir/i }).or(p.getByRole('button', { name: /Issue & manage|Emitir/i })).first() },
  { path: '/remesas', name: 'remesas', phone: true },
  { path: '/global', name: 'global', fold: (p) => p.getByRole('button', { name: /^Pay [\d,.]+ OUSD/ }).first() },
  { path: '/credito?tab=driver', name: 'credito', phone: true },
  { path: '/card?holder=driver', name: 'card', phone: true },
  { path: '/invest', name: 'invest', phone: true },
  { path: '/developers', name: 'developers', fold: (p) => p.getByRole('button', { name: /^Run (POST|GET)/ }).first() },
  { path: '/contracts', name: 'contracts', fold: (p) => p.getByRole('link', { name: /Verified ✓/ }).first() },
]

const results = []
const browser = await chromium.launch()
const RUNS = [
  ...['dark', 'light'].flatMap((theme) => ['no-preference', 'reduce'].map((motion) => ({ theme, motion, w: 1440, h: 900 }))),
  { theme: 'dark', motion: 'no-preference', w: 390, h: 844 },
]
for (const { theme, motion, w, h } of RUNS.filter((x) => !ONLY || (ONLY === '390' ? x.w < 1000 : ONLY === 'desktop' && x.w >= 1000))) {
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: motion, ...(w < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) })
    // lead 08:4x: CLS ~0 on route arrival (layout shifts without recent input, buffered from navigation start)
    await ctx.addInitScript(() => {
      window.__cls = 0
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value
        }).observe({ type: 'layout-shift', buffered: true })
      } catch {}
    })
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
      // name the failing URL (a bare 'Failed to load resource: 429' doesn't say whose read it was)
      page.on('response', (res) => {
        if (res.status() >= 400 && !/favicon/.test(res.url())) errors.push(`HTTP ${res.status()} ${res.request().method()} ${res.url().replace(BASE, '').slice(0, 90)}`)
      })
      const row = { route: r.path, vp: `${w}`, theme, motion, status: 0, errors: 0, overflowX: 0, fold: '-', anims: '-', ok: true, notes: [] }
      try {
        const res = await page.goto(BASE + r.path, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        row.status = res?.status() ?? 0
        await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
        await page.waitForTimeout(3000)
        row.overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        // the fold is the TOP of the bottom bar (sticky/fixed footer) when it's on screen, else the viewport bottom
        const foldY = await page.evaluate((vh) => {
          const tops = [...document.querySelectorAll('footer, [role=contentinfo], body *')]
            .filter((e) => ['fixed', 'sticky'].includes(getComputedStyle(e).position))
            .map((e) => e.getBoundingClientRect())
            .filter((b) => b.height > 0 && b.width > innerWidth * 0.5 && b.top > vh * 0.6 && b.top < vh) // page-wide bars only, not the phone's own nav
            .map((b) => b.top)
          return Math.round(Math.min(vh, ...tops))
        }, h)
        const target = r.phone ? page.getByRole('group', { name: /Android/ }).first() : r.fold?.(page)
        if (target) {
          const box = await target.boundingBox().catch(() => null)
          const limit = r.phone ? Math.min(868, foldY) : foldY // lead 04:53: the whole phone ends ≤868
          row.fold = box ? `${Math.round(box.y + box.height)}/${limit}` : 'missing'
          // lead 06:31: at 390 the phone app's bottom nav (fixed) must be on screen, not stranded at the page end
          if (w < 1000 && r.phone) {
            const nav = await page.getByRole('navigation', { name: 'Navegación' }).first().boundingBox().catch(() => null)
            row.fold += nav ? ` nav ${Math.round(nav.y)}-${Math.round(nav.y + nav.height)}` : ' nav missing'
            // Crédito's first-run 'Continuar con Uber' screen has no tab bar by design
            const onboarding = !nav && (await page.getByRole('button', { name: /Continuar con Uber/i }).first().isVisible().catch(() => false))
            if (onboarding) row.fold += ' (onboarding: no nav by design)'
            else if (!nav || nav.y < 0 || nav.y + nav.height > h + 1) row.notes.push(`bottom nav off screen (${nav ? `${Math.round(nav.y)}–${Math.round(nav.y + nav.height)}` : 'missing'} vs ${h})`)
          }
          // gate the fold on desktop only; at 390px the page scrolls by design (informational)
          if (w >= 1000 && (!box || box.y + box.height > limit)) row.notes.push(r.phone ? 'phone below the fold' : 'primary action below the fold')
        }
        // v6 guardrails (PRINCIPLES §v6): honesty labels stay visible in normal mode; count 'text walls'
        // (paragraphs > 30 words in the desktop panels, outside the phones and outside closed <details>)
        if (motion === 'no-preference' && w >= 1000) {
          const m = await page.evaluate(() => {
            const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
            const honesty = [...document.querySelectorAll('[data-honesty]')].filter(vis).length
            const walls = [...document.querySelectorAll('main p, main li')]
              .filter((el) => !el.closest('.m-root, [role=group][aria-label*=Android], details:not([open])') && vis(el))
              .map((el) => (el.textContent ?? '').trim().split(/\s+/).filter(Boolean).length)
              .filter((n) => n > 30)
            return { honesty, walls: walls.length, maxWords: Math.max(0, ...walls) }
          })
          row.honesty = m.honesty
          row.walls = m.walls
          row.fold += ` · honesty ${m.honesty} · walls ${m.walls}${m.walls ? ` (max ${m.maxWords}w)` : ''}`
          if (r.path !== '/' && m.honesty === 0) row.notes.push('no visible data-honesty labels in normal mode (v6 guardrail)')
        }
        // lead 06:11: every h1/h2 accessible name is the word, not 'C r é d i t o' (LetterReveal a11y)
        if (motion === 'no-preference') {
          const snap = await page.locator('body').ariaSnapshot().catch(() => '')
          const spaced = [...snap.matchAll(/heading "([^"]*)" \[level=[12]\]/g)].map((m) => m[1]).filter((t) => /(?:^|\s)(?:\S\s){3,}\S(?:\s|$)/u.test(t))
          if (spaced.length) row.notes.push(`heading name spelled out: "${spaced[0].slice(0, 40)}"`)
        }
        // lead 08:4x: no animation running > 2 s after settle, except intentional loops (live counters, FlowPath dots)
        // marked [data-loop] or with a flow/counter/ticker class; those must stop under reduced motion (checked below)
        const longAnims = await page.evaluate((isHome) =>
          document
            .getAnimations()
            .filter((a) => a.playState === 'running')
            .map((a) => {
              const t = a.effect?.getTiming?.() ?? {}
              const el = a.effect?.target
              const allowed = !!el?.closest?.(isHome ? '[data-loop], [class*="counter" i], [class*="ticker" i]' : '[class*="counter" i], [class*="ticker" i]') // lead 09:21: data-loop is reserved for the Home hero pan (+ live counters) // lead 09:12 V6 #2: FlowPath dots travel only while a payment is pending, so on arrival (nothing pending) a moving flow dot is a fail
              return { d: Number(t.duration) || 0, it: t.iterations, allowed, name: a.animationName ?? a.constructor.name, el: el ? `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}` : '' }
            })
            .filter((x) => x.d * (x.it === Infinity ? Infinity : x.it || 1) > 2000),
          r.path === '/',
        )
        const loops = longAnims.filter((a) => a.allowed).length
        const bad = longAnims.filter((a) => !a.allowed)
        if (motion === 'no-preference') {
          row.anims = `${loops} loop${bad.length ? ` + ${bad.length} long` : ''}`
          if (bad.length) row.notes.push(`animation > 2 s not marked data-loop: ${bad.slice(0, 2).map((l) => `${l.name}@${l.el}`).join(', ')}`)
          const cls = await page.evaluate(() => window.__cls ?? 0)
          row.fold += ` · CLS ${cls.toFixed(3)}`
          if (w >= 1000 && cls > 0.05) row.notes.push(`CLS ${cls.toFixed(3)} > 0.05 on arrival`)
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
        if (motion === 'no-preference') await page.screenshot({ path: join(OUT, `${r.name}-${theme}${w < 1000 ? '-390' : ''}.png`) })
      } catch (e) {
        row.notes.push(`error: ${e.message.split('\n')[0].slice(0, 120)}`)
      }
      row.errors = errors.length
      if (errors.length) row.notes.push(`console: ${(errors.find((e) => e.startsWith('HTTP ')) ?? errors[0])}${errors.length > 1 ? ` (+${errors.length - 1})` : ''}`)
      if (row.status !== 200) row.notes.push(`HTTP ${row.status}`)
      if (row.overflowX > 0) row.notes.push(`horizontal overflow ${row.overflowX}px`)
      row.ok = row.notes.length === 0
      results.push(row)
      await page.close()
    }
    await ctx.close()
  }
}
// lead 05:22 P0: content must be visible WITHOUT JS (slow/failed hydration). JS off: count text blocks hidden by opacity 0.
if (!ONLY || ONLY === 'nojs') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false })
  for (const r of ROUTES) {
    const page = await ctx.newPage()
    const row = { route: r.path, vp: 'noJS', theme: 'ssr', motion: '-', status: 0, errors: 0, overflowX: 0, fold: '-', anims: '-', ok: true, notes: [] }
    try {
      const res = await page.goto(BASE + r.path, { waitUntil: 'load', timeout: 60_000 })
      row.status = res?.status() ?? 0
      await page.waitForTimeout(2500) // a CSS failsafe (if any) gets ~1.5 s
      const hidden = await page.evaluate(() => {
        const out = []
        for (const el of document.querySelectorAll('main h1, main h2, main h3, main p, main li, main button, main a')) {
          if (!el.textContent?.trim()) continue
          let n = el, op = 1
          while (n && n !== document.body) { op *= Number(getComputedStyle(n).opacity); n = n.parentElement }
          if (op < 0.05) out.push(el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40))
        }
        return { n: out.length, total: document.querySelectorAll('main h1, main h2, main h3, main p, main li, main button, main a').length, sample: out.slice(0, 2) }
      })
      row.fold = `${hidden.n}/${hidden.total} hidden`
      if (hidden.n) row.notes.push(`no-JS: ${hidden.n} text blocks invisible (e.g. "${hidden.sample.join('", "')}")`)
      await page.screenshot({ path: join(OUT, `${r.name}-nojs.png`) })
    } catch (e) {
      row.notes.push(`error: ${e.message.split('\n')[0].slice(0, 120)}`)
    }
    if (row.status !== 200) row.notes.push(`HTTP ${row.status}`)
    row.ok = row.notes.length === 0
    results.push(row)
    await page.close()
  }
  await ctx.close()
}
await browser.close()

const fails = results.filter((r) => !r.ok)
const lines = results.map((r) => `${r.ok ? '✅' : '❌'} ${r.route.padEnd(22)} ${r.vp.padEnd(4)} ${r.theme.padEnd(5)} ${r.motion.padEnd(13)} fold ${String(r.fold).padEnd(7)} ${r.notes.join(' · ')}`)
const report = `v5-check ${label} · ${BASE} · ${new Date().toISOString().slice(0, 19)}Z\n\n${lines.join('\n')}\n\n${fails.length ? `❌ ${fails.length} FAIL` : '✅ ALL PASS'} of ${results.length}\n`
writeFileSync(join(OUT, 'report.txt'), report)
console.log(report)
process.exit(fails.length ? 1 : 0)
