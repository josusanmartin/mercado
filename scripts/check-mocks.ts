/**
 * Enforces MOCKS.md (josu's rule: mock only what's necessary, wire everything else).
 *   npx tsx scripts/check-mocks.ts          # exit 1 on any UNLISTED mock / hardcoded data value
 *
 * 1. Mock markers (mock, fixture, simulated, fake, recorded trace, hard-coded, FixedPriceFeed, isMock,
 *    Math.random) in app/contract/shared source must sit in a file listed in a MOCKS.md "Code" column.
 * 2. Hardcoded numeric data rendered in UI rows (e.g. value="1,500.00 xMXN") is a violation unless its
 *    file:line is named in MOCKS.md section C (known gap → warning, not failure).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const mocksMd = readFileSync(join(ROOT, 'MOCKS.md'), 'utf8')

// every `path` or `path/glob*` in backticks that looks like a repo path
const listed = [...mocksMd.matchAll(/`((?:apps|packages|fixtures|scripts)\/[^`\s]+)`/g)].map((m) => m[1])
const toRe = (g: string) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + (g.endsWith('/*') ? '' : '$'))
const listedRes = listed.map((p) => (p.endsWith('/') ? new RegExp('^' + p) : toRe(p)))
const isListed = (rel: string) => listedRes.some((re) => re.test(rel))
const gapRefs = [...mocksMd.matchAll(/`?([\w.-]+\.tsx?):(\d+)`?/g)].map((m) => `${m[1]}:${m[2]}`)

const SCAN = ['apps/web/app', 'apps/web/components', 'apps/web/lib', 'packages/contracts/src', 'packages/shared/src']
const SKIP = /(__tests__|\/abi\/|\/deployments\/|node_modules|\.next|\/e2e\/)/
// "simulated" only in the fulfillment sense (contract *simulation* before signing is not a mock)
const MARKER_I = /\bmock|fixture|\bfake\b|recorded trace|hard-?coded|FixedPriceFeed|isMock|Math\.random/i
const MARKER_CS = /SIMULATED|simulated (?:fulfil|provider|top-up)|simulated: true/
const MARKER = { test: (l: string) => MARKER_I.test(l) || MARKER_CS.test(l) }
// UI data row with a literal number (thousands separator or decimals), e.g. value="1,500.00 xMXN"
const HARD_NUM = /\b(?:value|amount|kpi|stat)=\s*["'{`]\s*["'`]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|\b(?:value|amount)=\s*["']\d+\.\d{2}\b/

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (SKIP.test(p)) continue
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(tsx?|sol|mts)$/.test(name)) yield p
  }
}

const unlisted = new Map<string, string[]>()
const hard: { at: string; line: string; known: boolean }[] = []
for (const base of SCAN) {
  for (const file of walk(join(ROOT, base))) {
    const rel = relative(ROOT, file)
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (MARKER.test(line) && !isListed(rel)) {
        if (!unlisted.has(rel)) unlisted.set(rel, [])
        unlisted.get(rel)!.push(`${i + 1}: ${line.trim().slice(0, 120)}`)
      }
      if (/\.tsx$/.test(file) && HARD_NUM.test(line)) {
        const at = `${rel.split('/').pop()}:${i + 1}`
        hard.push({ at: `${rel}:${i + 1}`, line: line.trim().slice(0, 120), known: gapRefs.includes(at) })
      }
    })
  }
}

let fail = 0
console.log(`MOCKS.md lists ${listed.length} code paths\n`)
if (unlisted.size) {
  console.log(`✗ ${unlisted.size} file(s) contain mock markers but aren't listed in MOCKS.md:`)
  for (const [f, hits] of unlisted) {
    console.log(`  ${f}`)
    hits.slice(0, 3).forEach((h) => console.log(`      ${h}`))
  }
  fail++
} else console.log('✓ every file with a mock marker is listed in MOCKS.md')
const newHard = hard.filter((h) => !h.known)
for (const h of hard.filter((h) => h.known)) console.log(`! known gap (MOCKS.md §C): ${h.at}  ${h.line}`)
if (newHard.length) {
  console.log(`✗ ${newHard.length} hardcoded data value(s) in UI rows (read them from chain/API, or list as a gap):`)
  newHard.forEach((h) => console.log(`  ${h.at}  ${h.line}`))
  fail++
} else console.log('✓ no unlisted hardcoded data values in UI rows')
console.log(fail ? '\nFAIL: unlisted mocks (see above)' : '\nPASS: all mocks are listed')
process.exit(fail ? 1 : 0)
