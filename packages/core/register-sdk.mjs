/**
 * `--import` entry: every ESM `import ... from '@bsv/sdk'` gets the CJS build,
 * the same instance wallet-toolbox require()s, so SDK classes are one copy at
 * runtime too (MASTER §3.1 ESM/CJS rule; tests get this from the vitest alias).
 *
 * Why a hook and not tsconfig `paths`: Node cannot statically see the CJS
 * build's named exports (they are `__importDefault(x).default` getters), so an
 * ESM import of dist/cjs/mod.js fails with "does not provide an export named".
 * The hook serves a small ESM wrapper whose export list is read at load time.
 *
 * Synchronous in-thread hooks (module.registerHooks, Node ≥ 22.15) so they run
 * before tsx's resolver, which would otherwise apply tsconfig `paths` (kept
 * there for the type checker only). Usage: `node --import tsx --import @agentcoop/core/register-sdk app.ts`.
 */
import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const CJS_PATH = require.resolve('@bsv/sdk')
const WRAPPER_URL = 'agentcoop:bsv-sdk-cjs'

registerHooks({
  resolve (specifier, context, nextResolve) {
    if (specifier === '@bsv/sdk' && context.conditions?.includes('import')) return { url: WRAPPER_URL, shortCircuit: true }
    return nextResolve(specifier, context)
  },
  load (url, context, nextLoad) {
    if (url !== WRAPPER_URL) return nextLoad(url, context)
    const names = Object.keys(require(CJS_PATH)).filter(n => n !== 'default' && n !== '__esModule' && /^[A-Za-z_$][\w$]*$/.test(n))
    const source = [
      "import { createRequire } from 'node:module'",
      `const sdk = createRequire(${JSON.stringify(pathToFileURL(CJS_PATH).href)})(${JSON.stringify(CJS_PATH)})`,
      'export default sdk',
      `export const { ${names.join(', ')} } = sdk`
    ].join('\n')
    return { format: 'module', source, shortCircuit: true }
  }
})
