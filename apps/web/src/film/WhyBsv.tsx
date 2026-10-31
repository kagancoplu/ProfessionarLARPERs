/**
 * "Why BSV" (18 s, VIDEO.md): a split-screen motion graphic, drawn from the film time `t` alone (no state), so
 * any frame renders the same. Left: on Ethereum five buyers deposit into an escrow contract; the deal fails and
 * every deposit goes back as a refund. Right: on BSV the coins never leave the wallets; when the pool fills one
 * transaction pays the provider and hands out every share. Then the BSV stack the project runs on.
 * Lines in narration.ts (why-eth 0.8 s, why-bsv 7.2 s, why-stack 14 s).
 */
import type { CSSProperties, ReactNode } from 'react'
import { ICONS } from '../ui/icons.generated'
import { duration } from './narration'

export const WHY_DURATION = duration('why')
/** the motion graphic has no director: its sound effects are listed here, on the same times as the drawing */
export const WHY_CUES: Array<{ t: number, name: string }> = [
  ...[0, 1, 2, 3, 4].map(i => ({ t: 1.2 + i * 0.3, name: 'coin' })),
  { t: 3.4, name: 'shield' },
  ...[0, 1, 2, 3, 4].map(i => ({ t: 4.0 + i * 0.3, name: 'blip' })),
  { t: 6.4, name: 'whoosh' }, { t: 9.2, name: 'whoosh' }, { t: 9.6, name: 'bell' }, { t: 10.2, name: 'chest' },
  ...[0, 1, 2, 3].map(i => ({ t: 13.8 + i * 0.4, name: 'pop' }))
]

const clamp = (x: number): number => Math.max(0, Math.min(1, x))
/** 0→1 between a and b, eased */
const span = (t: number, a: number, b: number): number => { const x = clamp((t - a) / (b - a)); return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2 }
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

function Icon ({ name, size = 64, style }: { name: keyof typeof ICONS, size?: number, style?: CSSProperties }) {
  return <div style={{ width: size, height: size, backgroundImage: 'url(/ui/icons.png)', backgroundSize: `${30 * size}px ${size}px`, backgroundPosition: `${-ICONS[name] * size}px 0`, imageRendering: 'pixelated', ...style }} />
}

function Panel ({ x, title, tag, children, show }: { x: number, title: string, tag: string, children: ReactNode, show: number }) {
  return (
    <div className="frame-wood" style={{ position: 'absolute', left: x, top: 150, width: 840, height: 610, background: '#fbf3df', opacity: show, transform: `translateY(${(1 - show) * 30}px)` }}>
      <div style={{ background: '#4b2d16', color: '#f9e6cf', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16, font: '34px var(--font-display)' }}>
        {title}<span className="town-label town-label-gold" style={{ fontSize: 20, padding: '2px 10px', marginLeft: 'auto' }}>{tag}</span>
      </div>
      <div style={{ position: 'relative', height: 540 }}>{children}</div>
    </div>
  )
}

const BUYERS = [0, 1, 2, 3, 4]
const bx = (i: number): number => 90 + i * 150

export function WhyBsv ({ t }: { t: number }) {
  // ---- left: escrow
  const leftIn = span(t, 0, 0.6)
  const deposit = (i: number): number => span(t, 1.2 + i * 0.3, 2.0 + i * 0.3)
  const fail = span(t, 3.4, 3.8)
  const refund = (i: number): number => span(t, 4.0 + i * 0.3, 4.8 + i * 0.3)
  // ---- right: one transaction
  const rightIn = span(t, 6.4, 7.0)
  const glow = 0.55 + 0.45 * Math.sin(t * 6)
  const fill = span(t, 8.6, 9.2)
  const lines = span(t, 9.2, 10.2)
  const outs = span(t, 10.2, 11.0)
  const hundred = span(t, 11.4, 12.8)
  // ---- the stack
  const stack = ['BSV Desktop · the wallet', 'BSV-21 · credit tokens', 'Overlays · pool and token state', 'HTTP 402 · paid APIs']
  const dim = span(t, 13.4, 13.9)
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#efe2c4', fontFamily: 'var(--font-body)', color: '#3f2832' }}>
      <div style={{ position: 'absolute', top: 48, width: '100%', textAlign: 'center', font: '52px var(--font-display)', opacity: span(t, 0, 0.5) }}>Why BSV</div>

      <Panel x={80} title="Ethereum" tag="escrow contract" show={leftIn}>
        {BUYERS.map(i => {
          const k = deposit(i), back = refund(i)
          const cx = lerp(bx(i) + 8, 388, k) + (bx(i) + 8 - 388) * back, cy = lerp(130, 300, k) - 170 * back
          return (
            <div key={i}>
              <Icon name="villager" style={{ position: 'absolute', left: bx(i), top: 40 }} />
              <Icon name="coin" size={48} style={{ position: 'absolute', left: cx, top: cy, opacity: k > 0 || back > 0 ? 1 : 0.95 }} />
              {back > 0 && back < 1 && <span className="town-label town-label-danger" style={{ position: 'absolute', left: cx - 30, top: cy - 40, fontSize: 18, padding: '1px 6px' }}>refund · gas</span>}
            </div>
          )
        })}
        <div style={{ position: 'absolute', left: 300, top: 270, width: 230, height: 120, border: '4px solid #3f2832', background: fail > 0 ? '#e8b4a8' : '#f3e6c8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, font: '24px var(--font-display)' }}>
          <Icon name="chest" size={56} />contract
        </div>
        {fail > 0 && <div className="town-label town-label-danger" style={{ position: 'absolute', left: 290, top: 410, fontSize: 24, padding: '3px 12px', opacity: fail }}>the deal fails</div>}
        <div style={{ position: 'absolute', left: 30, right: 30, bottom: 26, font: '26px var(--font-counter)', opacity: span(t, 5.2, 5.6) }}>5 deposits + 5 refunds = 10 transactions</div>
      </Panel>

      <Panel x={1000} title="BSV · AgentCoop" tag="no escrow" show={rightIn}>
        {BUYERS.map(i => (
          <div key={i}>
            <Icon name="villager" style={{ position: 'absolute', left: bx(i), top: 40 }} />
            <Icon name="coin" size={48} style={{ position: 'absolute', left: bx(i) + 8, top: 130, filter: fill < 1 ? `drop-shadow(0 0 ${6 * glow}px #fee761)` : 'none' }} />
            <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: lines }} width="840" height="540">
              <line x1={bx(i) + 32} y1={180} x2={420} y2={lerp(180, 290, lines)} stroke="#3f2832" strokeWidth="4" strokeDasharray="10 6" />
            </svg>
          </div>
        ))}
        {fill < 1 && rightIn > 0.5 && <div className="town-label town-label-gold" style={{ position: 'absolute', left: 300, top: 200, fontSize: 20, padding: '2px 10px', opacity: 1 - fill }}>still in their wallets</div>}
        <div style={{ position: 'absolute', left: 240, top: 290, width: 360, height: 70, border: '4px solid #3f2832', background: '#e4f2d8', opacity: lines, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '28px var(--font-display)' }}>1 transaction</div>
        <div style={{ position: 'absolute', left: 60, top: 400, display: 'flex', gap: 22, alignItems: 'center', opacity: outs, transform: `translateY(${(1 - outs) * -20}px)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '20px var(--font-display)' }}><Icon name="gold" size={48} />provider paid</div>
          {BUYERS.map(i => <Icon key={i} name="chest" size={48} />)}
          <span style={{ font: '20px var(--font-display)' }}>a share each</span>
        </div>
        <div style={{ position: 'absolute', left: 30, right: 30, bottom: 26, font: '26px var(--font-counter)', opacity: hundred }}>a hundred buyers: still 1 transaction · nothing to refund</div>
      </Panel>

      <div style={{ position: 'absolute', left: 80, right: 80, top: 800, display: 'flex', gap: 24, justifyContent: 'center', opacity: dim }}>
        {stack.map((s, i) => {
          const k = span(t, 13.8 + i * 0.4, 14.3 + i * 0.4)
          return <div key={s} className="town-label" style={{ fontSize: 28, padding: '10px 18px', opacity: k, transform: `translateY(${(1 - k) * 24}px)` }}>{s}</div>
        })}
      </div>
      <div style={{ position: 'absolute', top: 900, width: '100%', textAlign: 'center', font: '30px var(--font-display)', opacity: span(t, 15.6, 16.2) }}>the BSV stack</div>
    </div>
  )
}
