import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router'
import { AgentsPage, ExplorerPage, MarketPage, MetricsPage, OwnerPage, PoolsPage, ProviderPage, SettingsPage, TownPage } from './consoles/pages'
import { AppShell } from './shell/AppShell'
import { LoadingState } from './ui'

const KitPage = lazy(() => import('./dev/KitPage'))
const DebugPage = lazy(() => import('./dev/DebugPage'))
const lazyPage = (Page: React.LazyExoticComponent<() => React.JSX.Element>) => <Suspense fallback={<LoadingState title="Loading…" />}><Page /></Suspense>

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <TownPage /> },
      { path: 'pools', element: <PoolsPage /> },
      { path: 'market', element: <MarketPage /> },
      { path: 'agents', element: <AgentsPage /> },
      { path: 'provider', element: <ProviderPage /> },
      { path: 'owner', element: <OwnerPage /> },
      { path: 'explorer', element: <ExplorerPage /> },
      { path: 'metrics', element: <MetricsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '_kit', element: lazyPage(KitPage) },
      { path: '_debug', element: lazyPage(DebugPage) },
      { path: '*', element: <div className="p-6"><LoadingState title="There is no such street in this town." body="Use the signposts in the top bar." /></div> }
    ]
  }
])
