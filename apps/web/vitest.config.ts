import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Web tests. `test/*.test.ts` are pure logic and also run under the root vitest
 * (root include pattern apps/<app>/test/<anything>.test.ts, node environment); `test/*.test.tsx`
 * are React Testing Library tests and run only here (jsdom).
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^.*\/node_modules\/@bsv\/sdk\/dist\/cjs\/mod\.js$/, replacement: '@bsv/sdk' },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) }
    ]
  },
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: ['test/e2e/**'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    css: false
  }
})
