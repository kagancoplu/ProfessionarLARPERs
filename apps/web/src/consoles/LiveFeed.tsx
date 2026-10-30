import type { AnyCoopEvent } from '../events/types'
import { shortHex } from '../api/woc'
import { useStore } from '../store'
import { selectFeed } from '../store/selectors'
import { EmptyState, Signboard, Tag, TxLink } from '../ui'
import { t } from '../i18n/t'

/** One human sentence per event (DESIGN.md voice). Unknown types fall back to the type name. */
export function describeEvent (e: AnyCoopEvent): string {
  switch (e.type) {
    case 'pool_opened': return `Pool announced: ${e.data.pool.terms.label} · ${e.data.pool.terms.credits} credits for ${e.data.pool.terms.priceSats} sat`
    case 'pledge_added': return `${shortHex(e.data.pledge.participant, 4)} pledged ${e.data.pledge.credits} credits (coin ${e.data.pledge.coinSats} sat stays in their wallet)`
    case 'pledge_cancelled': return `${shortHex(e.data.pledge.participant, 4)} withdrew a pledge of ${e.data.pledge.credits} credits`
    case 'pool_update': return `Pool ${shortHex(e.data.poolId, 4)}: ${e.data.pledgedCredits} credits pledged · ${e.data.status}`
    case 'sign_request': return `Sign request for pool ${shortHex(e.data.poolId, 4)}, round ${e.data.round}`
    case 'settled': return `Settled in one transaction`
    case 'pool_settled': return `Settlement: ${e.data.participants} participants · 1 transaction · 0 sat held by anyone`
    case 'round_failed': return `Signing round ${e.data.round} failed: ${e.data.missing.length} missing`
    case 'pool_failed': return 'Pool did not fill before its deadline. Nobody lost a satoshi.'
    case 'pool_cancelled': return 'The provider cancelled the pool.'
    case 'agent_started': return `${e.data.name} (${e.data.profile}) joined the square${e.data.mode === 'vault' ? ' with a vault' : ''}`
    case 'agent_thought': return `“${e.data.text}”`
    case 'agent_decision': return `decided: ${e.data.action}${e.data.credits !== undefined ? ` ${e.data.credits} credits` : ''} — ${e.data.reason}`
    case 'agent_injected': return `injected prompt: “${e.data.text}”`
    case 'agent_payment': return `paid ${e.data.sats ?? '?'} sat (${e.data.kind})`
    case 'agent_job': return `job ${e.data.jobId}: ${e.data.status}`
    case 'cosign_approved': return `The guard checked the policy and co-signed (${e.data.kind}, ${e.data.sats} sat)`
    case 'cosign_denied': return `The guard refused: ${e.data.reason}`
    case 'vault_registered': return `Vault ${shortHex(e.data.vaultId, 4)} registered for agent ${shortHex(e.data.agent, 4)}`
    case 'vault_funded': return `Vault funded with ${e.data.vault.balanceSats} sat`
    case 'vault_spent': return e.data.by === 'owner' ? 'The owner withdrew from the vault' : 'Agent + guard spent from the vault'
    case 'policy_updated': return `Policy updated for agent ${shortHex(e.data.agent, 4)}`
    case 'credits_redeemed': return `${e.data.credits} credit(s) redeemed at the provider`
    case 'job_queued': return `GPU job queued: ${e.data.kind}, ${e.data.minutes} min`
    case 'job_running': return `GPU job running: ${e.data.kind}`
    case 'job_done': return `GPU job done: ${e.data.kind}, result ${e.data.resultHash ?? ''}`
    case 'listing_added': return `${e.data.listing.credits} credits listed for ${e.data.listing.askSats} sat`
    case 'listing_filled': return `Listing swept: ${e.data.listing.credits} credits`
    case 'listing_cancelled': return 'Listing cancelled'
    case 'wallet_connected': return `BSV Desktop connected (${e.data.network})`
    case 'wallet_disconnected': return 'Wallet disconnected'
    case 'service_health': return `${e.data.service}: ${e.data.ok ? 'ok' : 'down'}${e.data.detail !== undefined ? ` (${e.data.detail})` : ''}`
    case 'mode_changed': return `Mode: ${e.data.mode}`
    case 'admitted': return 'Overlay admitted a transaction'
    case 'spent': return 'Overlay saw an output spent'
    case 'error': return `Coordinator error: ${e.data.error}`
    default: return e.type
  }
}

const SRC_TONE = { coordinator: 'info', overlay: 'ok', agents: 'neutral', guard: 'danger', provider: 'warn', maker: 'info', web: 'neutral' } as const

export function LiveFeed ({ limit = 50 }: { limit?: number }) {
  const feed = useStore(selectFeed)
  const items = feed.slice(-limit).reverse().filter(e => e.type !== 'service_health')
  return (
    <Signboard title="Live feed" data-testid="live-feed">
      {items.length === 0
        ? <EmptyState sprite="board" title="The square is quiet." body={t('states.noEvents')} />
        : (
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {items.map(e => (
              <li key={`${e.src}:${e.id}`} className="flex items-baseline gap-2 border-b border-surface-3 py-1 text-[14px] leading-5 last:border-0">
                <span className="counter w-[84px] shrink-0 whitespace-nowrap text-[18px] leading-5 text-ink-muted">{new Date(e.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
                <Tag tone={SRC_TONE[e.src]}>{e.src}</Tag>
                <span className="min-w-0 flex-1">{describeEvent(e)}</span>
                {e.txid !== undefined && <TxLink txid={e.txid} chars={4} />}
              </li>
            ))}
          </ol>
        )}
    </Signboard>
  )
}
