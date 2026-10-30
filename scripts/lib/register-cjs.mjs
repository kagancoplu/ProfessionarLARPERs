/**
 * Runtime shim for the offline demo (scripts/demo-injection.ts). Track D.
 *
 * test/helpers/mockchain.ts does `import { knex } from 'knex'`. Under vitest
 * that works; under tsx/Node ESM it does not, because Node cannot see knex's
 * CommonJS named exports statically. Same approach as Track C's
 * @agentcoop/core/register-sdk: an ESM import of `knex` loads a wrapper whose
 * export list is read at load time from the very instance require() returns.
 *   tsx --import @agentcoop/core/register-sdk --import ./scripts/lib/register-cjs.mjs …
 */
import { createRequire, registerHooks } from 'node:module'

const require = createRequire(import.meta.url)
const PACKAGES = ['knex']
const PREFIX = 'agentcoop:cjs:'

registerHooks({
  resolve (specifier, context, nextResolve) {
    if (context.conditions?.includes('import') === true && PACKAGES.includes(specifier)) return { url: `${PREFIX}${specifier}`, shortCircuit: true }
    return nextResolve(specifier, context)
  },
  load (url, context, nextLoad) {
    if (!url.startsWith(PREFIX)) return nextLoad(url, context)
    const name = url.slice(PREFIX.length)
    const path = require.resolve(name)
    const names = Object.keys(require(path)).filter(n => n !== 'default' && /^[A-Za-z_$][\w$]*$/.test(n))
    const source = [
      "import { createRequire } from 'node:module'",
      `const m = createRequire(${JSON.stringify(import.meta.url)})(${JSON.stringify(path)})`,
      'export default m',
      `export const { ${names.join(', ')} } = m`
    ].join('\n')
    return { format: 'module', source, shortCircuit: true }
  }
})
