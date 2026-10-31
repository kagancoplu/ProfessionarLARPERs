import { NavLink } from 'react-router'
import { t } from '../i18n/t'
import { store, useStore } from '../store'
import { selectHealth, selectMode, selectSettings, selectUnread } from '../store/selectors'
import { cn, ServiceBadge, Tag } from '../ui'
import { OPTIONAL_SERVICES, type ServiceName } from '../env'
import { WalletChip } from './WalletChip'

const NAV: Array<{ to: string, key: 'town' | 'pools' | 'market' | 'agents' | 'provider' | 'owner' | 'explorer' | 'metrics' }> = [
  { to: '/', key: 'town' }, { to: '/pools', key: 'pools' }, { to: '/market', key: 'market' }, { to: '/agents', key: 'agents' },
  { to: '/provider', key: 'provider' }, { to: '/owner', key: 'owner' }, { to: '/explorer', key: 'explorer' }, { to: '/metrics', key: 'metrics' }
]

export function ModeBadge () {
  const mode = useStore(selectMode)
  const replayName = useStore(s => s.replayName)
  const transport = useStore(s => s.transport)
  const tone = mode === 'live' ? 'ok' : mode === 'mock' ? 'neutral' : 'info'
  // live: always show where the data comes from, not only in the fallback toast (BL-34 #14)
  const via = mode === 'live' && transport !== undefined ? ` · ${transport}` : ''
  const title = mode === 'replay'
    ? `replay: ${replayName ?? ''}`
    : transport === 'mirror' ? 'Live data from the relay\'s Supabase mirror (wallet flows and signing rounds go to the services directly)' : transport === 'direct' ? 'Live data read from the services directly' : undefined
  return <Tag tone={tone} title={title} data-testid="mode-badge">{t(`mode.${mode}`)}{via}</Tag>
}

export function TopBar () {
  const unread = useStore(selectUnread)
  const settings = useStore(selectSettings)
  const health = useStore(selectHealth)
  const down = (Object.entries(health) as Array<[ServiceName, { ok: boolean | 'unknown' }]>).filter(([name, h]) => h.ok === false && !OPTIONAL_SERVICES.includes(name)).length
  const resolvedTheme = typeof document !== 'undefined' ? document.documentElement.dataset.theme ?? 'day' : 'day'
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 whitespace-nowrap border-b-2 border-wood-dark bg-wood px-4 text-surface-2">
      <NavLink to="/" className="flex items-center gap-2 no-underline text-surface-2">
        <img src="/ui/logo.svg" alt="" aria-hidden className="pixelated size-8" />
        <span className="font-display text-[20px] leading-7 font-bold tracking-wide">{t('app.name')}</span>
      </NavLink>
      <nav className="flex items-center gap-1" aria-label="Main">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cn('label whitespace-nowrap px-1.5 py-1 no-underline text-surface-2 hover:bg-wood-dark', isActive && 'bg-wood-dark border-b-2 border-gold')}>
            {t(`nav.${n.key}`)}
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <ServiceBadge name={down === 0 ? 'services' : `${down} down`} health={{ ok: down === 0 ? (Object.values(health).some(h => h.ok === true) ? true : 'unknown') : false }} className="mr-1 text-surface-2" />
        <ModeBadge />
        <button type="button" onClick={() => store.getState().updateSettings({ sound: !settings.sound })} aria-pressed={settings.sound} title={settings.sound ? 'Sound on' : 'Sound off (default)'}
          className="label whitespace-nowrap border-2 border-surface-2 px-2 py-0.5 hover:bg-wood-dark">{settings.sound ? 'sound on' : 'sound off'}</button>
        <button type="button" onClick={() => store.getState().updateSettings({ theme: resolvedTheme === 'night' ? 'day' : 'night' })} title={`Theme: ${settings.theme}. Click to switch to ${resolvedTheme === 'night' ? 'day' : 'night'}.`}
          className="label whitespace-nowrap border-2 border-surface-2 px-2 py-0.5 hover:bg-wood-dark">{resolvedTheme === 'night' ? 'night' : 'day'}</button>
        <NavLink to="/explorer" className={cn('label relative whitespace-nowrap border-2 border-surface-2 px-2 py-0.5 no-underline text-surface-2 hover:bg-wood-dark', unread > 0 && 'border-gold text-gold')} title="Sign requests and guard refusals" data-testid="bell">
          alerts{unread > 0 && <span className="ml-1 counter text-[18px] leading-4">{unread}</span>}
        </NavLink>
        <NavLink to="/settings" className="label whitespace-nowrap border-2 border-surface-2 px-2 py-0.5 no-underline text-surface-2 hover:bg-wood-dark" title="Settings (sound, day/night, walking, presenter, motion)" data-testid="settings-link">⚙</NavLink>
        <WalletChip />
      </div>
    </header>
  )
}
