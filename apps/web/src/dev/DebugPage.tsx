/** /_debug — events, state, health, mode controls and the core-in-browser smoke test (track-E 0.6). */
import { useState } from 'react'
import { useRuntime } from '../app-context'
import { env } from '../env'
import { store, useShallowStore, useStore } from '../store'
import { Counter, PixelButton, ServiceBadge, Signboard, Tag } from '../ui'
import { describeEvent } from '../consoles/LiveFeed'

interface SmokeResult { ok: boolean, lines: string[] }

/** Imports @agentcoop/core in the browser and calls three things (single ESM SDK copy, no node imports). */
async function coreSmoke (): Promise<SmokeResult> {
  const lines: string[] = []
  try {
    const t0 = performance.now()
    const core = await import('@agentcoop/core')
    const sdk = await import('@bsv/sdk')
    lines.push(`import @agentcoop/core: ${Object.keys(core).length} exports in ${Math.round(performance.now() - t0)} ms`)
    const script = core.buildOpReturn('pool', { v: '1', label: 'smoke' })
    lines.push(`buildOpReturn('pool', …) → ${script.toHex().length / 2} bytes, parse back: ${JSON.stringify(core.parseOpReturn(script))}`)
    const k = (seed: number): string => sdk.PrivateKey.fromRandom().toPublicKey().toString() + (seed === 0 ? '' : '')
    const vault = core.vaultLockingScript(k(0), k(1), k(2))
    lines.push(`vaultLockingScript → ${vault.toHex().length / 2} bytes (expected 109)`)
    const kit = new core.TokenKit({} as never, new core.OverlayClient(env.urls.overlay))
    lines.push(`new TokenKit(wallet, OverlayClient('${env.urls.overlay}')) → ${typeof kit.balances === 'function' ? 'ok' : 'missing balances()'}`)
    const sameTx = (script as unknown) instanceof sdk.Script
    lines.push(`core's LockingScript is an instance of @bsv/sdk's Script (one SDK copy): ${sameTx ? 'yes' : 'NO (two SDK copies?)'}`)
    return { ok: vault.toHex().length / 2 === 109 && sameTx, lines }
  } catch (err) {
    lines.push(`FAILED: ${String((err as Error).stack ?? err)}`)
    return { ok: false, lines }
  }
}

export default function DebugPage () {
  const rt = useRuntime()
  const feed = useStore(s => s.feed)
  const health = useStore(s => s.health)
  const counters = useStore(s => s.counters)
  const state = useShallowStore(s => ({ pools: s.pools, agents: s.agents, vaults: s.vaults, listings: s.listings, jobs: s.jobs, metrics: s.metrics, me: s.me, notifications: s.notifications }))
  const [smoke, setSmoke] = useState<SmokeResult | undefined>()
  const [speed, setSpeed] = useState(1)
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 p-6" data-testid="debug">
      <div className="flex items-center gap-3"><h1>Debug</h1><Tag tone="neutral">{env.mode}</Tag><span className="text-ink-muted text-[14px]">events seen: <span className="counter text-[18px]">{counters.eventsSeen}</span></span></div>

      <div className="grid grid-cols-2 gap-4">
        <Signboard title="Services">
          <div className="flex flex-col gap-2">
            {(Object.keys(health) as Array<keyof typeof health>).map(s => <ServiceBadge key={s} name={s} health={health[s]} url={env.urls[s]} />)}
          </div>
        </Signboard>
        <Signboard title="Mode controls">
          {rt.mock !== undefined && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px]">mock scenario · cycle {rt.mock.scenario.cycle} · step {rt.mock.scenario.stepIndex}/{rt.mock.scenario.stepCount}</span>
              <PixelButton size="sm" variant="secondary" onClick={() => { rt.mock!.scenario.status === 'running' ? rt.mock!.scenario.pause() : rt.mock!.scenario.resume() }}>pause / resume</PixelButton>
              <PixelButton size="sm" variant="secondary" onClick={() => { const next = speed >= 8 ? 1 : speed * 2; setSpeed(next); rt.mock!.scenario.setSpeed(next) }}>speed {speed}×</PixelButton>
              <PixelButton size="sm" variant="secondary" onClick={() => { rt.mock!.scenario.pause(); rt.mock!.scenario.runCycleSync() }}>run a whole cycle now</PixelButton>
            </div>
          )}
          {rt.replay !== undefined && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px]">replay · {rt.replay.status} · {rt.replay.position}/{rt.replay.events.length}</span>
              <PixelButton size="sm" variant="secondary" onClick={() => rt.replay!.play()}>play</PixelButton>
              <PixelButton size="sm" variant="secondary" onClick={() => rt.replay!.pause()}>pause</PixelButton>
              <PixelButton size="sm" variant="secondary" onClick={() => rt.replay!.skipTo('settled')}>skip to settlement</PixelButton>
            </div>
          )}
          {rt.mock === undefined && rt.replay === undefined && <p className="text-ink-muted">Live mode: adapters connect to the URLs above.</p>}
          <p className="mt-2 text-[14px] text-ink-muted">URLs: {Object.entries(env.urls).map(([k, v]) => `${k}=${v}`).join(' · ')}</p>
        </Signboard>
      </div>

      <Signboard title="Core in the browser (smoke)" actions={<PixelButton size="sm" variant="secondary" onClick={() => { void coreSmoke().then(setSmoke) }}>run</PixelButton>}>
        {smoke === undefined ? <p className="text-ink-muted">Imports @agentcoop/core, builds an OP_RETURN, a vault script and a TokenKit; checks the SDK is one copy.</p> : (
          <div data-testid="core-smoke" data-ok={String(smoke.ok)}>
            <Tag tone={smoke.ok ? 'ok' : 'danger'}>{smoke.ok ? 'ok' : 'failed'}</Tag>
            <ul className="mono m-0 mt-2 list-none p-0 text-[16px]">{smoke.lines.map((l, i) => <li key={i} className="whitespace-pre-wrap break-all">{l}</li>)}</ul>
          </div>
        )}
      </Signboard>

      <div className="grid grid-cols-2 gap-4">
        <Signboard title={`Events (last ${Math.min(feed.length, 60)})`}>
          <ol className="m-0 flex max-h-[520px] list-none flex-col gap-1 overflow-y-auto p-0 text-[14px] leading-5" data-testid="debug-events">
            {feed.slice(-60).reverse().map(e => (
              <li key={`${e.src}:${e.id}`} className="border-b border-surface-3 py-1">
                <span className="mono text-ink-muted">{e.src}:{e.id.split(':').pop()}</span> <Tag tone="neutral">{e.type}</Tag> {describeEvent(e)}
              </li>
            ))}
          </ol>
        </Signboard>
        <Signboard title="State">
          <div className="flex items-center gap-4 mb-2"><Counter value={Object.keys(state.pools.byId).length} size="s" unit="pools" /><Counter value={Object.keys(state.agents.byIdentity).length} size="s" unit="agents" /><Counter value={state.notifications.length} size="s" unit="notifications" /></div>
          <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap break-all text-[14px] leading-5" data-testid="debug-state">{JSON.stringify(state, null, 1)}</pre>
          <PixelButton size="sm" variant="ghost" onClick={() => store.getState().reset(env.mode, env.replayName)}>reset store</PixelButton>
        </Signboard>
      </div>
    </div>
  )
}
