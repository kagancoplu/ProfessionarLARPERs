import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)

export default defineConfig({
  resolve: {
    alias: {
      // Kit's vitest.config.ts: wallet-toolbox is CommonJS and loads the CJS build of
      // @bsv/sdk, so our code (and packages/core/src, scripts/) must use that build too.
      '@bsv/sdk': require.resolve('@bsv/sdk')
    },
    // Until the root workspace exists (A.P0), files outside this package
    // (packages/core/src, scripts/) resolve their packages from here: one copy each.
    dedupe: ['@bsv/wallet-toolbox', '@bsv/auth-express-middleware', 'express', 'knex', 'better-sqlite3']
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false
  }
})
