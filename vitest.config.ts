import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Kit's vitest.config.ts: wallet-toolbox is CommonJS and loads the CJS
      // build of @bsv/sdk, so point our code at the same build (one copy of the
      // SDK classes). require.resolve picks the "require" export = dist/cjs/mod.js.
      '@bsv/sdk': createRequire(import.meta.url).resolve('@bsv/sdk')
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false
  }
})
