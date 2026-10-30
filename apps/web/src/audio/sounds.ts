/** Sound map skeleton (track-E §5.3). Off by default; files arrive in P4 (Kenney CC0). */
import type { AnyCoopEvent } from '../events/types'

export type SoundName = 'coin' | 'bell' | 'shield' | 'ring' | 'scroll'

export const SOUND_FOR_EVENT: Partial<Record<AnyCoopEvent['type'], SoundName>> = {
  pledge_added: 'coin',
  settled: 'bell',
  pool_settled: 'bell',
  cosign_denied: 'shield',
  sign_request: 'ring',
  job_done: 'scroll'
}

export interface SoundPlayer { play: (name: SoundName) => void, setEnabled: (on: boolean) => void }

/** No-op player until the audio files land; keeps the wiring (bus → sound) in place. */
export function createSoundPlayer (): SoundPlayer {
  let enabled = false
  return {
    play: name => { if (enabled && import.meta.env.DEV) console.debug('[sound]', name) },
    setEnabled: on => { enabled = on }
  }
}
