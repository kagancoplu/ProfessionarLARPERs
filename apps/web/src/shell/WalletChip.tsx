import { useState } from 'react'
import { useRuntime } from '../app-context'
import { t } from '../i18n/t'
import { useStore } from '../store'
import { selectMe } from '../store/selectors'
import { IdentityChip, PixelButton, Tag } from '../ui'

/** Top-bar wallet state: not connected → "Connect BSV Desktop"; connected → short identity + network badge. */
export function WalletChip () {
  const me = useStore(selectMe)
  const { wallet } = useRuntime()
  const [busy, setBusy] = useState(false)
  const connect = async (): Promise<void> => {
    setBusy(true)
    try { await wallet.connect() } catch { /* the controller already put the message in me.error */ } finally { setBusy(false) }
  }
  if (me.status === 'connected' && me.identityKey !== undefined) {
    return (
      <div className="flex items-center gap-2" data-testid="wallet-chip">
        <IdentityChip identity={me.identityKey} role="me" name="you" />
        <Tag tone={me.network === 'mainnet' ? 'ok' : 'warn'}>{me.network}</Tag>
        <PixelButton variant="ghost" size="sm" onClick={() => wallet.disconnect()}>{t('wallet.disconnect')}</PixelButton>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2" data-testid="wallet-chip">
      {me.status === 'error' && me.error !== undefined && <span className="text-[14px] leading-5 text-danger-dark max-w-[320px] truncate" title={me.error}>{me.error}</span>}
      <PixelButton size="sm" loading={busy || me.status === 'connecting'} onClick={() => { void connect() }}>
        {me.status === 'connecting' ? t('wallet.connecting') : t('wallet.connect')}
      </PixelButton>
    </div>
  )
}
