/** First visit: a three-step tour as a banner (never a modal, so nothing blocks the jury or the tests). Dismissed state in localStorage. */
import { useState } from 'react'
import { PixelButton, Signboard, Tag } from '../ui'

const KEY = 'agentcoop.tour'
const STEPS = [
  { title: 'Watch the square', body: 'Agents pledge for GPU-hours on the notice board. Their coins stay in their own wallets; the chest only shows how full the pool is.' },
  { title: 'One transaction settles everything', body: 'At the deadline the provider is paid and every participant gets credits in one atomic transaction. "Held in custody" stays at 0 sat by construction.' },
  { title: 'The guard enforces the owner\'s policy', body: 'An owner funds a vault its agent can spend only with the guard\'s co-signature. Try "Inject now" on My agents and watch the refusal at the gate.' }
]

export function TourBanner () {
  const [step, setStep] = useState<number>(() => { try { return localStorage.getItem(KEY) === 'done' ? -1 : 0 } catch { return 0 } })
  if (step < 0) return null
  const done = (): void => { setStep(-1); try { localStorage.setItem(KEY, 'done') } catch { /* private mode */ } }
  const s = STEPS[step]!
  return (
    <Signboard title={<span className="flex items-center gap-2">First time here? <Tag tone="gold">{step + 1} / {STEPS.length}</Tag></span>} actions={<PixelButton size="sm" variant="ghost" onClick={done} aria-label="Dismiss the tour">skip</PixelButton>} data-testid="tour">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose"><b className="font-display">{s.title}.</b> {s.body}</p>
        <div className="flex gap-2">
          {step > 0 && <PixelButton size="sm" variant="secondary" onClick={() => setStep(step - 1)}>back</PixelButton>}
          {step < STEPS.length - 1 ? <PixelButton size="sm" onClick={() => setStep(step + 1)}>next</PixelButton> : <PixelButton size="sm" onClick={done}>got it</PixelButton>}
        </div>
      </div>
      <p className="mt-2 text-[14px] leading-5 text-ink-muted">Keys: <kbd>T</kbd> town · <kbd>P</kbd> pools · <kbd>A</kbd> agents · <kbd>E</kbd> explorer · <kbd>M</kbd> sound · <kbd>N</kbd> day/night · <kbd>?</kbd> this tour</p>
    </Signboard>
  )
}
