/** The four corner counters (Town and Metrics): custody 0 by construction, settlements, participants, village savings. */
import { useStore } from '../../store'
import { selectMetrics } from '../../store/selectors'
import { Counter, DemoPricingTag, Signboard } from '../../ui'
import { t } from '../../i18n/t'

export function CornerCounters () {
  const m = useStore(selectMetrics)
  return (
    <div className="grid grid-cols-4 gap-4" data-testid="corner-counters">
      <Signboard><p className="label text-ink-muted">{t('metrics.custody')}</p><Counter value={m.custodiedSats} unit="sat" tone="grass" /></Signboard>
      <Signboard><p className="label text-ink-muted">{t('metrics.settlements')}</p><Counter value={m.settlements} /></Signboard>
      <Signboard><p className="label text-ink-muted">{t('metrics.participants')}</p><Counter value={m.participants} /></Signboard>
      <Signboard><p className="label text-ink-muted flex items-center gap-2">{t('metrics.savings')} <DemoPricingTag /></p><Counter value={m.villageSavingsSats} unit="sat" tone="gold" /></Signboard>
    </div>
  )
}
