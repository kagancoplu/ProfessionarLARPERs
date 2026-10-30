/** /_kit — the design system in one place (track-E 0.2): tokens, type, components, states, sprites, atlas. */
import { lazy, Suspense, useState } from 'react'
import { store, useStore } from '../store'
import { Counter, DemoPricingTag, EmptyState, ErrorState, ExperimentalTag, IdentityChip, LoadingState, PixelButton, Scroll, ServiceBadge, Signboard, SimulatedJobsTag, Sprite, Tag, Timer, TxLink } from '../ui'
import { SPRITE_DATA, type SpriteName } from '../ui/sprites.generated'

const AtlasPreview = lazy(() => import('../town/AtlasPreview'))

const TOKENS = ['surface', 'surface-2', 'surface-3', 'ink', 'ink-muted', 'wood', 'wood-dark', 'wood-light', 'gold', 'gold-dark', 'grass', 'grass-dark', 'danger', 'danger-dark', 'sky', 'water', 'warn']

export default function KitPage () {
  const theme = useStore(s => s.settings.theme)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const expires = useState(() => new Date(Date.now() + 65_000).toISOString())[0]
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 p-6" data-testid="kit">
      <div className="flex items-center gap-3">
        <h1>Kit</h1>
        <PixelButton variant="secondary" size="sm" onClick={() => store.getState().updateSettings({ theme: theme === 'night' ? 'day' : 'night' })}>{theme === 'night' ? 'switch to day' : 'switch to night'}</PixelButton>
        <span className="text-ink-muted text-[14px]">Every component in both palettes. Anything that deviates from DESIGN.md is a bug.</span>
      </div>

      <Signboard title="Palette">
        <div className="grid grid-cols-6 gap-2">
          {TOKENS.map(name => (
            <div key={name} className="flex flex-col gap-1">
              <div className="h-10 border-2 border-ink" style={{ background: `var(--${name})` }} />
              <span className="label text-ink-muted">--{name}</span>
            </div>
          ))}
        </div>
      </Signboard>

      <Signboard title="Typography">
        <h1>Pixelify Sans 32 — Nobody held anyone's money for a second.</h1>
        <h2>Pixelify Sans 24 — Festival in 3 days · 600/1000 credits</h2>
        <h3>Pixelify Sans 20 — Guard refused: maxPerPoolSats exceeded (6,000 &gt; 5,000)</h3>
        <p className="label text-ink-muted">label · pixelify 14 uppercase</p>
        <p>IBM Plex Sans 16 body — The provider signed once and went offline (SINGLE|ACP). Every participant checked the whole transaction before signing (ALL). 25 000 sat for 1 000 GPU-hours.</p>
        <p className="text-[14px] leading-5 text-ink-muted">Plex 14 muted — captions, table cells, helper text; never smaller.</p>
        <div className="flex flex-wrap items-end gap-6">
          <Counter value={25000} unit="sat" size="l" tone="gold" /><Counter value={1000} unit="credits" size="m" /><Counter value={149} unit="sat fee" size="s" tone="muted" />
        </div>
        <p className="mono">VT323 18 mono — 03e8836800f10ea1…d0394a45a · mock_settle_001</p>
      </Signboard>

      <Signboard title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <PixelButton>Join pool</PixelButton>
          <PixelButton variant="secondary">Review &amp; sign</PixelButton>
          <PixelButton variant="danger">Reject</PixelButton>
          <PixelButton variant="ghost">Cancel</PixelButton>
          <PixelButton disabled>Disabled</PixelButton>
          <PixelButton loading={loading} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500) }}>Approve in BSV Desktop</PixelButton>
          <PixelButton size="sm" variant="secondary">small</PixelButton>
          <PixelButton size="lg">large</PixelButton>
        </div>
      </Signboard>

      <Signboard title="Tags, chips, badges, links">
        <div className="flex flex-wrap items-center gap-3">
          <DemoPricingTag /><SimulatedJobsTag /><ExperimentalTag /><Tag tone="ok">settled</Tag><Tag tone="warn">locking</Tag><Tag tone="danger">failed</Tag><Tag tone="info">open</Tag><Tag tone="gold">T5</Tag>
          <IdentityChip identity="03e8836800f10ea1524f2a3035270335991fa62a6ed5b3cff4b265831d0394a45a" role="provider" name="provider" />
          <IdentityChip identity="02a1b2c3d4e5f60718293a4b5c6d7e8f9011223344556677889900aabbccddeeff" role="agent" name="eval" />
          <ServiceBadge name="Coordinator" health={{ ok: true }} /><ServiceBadge name="Guard" health={{ ok: false, detail: 'ECONNREFUSED' }} /><ServiceBadge name="Agents" health={{ ok: 'unknown' }} />
          <TxLink txid="4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b" /><TxLink txid="mock_settle_001" />
          <Timer expiresAt={expires} />
        </div>
      </Signboard>

      <div className="grid grid-cols-3 gap-4">
        <Signboard title="Empty"><EmptyState title="No pools on the board yet." body="A provider opens the first one from the workshop." action={<PixelButton size="sm" variant="secondary">Open the provider console</PixelButton>} /></Signboard>
        <Signboard title="Loading"><LoadingState title="Reading the overlay…" body="ls_agentcoop · pools" /></Signboard>
        <Signboard title="Error"><ErrorState title="The coordinator is not answering." body="http://localhost:8090 refused the connection. Start it with `node infra/run.mjs`." onRetry={() => {}} /></Signboard>
      </div>

      <Signboard title="Scroll (modal)" actions={<PixelButton size="sm" variant="secondary" onClick={() => setOpen(true)}>open</PixelButton>}>
        <p className="text-ink-muted">Every confirmation: what, how many sats, which address → Approve in BSV Desktop → txid.</p>
        <Scroll open={open} title="Join pool 8×H100 · 1 week" onClose={() => setOpen(false)} footer={<><PixelButton variant="secondary" onClick={() => setOpen(false)}>Cancel</PixelButton><PixelButton onClick={() => setOpen(false)}>Approve in BSV Desktop</PixelButton></>}>
          <ul className="m-0 list-none p-0 flex flex-col gap-1">
            <li>300 credits · 7 500 sat pledge coin (stays in your wallet)</li>
            <li>300 sat registration fee → provider's revenue key</li>
            <li className="mono text-ink-muted">76a914…88ac</li>
          </ul>
        </Scroll>
      </Signboard>

      <Signboard title="Sprites (code-drawn, 1× / 3×)">
        <div className="flex flex-wrap items-end gap-6">
          {(Object.keys(SPRITE_DATA) as SpriteName[]).map(name => (
            <div key={name} className="flex flex-col items-center gap-1">
              <div className="flex items-end gap-2"><Sprite name={name} zoom={1} /><Sprite name={name} zoom={3} /></div>
              <span className="label text-ink-muted">{name}</span>
            </div>
          ))}
        </div>
      </Signboard>

      <Signboard title="Phaser atlas (public/game/atlas.png)">
        <Suspense fallback={<LoadingState title="Loading Phaser…" />}><AtlasPreview /></Suspense>
      </Signboard>
    </div>
  )
}
