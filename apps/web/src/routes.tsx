import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router'
import { normalizeEntry, routerBasename } from './base'
import { TownPage } from './consoles/town/TownPage'
import { ExplorerPage } from './consoles/explorer/ExplorerPage'
import { MetricsPage } from './consoles/metrics/MetricsPage'
import { SettingsPage } from './consoles/settings/SettingsPage'
import { AgentsPage } from './consoles/agents/AgentsPage'
import { MarketPage } from './consoles/market/MarketPage'
import { OwnerPage } from './consoles/owner/OwnerPage'
import { PoolsPage } from './consoles/pools/PoolsPage'
import { ParticipantPage } from './consoles/participant/ParticipantPage'
import { ProviderPage } from './consoles/provider/ProviderPage'
import { AppShell } from './shell/AppShell'
import { RouteError } from './shell/RouteError'
import { LoadingState } from './ui'

const KitPage = lazy(() => import('./dev/KitPage'))
const DebugPage = lazy(() => import('./dev/DebugPage'))
const FilmPage = lazy(() => import('./film/FilmPage'))
const TownOnlyPage = lazy(() => import('./town/TownOnlyPage'))
const lazyPage = (Page: React.LazyExoticComponent<() => React.JSX.Element>) => <Suspense fallback={<LoadingState title="Loading…" />}><Page /></Suspense>

// `<base>index.html` → `<base>` before the router reads the address (src/base.ts)
normalizeEntry()

export const router = createBrowserRouter([
  // film mode (VIDEO.md): the Town alone on a 16:9 stage, outside the shell
  { path: '/film', element: lazyPage(FilmPage) },
  // the Town alone, filling the window, for an iframe on another site (src/town/TownOnlyPage.tsx)
  { path: '/town', element: lazyPage(TownOnlyPage) },
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [{
      // a page that throws shows RouteError inside the shell (top bar stays), not React Router's bare error page
      errorElement: <RouteError />,
      children: [
        { index: true, element: <TownPage /> },
        { path: 'pools', element: <PoolsPage /> },
        { path: 'me', element: <ParticipantPage /> },
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
    }]
  }
], { basename: routerBasename() })
