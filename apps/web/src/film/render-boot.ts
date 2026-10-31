/**
 * First module of the app (main.tsx imports it before anything else): in render mode (`?render=1`) the page
 * runs on a virtual clock that the frame-by-frame renderer steps (vclock.ts, tools/film-render.mjs).
 */
import { installVirtualTime, type VirtualTime } from './vclock'

declare global { interface Window { __vt?: VirtualTime } }

if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('render') === '1') window.__vt = installVirtualTime()
