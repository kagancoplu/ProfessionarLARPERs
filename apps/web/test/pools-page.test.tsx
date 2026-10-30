import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AppRuntimeContext } from '../src/app-context'
import { PoolsPage } from '../src/consoles/pools/PoolsPage'
import { createBus } from '../src/events/bus'
import { createMockWorld } from '../src/mock/state'
import { MockScenario } from '../src/mock/scenario'
import { store } from '../src/store'
import { WalletController } from '../src/wallet/client'
import { createMockWallet } from '../src/mock/wallet'
import { MOCK_IDS } from '../src/mock/data'

describe('PoolsPage', () => {
  it('lists the mock pools, filters by status and opens the detail drawer on click', async () => {
    store.getState().reset('mock')
    const bus = createBus(store)
    new MockScenario({ bus, world: createMockWorld(), loop: false }).runCycleSync(Date.parse('2026-10-30T18:00:00Z'))
    const wallet = new WalletController({ store, bus, factory: () => createMockWallet({ identityKey: MOCK_IDS.me, autoApprove: true, delayMs: 0 }), expectedNetwork: 'main' })
    const router = createMemoryRouter([{ path: '/', element: <PoolsPage /> }])
    render(<AppRuntimeContext.Provider value={{ bus, wallet }}><QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider></AppRuntimeContext.Provider>)
    expect(screen.getAllByTestId('pool-row')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'settled' }))
    expect(screen.getAllByTestId('pool-row')).toHaveLength(1)
    await userEvent.click(screen.getAllByTestId('pool-row')[0]!)
    expect(screen.getByTestId('pool-detail')).toHaveTextContent('1 transaction · 3 participants · 0 sat held by anyone')
    expect(screen.getByTestId('pledge-table').querySelectorAll('tbody tr')).toHaveLength(3)
  })
})
