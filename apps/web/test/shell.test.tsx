import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AppRuntimeContext } from '../src/app-context'
import { createBus } from '../src/events/bus'
import { MOCK_IDS } from '../src/mock/data'
import { createMockWallet } from '../src/mock/wallet'
import { store } from '../src/store'
import { TopBar } from '../src/shell/TopBar'
import { WalletController } from '../src/wallet/client'

function mount () {
  const bus = createBus(store)
  const wallet = new WalletController({ store, bus, factory: () => createMockWallet({ identityKey: MOCK_IDS.me, delayMs: 0, autoApprove: true }), expectedNetwork: 'main' })
  const router = createMemoryRouter([{ path: '/', element: <TopBar /> }])
  render(<AppRuntimeContext.Provider value={{ bus, wallet }}><RouterProvider router={router} /></AppRuntimeContext.Provider>)
  return { bus, wallet }
}

describe('TopBar', () => {
  it('shows the mode badge, nav and "Connect BSV Desktop"; connecting shows the short identity and the network', async () => {
    store.getState().reset('mock')
    mount()
    expect(screen.getByTestId('mode-badge')).toHaveTextContent('MOCK')
    expect(screen.getByRole('link', { name: 'Pools' })).toBeInTheDocument()
    const connect = screen.getByRole('button', { name: 'Connect BSV Desktop' })
    await userEvent.click(connect)
    await waitFor(() => expect(screen.getByText('mainnet')).toBeInTheDocument())
    expect(screen.getByTestId('wallet-chip')).toHaveTextContent(MOCK_IDS.me.slice(0, 5))
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()
  })
})
