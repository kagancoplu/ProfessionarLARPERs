import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Same alias as docs/starter/bsv21-token-kit/vitest.config.ts: wallet-toolbox is
      // CommonJS and loads the CJS build of @bsv/sdk, so our code must use that build too.
      '@bsv/sdk': fileURLToPath(new URL('./node_modules/@bsv/sdk/dist/cjs/mod.js', import.meta.url))
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false
  }
})
