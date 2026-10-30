/** Bottom bar in replay mode: play/pause, speed, skip to the settlement, position, provenance badge. */
import { useEffect, useState } from 'react'
import { useRuntime } from '../app-context'
import { store, useStore } from '../store'
import { PixelButton, Tag } from '../ui'

const SPEEDS = [0.5, 1, 2, 4, 8]

export function ReplayBar () {
  const mode = useStore(s => s.mode)
  const name = useStore(s => s.replayName)
  const speed = useStore(s => s.settings.replaySpeed)
  const { replay } = useRuntime()
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick(t => t + 1), 500); return () => clearInterval(id) }, [])
  if (mode !== 'replay' || replay === undefined) return null
  const real = name !== undefined && name.startsWith('mainnet')
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center gap-3 border-t-2 border-wood-dark bg-wood px-4 py-2 text-surface-2" data-testid="replay-bar">
      <Tag tone="info">REPLAY</Tag>
      <span className="font-display">{name}</span>
      <Tag tone={real ? 'ok' : 'neutral'}>{real ? 'This really happened on BSV mainnet' : 'mock recording · no chain'}</Tag>
      <span className="counter text-[18px]">{replay.position}/{replay.events.length}</span>
      <span className="label">{replay.status}</span>
      <div className="ml-auto flex items-center gap-2">
        <PixelButton size="sm" variant="secondary" onClick={() => { replay.status === 'playing' ? replay.pause() : replay.play() }}>{replay.status === 'playing' ? 'pause' : 'play'}</PixelButton>
        {SPEEDS.map(s => <PixelButton key={s} size="sm" variant={speed === s ? 'primary' : 'secondary'} onClick={() => { store.getState().updateSettings({ replaySpeed: s }); replay.setSpeed(s) }}>{s}×</PixelButton>)}
        <PixelButton size="sm" variant="secondary" onClick={() => { void replay.ready.then(() => replay.skipTo(replay.events.some(e => e.type === 'pool_settled') ? 'pool_settled' : 'settled')) }}>skip to settlement</PixelButton>
        <PixelButton size="sm" variant="ghost" onClick={() => { replay.pause(); store.getState().reset('replay', name); replay.position = 0; replay.play() }}>restart</PixelButton>
      </div>
    </div>
  )
}
