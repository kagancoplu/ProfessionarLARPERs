/** /metrics — why the counters say what they say, the coordinator's chain-computed metrics (live), the harbor. */
import { useQuery } from '@tanstack/react-query'
import { coopApi } from '../../api/coop'
import { keys } from '../../api/queries'
import { useShallowStore, useStore } from '../../store'
import { selectMetrics } from '../../store/selectors'
import { Counter, DemoPricingTag, LoadingState, Signboard, SimulatedJobsTag, TimeChart } from '../../ui'
import { refusalSeries, savingsSeries, sessionSpan } from './series'
import { useMemo } from 'react'
import { t } from '../../i18n/t'
import { RailCard } from '../RailCard'
import { CornerCounters } from '../town/CornerCounters'

export function MetricsPage () {
  const m = useStore(selectMetrics)
  const mode = useStore(s => s.mode)
  const points = useStore(s => s.history.points)
  const agents = useStore(s => s.agents.byIdentity)
  const savings = useMemo(() => [savingsSeries(points)], [points])
  const refusals = useMemo(() => [refusalSeries(points, Object.fromEntries(Object.values(agents).map(a => [a.identity, a.name])))], [points, agents])
  const span = useShallowStore(s => sessionSpan(s))
  const live = useQuery({ queryKey: keys.metrics, queryFn: () => coopApi.metrics(), enabled: mode === 'live', retry: 0 })
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 p-6">
      <CornerCounters />
      <Signboard title="Why these numbers">
        <ul className="m-0 list-disc pl-5">
          <li><b>{t('metrics.custody')}</b>: every settlement output is either the provider's payment, a participant's credits, a participant's change or an OP_RETURN. Nothing else, so nothing is ever held.</li>
          <li><b>{t('metrics.savings')}</b>: Σ(retail × credits − pool price) over settled pools. Pool prices are <DemoPricingTag /> set by our own provider.</li>
          <li>Fees so far: <Counter value={m.feeSats} size="s" unit="sat" /> · guard refusals: <Counter value={m.deniedByGuard} size="s" tone="danger" /> · pools that did not fill: <Counter value={m.failedPools} size="s" /></li>
          <li>GPU jobs are <SimulatedJobsTag />; payments, credits and settlements are real transactions in live mode.</li>
        </ul>
      </Signboard>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Signboard title={<span className="flex items-center gap-2">Village savings <DemoPricingTag /></span>} data-testid="chart-savings">
          <p className="mb-2 text-[14px] leading-5 text-ink-muted">Sats saved against retail, one step per settlement this session.</p>
          <TimeChart series={savings} unit="sat" {...(span !== undefined ? { span } : {})} empty="No settlement yet this session." testId="savings-chart" />
        </Signboard>
        <Signboard title="Guard refusals" data-testid="chart-refusals">
          <p className="mb-2 text-[14px] leading-5 text-ink-muted">Each step is a spend the guard would not co-sign. Nothing was sent for any of them.</p>
          <TimeChart series={refusals} unit="refusals" {...(span !== undefined ? { span } : {})} empty="The guard has not refused anything this session." testId="refusals-chart" />
        </Signboard>
      </div>
      <Signboard title="Harbor · Coop Rail" data-testid="rail-signboard"><RailCard /></Signboard>
      {mode === 'live' && (
        <Signboard title="Coordinator /metrics (Track B, computed from the chain)">
          {live.isError ? <p className="text-ink-muted">The coordinator's /metrics is not answering ({String((live.error as Error).message)}).</p>
            : live.data === undefined ? <LoadingState title="Asking the coordinator…" />
              : <pre className="whitespace-pre-wrap break-all text-[14px] leading-5">{JSON.stringify(live.data, null, 1)}</pre>}
        </Signboard>
      )}
    </div>
  )
}
