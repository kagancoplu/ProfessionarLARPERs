import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

/**
 * AgentCoop web (Track E). MASTER §3.10 browser rule:
 * - no wallet-toolbox in the browser; `@bsv/sdk` must be ONE copy, the ESM build.
 *   `packages/core/src/sdk.ts` re-exports the CJS build by relative path, so every
 *   import of that path is aliased back to the package (Vite then picks `exports.import`).
 * - services are reached through the dev proxy locally (no CORS), through VITE_* URLs in production.
 */
// Proxy targets follow the root .env names (MASTER §3.9) when set in the shell, e.g. OVERLAY_URL=http://localhost:8081.
const SERVICE_PROXY: Record<string, string> = {
  '/api/coop': process.env.COOP_API_URL ?? 'http://localhost:8090',
  '/api/overlay': process.env.OVERLAY_URL ?? 'http://localhost:8080',
  '/api/provider': process.env.PROVIDER_API_URL ?? 'http://localhost:8092',
  '/api/guard': process.env.GUARD_URL ?? 'http://localhost:8091',
  '/api/agents': process.env.AGENTS_URL ?? 'http://localhost:8093'
}

export default defineConfig({
  // Read VITE_* from the repo root .env (MASTER §3.9; D owns .env.example).
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^.*\/node_modules\/@bsv\/sdk\/dist\/cjs\/mod\.js$/, replacement: '@bsv/sdk' },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) }
    ],
    dedupe: ['@bsv/sdk', 'react', 'react-dom']
  },
  server: {
    // PORT env wins (the desktop app's preview and Playwright pick free ports); BSV Desktop identifies the app by this origin.
    port: Number(process.env.PORT ?? 5173),
    strictPort: true,
    fs: { allow: ['../..'] },
    proxy: Object.fromEntries(Object.entries(SERVICE_PROXY).map(([path, target]) => [path, {
      target,
      // the coordinator binds the hello proof to the Host header it sees (B-P5a): keep the browser's
      changeOrigin: path !== '/api/coop',
      ws: true,
      rewrite: (p: string) => p.replace(path, '')
    }]))
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : id.includes('node_modules/@bsv/sdk') ? 'sdk' : undefined)
      }
    }
  }
})
