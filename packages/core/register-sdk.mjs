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
 * require()s, so SDK classes are one copy at runtime too. `knex` gets the same
 * treatment (its `knex` named export is invisible to Node too; the shared test
 * helper test/helpers/mockchain.ts imports it, and the demos run that helper).
 *
 * Synchronous in-thread hooks (module.registerHooks, Node ≥ 22.15) so they run
 * before tsx's own resolver. Usage:
 *   tsx --import @agentcoop/core/register-sdk app.ts
 */
import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const WRAPPED = ['@bsv/sdk', 'knex']
/** CJS entry file URL → wrapper URL, and wrapper URL → CJS entry path. */
const byFileUrl = new Map()
const byWrapper = new Map()
const wrapperFor = new Map()
for (const pkg of WRAPPED) {
  const path = require.resolve(pkg)
  const wrapper = `agentcoop:cjs:${pkg}`
  byFileUrl.set(pathToFileURL(path).href, wrapper)
  byWrapper.set(wrapper, path)
  wrapperFor.set(pkg, wrapper)
}

registerHooks({
  resolve (specifier, context, nextResolve) {
    const isImport = context.conditions?.includes('import') === true
    if (isImport && wrapperFor.has(specifier)) return { url: wrapperFor.get(specifier), shortCircuit: true }
    const result = nextResolve(specifier, context)
    if (isImport && byFileUrl.has(result.url)) return { url: byFileUrl.get(result.url), shortCircuit: true }
    return result
  },
  load (url, context, nextLoad) {
    const path = byWrapper.get(url)
    if (path === undefined) return nextLoad(url, context)
    const names = Object.keys(require(path)).filter(n => n !== 'default' && n !== '__esModule' && /^[A-Za-z_$][\w$]*$/.test(n))
    const source = [
      "import { createRequire } from 'node:module'",
      `const mod = createRequire(${JSON.stringify(pathToFileURL(path).href)})(${JSON.stringify(path)})`,
      'export default mod',
      `export const { ${names.join(', ')} } = mod`
    ].join('\n')
    return { format: 'module', source, shortCircuit: true }
  }
})
