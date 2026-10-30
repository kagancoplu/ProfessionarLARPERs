import { defineConfig } from '@playwright/test'

/** e2e runs against the mock mode (no services, no BSV Desktop) on its own port. */
const PORT = Number(process.env.PORT ?? 5177)

export default defineConfig({
  testDir: './test/e2e',
  timeout: 45_000,
  retries: 0,
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev:mock', url: `http://localhost:${PORT}`, reuseExistingServer: true, timeout: 60_000, env: { PORT: String(PORT) } },
  reporter: [['list']]
})
