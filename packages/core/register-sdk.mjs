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
import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const CJS_PATH = require.resolve('@bsv/sdk')
const CJS_URL = pathToFileURL(CJS_PATH).href
const WRAPPER_URL = 'agentcoop:bsv-sdk-cjs'

registerHooks({
  resolve (specifier, context, nextResolve) {
    const isImport = context.conditions?.includes('import') === true
    if (isImport && specifier === '@bsv/sdk') return { url: WRAPPER_URL, shortCircuit: true }
    const result = nextResolve(specifier, context)
    if (isImport && result.url === CJS_URL) return { url: WRAPPER_URL, shortCircuit: true }
    return result
  },
  load (url, context, nextLoad) {
    if (url !== WRAPPER_URL) return nextLoad(url, context)
    const names = Object.keys(require(CJS_PATH)).filter(n => n !== 'default' && n !== '__esModule' && /^[A-Za-z_$][\w$]*$/.test(n))
    const source = [
      "import { createRequire } from 'node:module'",
      `const sdk = createRequire(${JSON.stringify(CJS_URL)})(${JSON.stringify(CJS_PATH)})`,
      'export default sdk',
      `export const { ${names.join(', ')} } = sdk`
    ].join('\n')
    return { format: 'module', source, shortCircuit: true }
  }
})
