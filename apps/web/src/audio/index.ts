/** Wire the synthesised effects to the bus and the settings; unlock audio on the first gesture. */
import type { EventBus } from '../events/bus'
import type { AppStoreApi } from '../store'
import { effectFor, Sfx } from './sfx'

export function startSfx (bus: EventBus, store: AppStoreApi): () => void {
  const sfx = new Sfx()
  sfx.enabled = store.getState().settings.sound
  const unlock = (): void => { if (store.getState().settings.sound) sfx.unlock() }
  if (typeof window !== 'undefined') { window.addEventListener('pointerdown', unlock, { passive: true }); window.addEventListener('keydown', unlock) }
  const unsubStore = store.subscribe(s => { sfx.enabled = s.settings.sound; if (s.settings.sound) sfx.unlock() })
  const unsubBus = bus.subscribe(e => { const fx = effectFor(e); if (fx !== undefined) sfx.play(fx) })
  return () => { unsubStore(); unsubBus(); if (typeof window !== 'undefined') { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) } }
}
