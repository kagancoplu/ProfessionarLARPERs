/// <reference types="vite/client" />
/**
 * The path the app is served under: `/` by default, or the `--base` given to `vite build` (for example
 * `/play/agentcoop/` when another site hosts the Town in an iframe). Every absolute URL the app requests
 * (Phaser atlases, UI images, replays, the MSW worker) and the router's basename go through here.
 */
const raw = typeof import.meta.env !== 'undefined' && typeof import.meta.env.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/'

/** always starts and ends with `/` */
export const BASE: string = withSlashes(raw)

function withSlashes (b: string): string {
  const start = b.startsWith('/') ? b : `/${b}`
  return start.endsWith('/') ? start : `${start}/`
}

/** `asset('/game/map.json')` → `/play/agentcoop/game/map.json` under that base, unchanged under `/` */
export function asset (path: string, base: string = BASE): string {
  return withSlashes(base) + path.replace(/^\/+/, '')
}

/** React Router's basename: the base without its trailing slash (`/` stays `/`) */
export function routerBasename (base: string = BASE): string {
  const b = withSlashes(base)
  return b === '/' ? '/' : b.slice(0, -1)
}

/** the app route of a browser pathname: `/play/agentcoop/pools` → `/pools`, the base itself → `/` */
export function appPath (pathname: string, base: string = BASE): string {
  const b = withSlashes(base)
  if (b === '/') return pathname
  if (pathname === b.slice(0, -1) || pathname === b) return '/'
  return pathname.startsWith(b) ? `/${pathname.slice(b.length)}` : pathname
}

/**
 * A host that cannot answer the base path with its index (Next.js public files, for example) links to
 * `<base>index.html`. The app then shows the base path itself, so the router sees `/` and the page stays inside
 * the MSW worker's scope (`<base>`); `null` when the pathname needs no change.
 */
export function entryPath (pathname: string, base: string = BASE): string | null {
  return pathname === `${withSlashes(base)}index.html` ? withSlashes(base) : null
}

/** applies `entryPath` to the address bar (no reload); call before the router reads the location */
export function normalizeEntry (): void {
  if (typeof location === 'undefined' || typeof history === 'undefined') return
  const to = entryPath(location.pathname)
  if (to !== null) history.replaceState(history.state, '', to + location.search + location.hash)
}
