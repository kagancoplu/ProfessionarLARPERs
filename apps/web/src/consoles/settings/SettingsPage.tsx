/** /settings — every preference in one place (the top bar keeps the quick toggles). Stored with the rest of the settings. */
import { store, useStore } from '../../store'
import type { Settings } from '../../store/types'
import { PixelButton, Signboard, Tag } from '../../ui'

const SPEEDS = [0.5, 1, 2, 4, 8]

function Toggle ({ label, hint, value, onChange, testId }: { label: string, hint: string, value: boolean, onChange: (v: boolean) => void, testId: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-surface-3 py-3 last:border-0">
      <div><p className="font-display">{label}</p><p className="text-[14px] leading-5 text-ink-muted">{hint}</p></div>
      <PixelButton size="sm" variant={value ? 'primary' : 'secondary'} aria-pressed={value} onClick={() => onChange(!value)} data-testid={testId}>{value ? 'on' : 'off'}</PixelButton>
    </div>
  )
}

export function SettingsPage () {
  const s = useStore(x => x.settings)
  const mode = useStore(x => x.mode)
  const set = (patch: Partial<Settings>): void => store.getState().updateSettings(patch)
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-[2fr_1fr] gap-6 p-6" data-testid="settings">
      <Signboard title="Settings">
        <div className="flex items-start justify-between gap-4 border-b border-surface-3 py-3">
          <div><p className="font-display">Day / night</p><p className="text-[14px] leading-5 text-ink-muted">Auto follows your system. The Town lights its lanterns at night.</p></div>
          <div className="flex gap-1">{(['auto', 'day', 'night'] as const).map(t => <PixelButton key={t} size="sm" variant={s.theme === t ? 'primary' : 'secondary'} onClick={() => set({ theme: t })} data-testid={`theme-${t}`}>{t}</PixelButton>)}</div>
        </div>
        <Toggle label="Sound" hint="Short chiptune effects for pledges, the settlement bell, guard refusals and sign requests. Synthesised in the browser; nothing is downloaded. Key: M." value={s.sound} onChange={v => set({ sound: v })} testId="toggle-sound" />
        <Toggle label="Walk the town" hint="Your own villager walks with WASD / arrows; E opens what is in front of you. Key: V." value={s.avatar} onChange={v => set({ avatar: v })} testId="toggle-avatar" />
        <Toggle label="Presenter mode" hint="Bigger type, no toasts or tour, replay stages on 1–5. Also ?presenter=1." value={s.presenter} onChange={v => set({ presenter: v })} testId="toggle-presenter" />
        <Toggle label="Reduce motion" hint="Big Town scenes jump to their last frame (your system setting is also respected)." value={s.reducedMotion} onChange={v => set({ reducedMotion: v })} testId="toggle-motion" />
        <div className="flex items-start justify-between gap-4 py-3">
          <div><p className="font-display">Replay speed</p><p className="text-[14px] leading-5 text-ink-muted">Used by <code>?replay=…</code>; the replay bar changes it too.</p></div>
          <div className="flex gap-1">{SPEEDS.map(v => <PixelButton key={v} size="sm" variant={s.replaySpeed === v ? 'primary' : 'secondary'} onClick={() => set({ replaySpeed: v })}>{v}×</PixelButton>)}</div>
        </div>
      </Signboard>
      <Signboard title="This session">
        <p className="text-[14px] leading-5">Mode: <Tag tone={mode === 'live' ? 'ok' : 'neutral'}>{mode}</Tag></p>
        <p className="mt-2 text-[14px] leading-5 text-ink-muted">Switch with <code>?mode=mock</code>, <code>?mode=live</code> or <code>?replay=&lt;name&gt;</code>. Nothing here touches a key: your wallet stays in BSV Desktop.</p>
        <PixelButton className="mt-3" size="sm" variant="ghost" onClick={() => { try { localStorage.removeItem('agentcoop.tour') } catch { /* private mode */ } }}>Show the first-visit tour again</PixelButton>
      </Signboard>
    </div>
  )
}
