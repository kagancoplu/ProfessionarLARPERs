import { lazy, Suspense, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { useApproval, approvalStore } from '../mock/approvals'
import { store, useStore } from '../store'
import { PixelButton, Scroll, Signboard, Toasts } from '../ui'
import { t } from '../i18n/t'
import { TopBar } from './TopBar'
import { handleShortcut } from './shortcuts'
import { useRuntime } from '../app-context'
import { ReplayBar } from '../replay/ReplayBar'
import { SignCenter } from '../wallet/SignCenter'

/** film mode's app tour (?tour=main, VIDEO.md): loaded only when asked for */
const TourRunner = lazy(() => import('../film/TourRunner'))
const TOUR = typeof location !== 'undefined' && new URLSearchParams(location.search).get('tour') !== null

function NarrowScreenNotice () {
  return (
    <div className="p-6">
      <Signboard title="Desktop only">
        <p>Open AgentCoop on a desktop browser (≥ 1024 px wide) with BSV Desktop installed. The Town and the consoles are not built for phones.</p>
      </Signboard>
    </div>
  )
}

/** The mock Desktop's approval window (mock mode only). */
function MockApprovalDialog () {
  const pending = useApproval(s => s.pending)
  return (
    <Scroll open={pending !== undefined} title={t('wallet.approveHint')} id="mock-approval" priority
      footer={<>
        <PixelButton variant="secondary" onClick={() => approvalStore.getState().answer(false)}>Deny</PixelButton>
        <PixelButton onClick={() => approvalStore.getState().answer(true)} autoFocus>Approve (mock)</PixelButton>
      </>}>
      {pending !== undefined && (
        <div className="flex flex-col gap-2">
          <p className="font-display text-[20px] leading-7">{pending.title}</p>
          <ul className="mono list-none p-0 m-0 flex flex-col gap-1">{pending.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          <p className="text-ink-muted text-[14px] leading-5">This is the mock BSV Desktop. Nothing reaches the chain; txids start with <code>mock_</code>.</p>
        </div>
      )}
    </Scroll>
  )
}

export function AppShell () {
  const narrow = useStore(s => s.ui.narrowScreen)
  const navigate = useNavigate()
  const presenter = useStore(s => s.settings.presenter)
  const { replay } = useRuntime()
  useEffect(() => { document.documentElement.dataset.presenter = presenter ? '1' : '0' }, [presenter])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (handleShortcut(e, store, to => { void navigate(to) }, replay)) e.preventDefault() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, replay])
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const apply = (): void => store.getState().setNarrowScreen(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <main className="flex-1">{narrow ? <NarrowScreenNotice /> : <Outlet />}</main>
      <Toasts />
      <SignCenter />
      <ReplayBar />
      <MockApprovalDialog />
      {TOUR && <Suspense fallback={null}><TourRunner /></Suspense>}
    </div>
  )
}
