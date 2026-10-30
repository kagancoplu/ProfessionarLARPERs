/**
 * The single entry point to @bsv/sdk for every AgentCoop workspace.
 *
 * wallet-toolbox is CommonJS and loads the CJS build of @bsv/sdk. Our code is
 * ESM, and a plain `import … from '@bsv/sdk'` would load the ESM build: two
 * copies of every SDK class in one process, which fails at runtime with
 * `script[serializedBytes] is not a function` (guide §23). Re-exporting the CJS
 * build here keeps one copy under tsx/Node; vitest aliases `@bsv/sdk` to the
 * same file (vitest.config.ts).
 *
 * Rule (MASTER-PLAN §3.1): import the SDK only via `@agentcoop/core/sdk`.
 */
export * from '../../../node_modules/@bsv/sdk/dist/cjs/mod.js'
