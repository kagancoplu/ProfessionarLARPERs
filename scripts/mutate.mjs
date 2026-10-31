#!/usr/bin/env node
/**
 * Mutation testing by hand-written mutants (docs/AUDIT-READINESS.md §4, BL-16).
 *
 *   node scripts/mutate.mjs scripts/mutants/verify.json [more.json …]
 *   npm run mutate                      # every set in scripts/mutants/
 *
 * A set is { "name", "tests": [files], "before"?: "shell command", "mutants": [{ "id", "file", "find", "replace" }] }.
 * For each mutant: the file is copied aside, `find` (which must occur exactly once) becomes `replace`,
 * `before` runs (e.g. recompiling the contract), then `npx vitest run <tests>`. The mutant is KILLED when
 * the tests fail and SURVIVES when they pass. Every touched file is restored afterwards, also on Ctrl-C,
 * and `before` runs once more on the restored sources. Exit code 1 if any mutant survived.
 */
import { execSync, spawnSync } from 'node:child_process'
import { copyFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const setFiles = args.length > 0 ? args : readdirSync(join(ROOT, 'scripts', 'mutants')).filter(f => f.endsWith('.json')).map(f => join('scripts', 'mutants', f))

/** Files copied aside, restored on exit whatever happens. */
const backups = new Map()
const restore = () => {
  for (const [file, bak] of backups) { copyFileSync(bak, file); rmSync(bak) }
  backups.clear()
}
process.on('SIGINT', () => { restore(); process.exit(130) })
process.on('exit', restore)

const run = (cmd) => spawnSync(cmd, { cwd: ROOT, shell: true, stdio: 'pipe', encoding: 'utf8' })
let survived = 0
const rows = []

for (const setFile of setFiles) {
  const set = JSON.parse(readFileSync(join(ROOT, setFile), 'utf8'))
  console.log(`\n${set.name} (${set.mutants.length} mutants; tests: ${set.tests.join(', ')})`)
  // the unmutated sources must pass, or every mutant would look killed
  if (set.before) execSync(set.before, { cwd: ROOT, stdio: 'pipe' })
  const base = run(`npx vitest run ${set.tests.join(' ')}`)
  if (base.status !== 0) { console.error(`  ✗ the tests fail without any mutant:\n${base.stdout.slice(-2000)}`); process.exit(2) }

  for (const m of set.mutants) {
    const file = join(ROOT, m.file)
    const src = readFileSync(file, 'utf8')
    const at = src.indexOf(m.find)
    if (at === -1 || src.indexOf(m.find, at + 1) !== -1) { console.error(`  ✗ ${m.id}: "find" must occur exactly once in ${m.file}`); process.exit(2) }
    const bak = `${file}.mutate-bak`
    copyFileSync(file, bak)
    backups.set(file, bak)
    writeFileSync(file, src.slice(0, at) + m.replace + src.slice(at + m.find.length))
    let killed
    if (set.before && run(set.before).status !== 0) killed = 'does not compile'
    else killed = run(`npx vitest run ${set.tests.join(' ')}`).status !== 0 ? 'tests fail' : undefined
    restore()
    if (killed === undefined) survived++
    rows.push({ set: set.name, id: m.id, killed })
    console.log(`  ${killed !== undefined ? '✓ killed' : '✗ SURVIVED'}  ${m.id}${killed === 'does not compile' ? ' (does not compile)' : ''}`)
  }
  if (set.before) execSync(set.before, { cwd: ROOT, stdio: 'pipe' }) // artifacts back to the real sources
}

const killed = rows.filter(r => r.killed !== undefined).length
console.log(`\n${killed}/${rows.length} mutants killed${survived > 0 ? `, ${survived} survived` : ''}`)
process.exit(survived > 0 ? 1 : 0)
