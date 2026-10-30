/** The signing round, in the open: countdown card → review scroll with the five checks → Sign / Reject (track-E §4.3). */
import { useState } from 'react'
import { useFlows } from '../app-context'
import { store, useShallowStore } from '../store'
import { selectSignRequests } from '../store/selectors'
import { Counter, PixelButton, Scroll, Signboard, Tag, Timer, cn } from '../ui'
import type { SignRequestData, SignReview } from './flows/types'

function findRequest (poolId: string, round: number): SignRequestData | undefined {
  const e = [...store.getState().feed].reverse().find(x => x.type === 'sign_request' && x.data.poolId === poolId && x.data.round === round)
  return e?.type === 'sign_request' ? e.data : undefined
}

export function SignCenter () {
  const requests = useShallowStore(selectSignRequests)
  const flows = useFlows()
  const [review, setReview] = useState<SignReview>()
  const [busy, setBusy] = useState<'review' | 'sign' | undefined>()
  const [error, setError] = useState<string>()
  const open = async (poolId: string, round: number): Promise<void> => {
    const req = findRequest(poolId, round)
    if (req === undefined) { setError('The request is no longer in the feed.'); return }
    setBusy('review'); setError(undefined)
    try { setReview(await flows.reviewSignRequest(req)) } catch (err) { setError(String((err as Error).message)) } finally { setBusy(undefined) }
  }
  const sign = async (): Promise<void> => {
    if (review === undefined) return
    setBusy('sign'); setError(undefined)
    try { await flows.sign(review); setReview(undefined) } catch (err) { setError(String((err as Error).message)) } finally { setBusy(undefined) }
  }
  const reject = async (reason: string): Promise<void> => {
    if (review === undefined) return
    await flows.reject(review.request, reason)
    setReview(undefined)
  }
  if (requests.length === 0 && review === undefined) return null
  return (
    <>
      {requests.map(n => (
        <Signboard key={n.id} tone="ok" title="Sign request" className="fixed right-4 bottom-20 z-40 w-[360px]" data-testid="sign-request-card">
          <p className="text-[14px] leading-5">{n.body}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            {n.expiresAt !== undefined && <Timer expiresAt={n.expiresAt} onExpire={() => store.getState().dismissNotification(n.id)} />}
            <PixelButton size="sm" loading={busy === 'review'} onClick={() => { void open(n.poolId ?? '', Number(n.id.split(':')[2])) }}>Review &amp; sign</PixelButton>
          </div>
          {error !== undefined && <p className="mt-2 text-[14px] leading-5 text-danger-dark">{error}</p>}
        </Signboard>
      ))}
      <Scroll open={review !== undefined} title={`Settlement round ${review?.request.round ?? ''}`} onClose={() => setReview(undefined)} id="sign-review"
        footer={review !== undefined && <>
          <PixelButton variant="danger" onClick={() => { void reject('participant refused after review') }}>Reject</PixelButton>
          <PixelButton loading={busy === 'sign'} disabled={!review.ok} onClick={() => { void sign() }}>Sign in BSV Desktop (SIGHASH_ALL)</PixelButton>
        </>}>
        {review !== undefined && (
          <div className="flex flex-col gap-3">
            <p>One transaction pays the provider and delivers every share. You sign only after every check passes; the coordinator cannot change a single output afterwards.</p>
            <div className="flex flex-wrap items-baseline gap-4">
              <Counter value={review.pledge.credits} size="s" unit="my credits" />
              <Counter value={review.myChangeSats} size="s" unit="sat change back" />
              <Counter value={review.participants} size="s" unit="participants" />
            </div>
            <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="sign-checks">
              {review.checks.map((c, i) => (
                <li key={i} className={cn('flex items-start gap-2 border-b border-surface-3 py-1 text-[14px] leading-5', c.ok === false && 'text-danger-dark')}>
                  <Tag tone={c.ok === true ? 'ok' : c.ok === 'skipped' ? 'neutral' : 'danger'}>{c.ok === true ? 'ok' : c.ok === 'skipped' ? 'skipped' : 'failed'}</Tag>
                  <span>{c.label}{c.detail !== undefined && <span className="block text-ink-muted">{c.detail}</span>}</span>
                  {c.stamp !== undefined && <Tag tone="neutral" className="ml-auto">{c.stamp}</Tag>}
                </li>
              ))}
            </ul>
            {error !== undefined && <p className="text-[14px] leading-5 text-danger-dark">{error}</p>}
          </div>
        )}
      </Scroll>
    </>
  )
}
