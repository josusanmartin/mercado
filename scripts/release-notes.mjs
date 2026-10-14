#!/usr/bin/env node
// review/RELEASE.md generator (lead #20): the commit SHA, deck version, the asset blob list with sha256, the preflight
// output and the stage wallet states. Read-only (no txs). Re-run after the last recapture / publish.
//   node scripts/release-notes.mjs --deck v77
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const arg = (k, d) => (process.argv.includes(`--${k}`) ? process.argv[process.argv.indexOf(`--${k}`) + 1] : d)
const deckVersion = arg('deck', '(not given: pass --deck vNN from lead\'s last publish post)')
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 << 20, ...opts })
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')

// ---- code
const head = sh('git', ['log', '-1', '--format=%H%n%h %ad %s', '--date=iso-strict']).trim().split('\n')
const dirty = sh('git', ['status', '--short']).trim().split('\n').filter(Boolean)

// ---- deck: order + every /_blob/ the slides reference → local file → sha256
const deck = JSON.parse(readFileSync(join(ROOT, 'deck/project/deck.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(ROOT, 'deck/assets.json'), 'utf8')) // name → /_blob/<id>
const byBlob = new Map(Object.entries(manifest).map(([name, url]) => [url, name]))
const findLocal = (name) => {
  for (const dir of ['deck/assets', 'deck/assets/v7', 'deck/art']) if (existsSync(join(ROOT, dir, name))) return join(dir, name)
  return undefined
}
const slideDir = join(ROOT, 'deck/project/slides')
const used = new Map() // blob → { slides:Set }
for (const f of readdirSync(slideDir).filter((x) => x.endsWith('.html'))) {
  for (const m of readFileSync(join(slideDir, f), 'utf8').matchAll(/\/_blob\/[0-9a-f]{32}/g)) {
    if (!used.has(m[0])) used.set(m[0], new Set())
    used.get(m[0]).add(f.replace(/\.html$/, ''))
  }
}
const order = deck.order ?? []
const appendixStart = deck.sections?.appendix?.start
const main = appendixStart ? order.slice(0, order.indexOf(appendixStart)) : order
const appendix = appendixStart ? order.slice(order.indexOf(appendixStart)) : []
const assetRows = [...used.entries()]
  .map(([blob, slides]) => {
    const name = byBlob.get(blob)
    const local = name && findLocal(name)
    const st = local && statSync(join(ROOT, local))
    const sha = local ? createHash('sha256').update(readFileSync(join(ROOT, local))).digest('hex') : '—'
    const inOrder = [...slides].filter((s) => order.includes(s))
    return { blob, name: name ?? '(not in assets.json)', local: local ?? '—', bytes: st ? st.size : 0, mtime: st ? st.mtime.toISOString().slice(0, 16).replace('T', ' ') : '—', sha, slides: inOrder.length ? inOrder : [...slides].map((s) => `${s} (unused slide)`) }
  })
  .sort((a, b) => Math.min(...a.slides.map((s) => order.indexOf(s)).filter((i) => i >= 0), 99) - Math.min(...b.slides.map((s) => order.indexOf(s)).filter((i) => i >= 0), 99))

// ---- live state (read-only)
let preflight = ''
try {
  preflight = strip(sh('npx', ['tsx', 'scripts/preflight.ts'], { timeout: 300_000 }))
} catch (e) {
  preflight = strip(String(e.stdout ?? e.message)) // exit 1 = some RED; keep the table
}
let wallets = ''
try {
  wallets = strip(sh('node', ['packages/contracts/script/demo-state-v2.mjs'], { timeout: 120_000 }))
} catch (e) {
  wallets = `demo-state-v2 failed: ${String(e.message).split('\n')[0]}`
}
const v5 = (() => {
  const dir = join(ROOT, 'review/qa-v5')
  const finals = existsSync(dir) ? readdirSync(dir).filter((d) => d.startsWith('final-')).sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs) : []
  return finals.slice(0, 3).map((d) => `- \`review/qa-v5/${d}/report.txt\`: ${(readFileSync(join(dir, d, 'report.txt'), 'utf8').trim().split('\n').pop() ?? '').trim()}`)
})()
const forge = existsSync(join(ROOT, 'scripts/evidence/forge-test.txt')) ? readFileSync(join(ROOT, 'scripts/evidence/forge-test.txt'), 'utf8').trim().split('\n').pop() : '—'

const md = `# Mercado release record

Generated ${new Date().toISOString().slice(0, 19)}Z by \`node scripts/release-notes.mjs\` (read-only; re-run after any recapture or publish).

## Code

| | |
|---|---|
| Commit | \`${head[0]}\` |
| Subject | ${head[1].replace(/\|/g, '\\|')} |
| Working tree | ${dirty.length ? `${dirty.length} uncommitted paths (shared tree; not part of this commit)` : 'clean'} |
| Chain | Tempo Moderato 42431 · protocol v2 (addresses: README.md, verified on Sourcify) |
| Contracts | ${forge} (\`scripts/evidence/forge-test.txt\`) |

## Deck

| | |
|---|---|
| Published version | ${deckVersion} |
| Main flow (${main.length}) | ${main.join(' → ')} |
| Appendix (${appendix.length}) | ${appendix.join(', ')} |

### Assets referenced by the slides (${assetRows.length})

sha256 is of the LOCAL file today. A file overwritten after its upload would not match its blob; every overwrite was announced in #mercado and re-uploaded by lead (new blob url).

| Slides | File | Blob | Bytes | Modified (UTC) | sha256 |
|---|---|---|---:|---|---|
${assetRows.map((r) => `| ${r.slides.join(', ')} | \`${r.local}\` | \`${r.blob.slice(7, 15)}…\` | ${r.bytes.toLocaleString('en-US')} | ${r.mtime} | \`${r.sha}\` |`).join('\n')}

## Gates

- v5 UI gate (\`node scripts/v5-check.mjs\`):
${v5.join('\n') || '  - (no final run found)'}
- Card proof (\`node scripts/card-proof-loop.mjs\`): see #mercado for the latest run (each run asserts the POS receipt AND exactly +1 on-chain charge).

## Preflight (\`npx tsx scripts/preflight.ts\`)

\`\`\`
${preflight.trim()}
\`\`\`

## Stage wallet states (\`node packages/contracts/script/demo-state-v2.mjs\`)

\`\`\`
${wallets.trim()}
\`\`\`
`
writeFileSync(join(ROOT, 'review/RELEASE.md'), md)
console.log(`review/RELEASE.md: ${assetRows.length} assets, ${main.length} main + ${appendix.length} appendix slides, preflight ${/✅ GO/.test(preflight) ? 'GO' : 'NOT GO'}`)
