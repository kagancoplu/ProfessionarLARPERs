import type { HTMLAttributes } from 'react'
import { cn } from './cn'
import { t } from '../i18n/t'

export type TagTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'gold' | 'outline-danger'

const TONES: Record<TagTone, string> = {
  neutral: 'bg-surface-3 text-ink border-ink-muted',
  ok: 'bg-grass text-ink border-grass-dark',
  warn: 'bg-warn text-ink border-wood-dark',
  danger: 'bg-danger text-surface-2 border-danger-dark',
  info: 'bg-sky text-ink border-water',
  gold: 'bg-gold text-ink border-gold-dark',
  'outline-danger': 'bg-transparent text-danger-dark border-danger'
}

export function Tag ({ tone = 'neutral', className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: TagTone }) {
  return <span className={cn('label inline-flex items-center gap-1 border px-1.5 py-0 text-[12px] leading-4', TONES[tone], className)} {...rest}>{children}</span>
}

/** Fixed honesty tags (DESIGN.md "Voice and copy"): always visible where they apply. */
export const DemoPricingTag = () => <Tag tone="warn" title="Pool discounts are demo pricing, not a provider's real price list">{t('tags.demoPricing')}</Tag>
export const SimulatedJobsTag = () => <Tag tone="info" title="GPU jobs are simulated; payments, credits and settlements are real">{t('tags.simulated')}</Tag>
export const ExperimentalTag = () => <Tag tone="outline-danger">{t('tags.experimental')}</Tag>
export const MockTag = () => <Tag tone="neutral">{t('tags.mock')}</Tag>
