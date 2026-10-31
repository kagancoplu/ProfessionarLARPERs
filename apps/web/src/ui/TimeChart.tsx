/**
 * A small time chart for the consoles: step lines (running totals) and dots (one mark per
 * event) on one time axis and one y-scale. Hover shows the nearest event; a table view sits
 * under every chart so nothing is read from colour alone.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatInt } from './Counter'

export interface ChartPoint { t: number, v: number, tip: string }
export interface ChartSeries {
  id: string
  label: string
  /** a CSS colour, normally a token: var(--chart-ask) */
  color: string
  kind: 'step' | 'dots'
  hollow?: boolean
  points: ChartPoint[]
}

interface Props {
  series: ChartSeries[]
  unit: string
  /** a horizontal reference line (retail price) */
  reference?: { v: number, label: string }
  height?: number
  /** the time axis; defaults to the first and last point */
  span?: [number, number]
  empty: string
  testId?: string
}

const PAD = { l: 52, r: 16, t: 12, b: 24 }
const clock = (t: number): string => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function niceMax (v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

function useWidth (): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(480)
  useEffect(() => {
    const el = ref.current
    if (el === null) return
    setW(el.clientWidth || 480)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => { if (entry !== undefined) setW(Math.max(200, Math.round(entry.contentRect.width))) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export function TimeChart ({ series, unit, reference, height = 160, span, empty, testId }: Props) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<{ s: ChartSeries, p: ChartPoint } | undefined>()
  const all = useMemo(() => series.flatMap(s => s.points.map(p => ({ s, p }))).sort((a, b) => a.p.t - b.p.t), [series])
  if (all.length === 0) return <p className="text-[14px] leading-5 text-ink-muted" data-testid={testId}>{empty}</p>

  const t0 = Math.min(span?.[0] ?? Infinity, all[0]!.p.t)
  const t1 = Math.max(span?.[1] ?? 0, all.at(-1)!.p.t, t0 + 1000)
  const yMax = niceMax(Math.max(...all.map(a => a.p.v), reference?.v ?? 0) * 1.1)
  const w = width - PAD.l - PAD.r
  const h = height - PAD.t - PAD.b
  const x = (t: number): number => PAD.l + ((t - t0) / (t1 - t0)) * w
  const y = (v: number): number => PAD.t + h - (v / yMax) * h
  const ticks = [0, yMax / 2, yMax]

  const stepPath = (pts: ChartPoint[]): string => {
    if (pts.length === 0) return ''
    let d = `M ${x(t0)} ${y(0)} H ${x(pts[0]!.t)} V ${y(pts[0]!.v)}`
    for (const p of pts.slice(1)) d += ` H ${x(p.t)} V ${y(p.v)}`
    return `${d} H ${x(t1)}`
  }

  const onMove = (ev: React.MouseEvent<SVGSVGElement>): void => {
    const box = ev.currentTarget.getBoundingClientRect()
    const mx = ev.clientX - box.left
    let best = all[0]!
    for (const a of all) if (Math.abs(x(a.p.t) - mx) < Math.abs(x(best.p.t) - mx)) best = a
    setHover(best)
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {series.length > 1 && (
        <ul className="m-0 flex list-none flex-wrap gap-4 p-0 text-[14px] leading-5" aria-label="legend">
          {series.map(s => (
            <li key={s.id} className="flex items-center gap-1">
              <svg width="14" height="14" aria-hidden="true">{s.kind === 'step' ? <line x1="1" y1="7" x2="13" y2="7" stroke={s.color} strokeWidth="2" /> : <circle cx="7" cy="7" r="4" fill={s.hollow === true ? 'none' : s.color} stroke={s.color} strokeWidth="2" />}</svg>
              {s.label}
            </li>
          ))}
          {reference !== undefined && <li className="flex items-center gap-1"><svg width="14" height="14" aria-hidden="true"><line x1="1" y1="7" x2="13" y2="7" stroke="var(--ink-muted)" strokeWidth="1" strokeDasharray="3 2" /></svg>{reference.label}</li>}
        </ul>
      )}
      <div ref={ref} className="relative w-full">
        <svg width={width} height={height} role="img" aria-label={series.map(s => s.label).join(', ')} onMouseMove={onMove} onMouseLeave={() => setHover(undefined)} className="block">
          {ticks.map(v => (
            <g key={v}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--surface-3)" strokeWidth="1" />
              <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--ink-muted)">{formatInt(Math.round(v))}</text>
            </g>
          ))}
          <text x={PAD.l} y={height - 6} fontSize="11" fill="var(--ink-muted)">{clock(t0)}</text>
          <text x={width - PAD.r} y={height - 6} fontSize="11" fill="var(--ink-muted)" textAnchor="end">{clock(t1)}</text>
          {reference !== undefined && (
            <g>
              <line x1={PAD.l} x2={width - PAD.r} y1={y(reference.v)} y2={y(reference.v)} stroke="var(--ink-muted)" strokeWidth="1" strokeDasharray="4 3" />
              <text x={width - PAD.r} y={y(reference.v) - 4} textAnchor="end" fontSize="11" fill="var(--ink-muted)">{reference.label}</text>
            </g>
          )}
          {hover !== undefined && <line x1={x(hover.p.t)} x2={x(hover.p.t)} y1={PAD.t} y2={PAD.t + h} stroke="var(--ink-muted)" strokeWidth="1" />}
          {series.map(s => (
            <g key={s.id}>
              {s.kind === 'step' && <path d={stepPath(s.points)} fill="none" stroke={s.color} strokeWidth="2" />}
              {s.points.map((p, i) => (
                <circle key={i} cx={x(p.t)} cy={y(p.v)} r={hover?.p === p ? 7 : 5} fill={s.hollow === true ? 'var(--surface-2)' : s.color} stroke={s.hollow === true ? s.color : 'var(--surface-2)'} strokeWidth="2" />
              ))}
            </g>
          ))}
        </svg>
        {hover !== undefined && (
          <div className="pointer-events-none absolute z-10 max-w-[260px] border-2 border-ink bg-surface-2 px-2 py-1 text-[13px] leading-4 shadow-hard" style={{ left: Math.min(x(hover.p.t) + 8, width - 260), top: 4 }} data-testid="chart-tip">
            <p className="label text-ink-muted">{clock(hover.p.t)} · {hover.s.label}</p>
            <p><b>{formatInt(Math.round(hover.p.v))} {unit}</b></p>
            <p>{hover.p.tip}</p>
          </div>
        )}
      </div>
      <details className="text-[14px] leading-5">
        <summary className="cursor-pointer text-ink-muted">Table view</summary>
        <table className="mt-1 w-full border-collapse">
          <thead><tr className="label bg-surface-3 text-left text-[12px]"><th className="px-2 py-1">Time</th><th className="px-2 py-1">Series</th><th className="px-2 py-1 text-right">{unit}</th><th className="px-2 py-1">What</th></tr></thead>
          <tbody>{[...all].reverse().map((a, i) => (
            <tr key={i} className="border-b border-surface-3"><td className="px-2 py-1 mono">{clock(a.p.t)}</td><td className="px-2 py-1">{a.s.label}</td><td className="px-2 py-1 text-right">{formatInt(Math.round(a.p.v))}</td><td className="px-2 py-1">{a.p.tip}</td></tr>
          ))}</tbody>
        </table>
      </details>
    </div>
  )
}
