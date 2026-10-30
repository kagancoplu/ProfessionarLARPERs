import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Kit's vitest.config.ts: one CJS build of @bsv/sdk for our code and wallet-toolbox.
      '@bsv/sdk': createRequire(import.meta.url).resolve('@bsv/sdk')
    },
    // Tests start the overlay (packages/overlay/src) in-process. Until the root
    // workspace exists (A.P0), resolve its packages from this package so the
    // process has one copy of each (and so one @bsv/sdk).
    dedupe: ['@bsv/overlay', '@bsv/overlay-express', '@bsv/wallet-toolbox', 'knex', 'better-sqlite3']
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false
  }
})
