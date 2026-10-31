#!/usr/bin/env node
/**
 * Checks that the security docs cite things that exist, so evidence cannot rot silently:
 *  - every backticked repo path (`apps/guard/src/policy.ts`, `contracts/`, `x.ts:42`) exists (and has ≥ 42 lines);
 *  - every relative Markdown link resolves;
 *  - every test cited as `file.test.ts` › "name", "name" appears in that file.
 *
 *   node scripts/check-docs.mjs [doc.md …]     (default: the security docs below)
 *
 * Exit 0 when everything resolves, 1 with a list otherwise. Not part of `npm test`, so another
 * track renaming a test does not turn its suite red; CI runs it as its own step.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_DOCS = ['docs/THREAT-MODEL.md', 'docs/AUDIT-READINESS.md', 'docs/ROADMAP.md', 'SECURITY.md']
const ROOTS = new Set(['apps', 'packages', 'test', 'docs', 'contracts', 'scripts', 'plan', 'infra', 'supabase', 'starter', '.github'])

const lines = (file) => readFileSync(file, 'utf8').split('\n').length

/** A backticked token that names a file or directory in this repo, with an optional `:line`. */
function repoPath (token) {
  const m = /^([A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@*-]+)*\/?)(?::(\d+)(?:-\d+)?)?$/.exec(token)
  if (m === null || !m[1].includes('/') || m[1].includes('*')) return undefined
  if (!ROOTS.has(m[1].split('/')[0])) return undefined
  return { path: m[1], line: m[2] === undefined ? undefined : Number(m[2]) }
}

/**
 * `"a", "b; c" (note); …` → ['a', 'b; c']. Names may contain quotes, `;` and `\|`: a quote closes a
 * name only when `, "`, `;`, ` (`, ` |`, `|` or the end of the line follows it.
 */
function testNames (rest) {
  const names = []
  let pos = 0
  while (rest[pos] === '"') {
    let j = pos + 1
    for (; j < rest.length; j++) {
      if (rest[j] !== '"') continue
      const after = rest.slice(j + 1)
      if (after === '' || /^(, "|;| \(| ?\||\s*$)/.test(after)) break
    }
    if (j >= rest.length) break
    names.push(rest.slice(pos + 1, j).replaceAll('\\|', '|'))
    if (!rest.startsWith('", "', j)) break
    pos = j + 3
  }
  return names
}

const escapes = (name) => [name, name.replaceAll("'", "\\'"), name.replaceAll('"', '\\"'), name.replaceAll('`', '\\`')]

export const counts = { paths: 0, links: 0, tests: 0 }

export function checkDoc (docPath) {
  const problems = []
  const text = readFileSync(docPath, 'utf8')
  const rel = relative(ROOT, docPath)
  text.split('\n').forEach((line, i) => {
    const where = `${rel}:${i + 1}`
    for (const [, token] of line.matchAll(/`([^`\n]+)`/g)) {
      const p = repoPath(token)
      if (p === undefined) continue
      counts.paths++
      const abs = join(ROOT, p.path)
      if (!existsSync(abs)) { problems.push(`${where}: missing path ${p.path}`); continue }
      if (p.line !== undefined && statSync(abs).isFile() && lines(abs) < p.line) problems.push(`${where}: ${p.path} has fewer than ${p.line} lines`)
    }
    for (const [, target] of line.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/i.test(target) || target.startsWith('#')) continue
      const file = target.split('#')[0]
      counts.links++
      if (file !== '' && !existsSync(resolve(dirname(docPath), file))) problems.push(`${where}: broken link ${target}`)
    }
    // `path.test.ts` › "name", "name"
    for (const m of line.matchAll(/`([^`]+\.test\.ts)` › (?=(.*))/g)) {
      const file = join(ROOT, m[1])
      if (!existsSync(file)) continue // reported above as a missing path
      const source = readFileSync(file, 'utf8')
      for (const name of testNames(m[2])) {
        counts.tests++
        if (!escapes(name).some(n => source.includes(n))) problems.push(`${where}: no test "${name}" in ${m[1]}`)
      }
    }
  })
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const docs = (args.length > 0 ? args : DEFAULT_DOCS.filter(d => existsSync(join(ROOT, d)))).map(d => resolve(d))
  const problems = docs.flatMap(checkDoc)
  for (const p of problems) console.log(p)
  console.log(problems.length === 0 ? `check-docs: ${docs.length} doc(s); ${counts.paths} paths, ${counts.links} links and ${counts.tests} test names all resolve` : `check-docs: ${problems.length} problem(s)`)
  process.exit(problems.length === 0 ? 0 : 1)
}
