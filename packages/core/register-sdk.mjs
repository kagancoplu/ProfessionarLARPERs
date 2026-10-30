/**
 * Runtime half of the single-SDK-copy rule (MASTER §3.1). Added by Track C.
 *
 * `src/sdk.ts` re-exports the CJS build of @bsv/sdk. Under vitest that works
 * because of the `@bsv/sdk` alias. Under tsx/Node it does not: Node cannot see
 * the CJS build's named exports statically (they are `__importDefault(x).default`
 * getters), so `import { Transaction } from '@agentcoop/core/sdk'` fails with
 * "does not provide an export named 'Transaction'".
 *
 * This hook makes every ESM import of the SDK's CJS entry (via `sdk.ts`, or a
 * bare `import … from '@bsv/sdk'`) load a small ESM wrapper whose export list
 * is read at load time. The wrapper re-exports the very instance wallet-toolbox
 * require()s, so SDK classes are one copy at runtime too.
 *
 * Synchronous in-thread hooks (module.registerHooks, Node ≥ 22.15) so they run
 * before tsx's own resolver. Usage:
 *   tsx --import @agentcoop/core/register-sdk app.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const CJS_PATH = require.resolve('@bsv/sdk')
const CJS_URL = pathToFileURL(CJS_PATH).href

// The wrapper is a real file, so only a `resolve` hook is needed. (A sync `load`
// hook breaks under tsx on Node 22.22: the default load of every CommonJS module
// imported from ESM — express, knex — returns `source: null` and Node rejects it
// with ERR_INVALID_RETURN_PROPERTY_VALUE. Found by Track B, 30.10.)
const names = Object.keys(require(CJS_PATH)).filter(n => n !== 'default' && n !== '__esModule' && /^[A-Za-z_$][\w$]*$/.test(n))
const source = [
  "import { createRequire } from 'node:module'",
  `const sdk = createRequire(${JSON.stringify(CJS_URL)})(${JSON.stringify(CJS_PATH)})`,
  'export default sdk',
  `export const { ${names.join(', ')} } = sdk`
].join('\n') + '\n'
const WRAPPER_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'node_modules', '.cache', 'agentcoop', 'bsv-sdk-cjs.mjs')
let current = ''
try { current = readFileSync(WRAPPER_PATH, 'utf8') } catch {}
if (current !== source) {
  mkdirSync(dirname(WRAPPER_PATH), { recursive: true })
  writeFileSync(WRAPPER_PATH, source)
}
const WRAPPER_URL = pathToFileURL(WRAPPER_PATH).href

registerHooks({
  resolve (specifier, context, nextResolve) {
    const isImport = context.conditions?.includes('import') === true
    if (isImport && specifier === '@bsv/sdk') return { url: WRAPPER_URL, format: 'module', shortCircuit: true }
    const result = nextResolve(specifier, context)
    if (isImport && result.url === CJS_URL) return { url: WRAPPER_URL, format: 'module', shortCircuit: true }
    return result
  }
})
