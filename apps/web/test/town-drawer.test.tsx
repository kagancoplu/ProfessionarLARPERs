import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { createBus } from '../src/events/bus'
import { MOCK_IDS } from '../src/mock/data'
import { MockScenario } from '../src/mock/scenario'
import { createMockWorld } from '../src/mock/state'
import { store } from '../src/store'
import { TownDrawer } from '../src/town/TownDrawer'
import { ErrorBoundary } from '../src/ui'

function mount () {
  store.getState().reset('mock')
  const bus = createBus(store)
  new MockScenario({ bus, world: createMockWorld(), loop: false }).runCycleSync(Date.parse('2026-10-30T18:00:00Z'))
  const router = createMemoryRouter([{ path: '/', element: <TownDrawer /> }, { path: '/provider', element: <p>provider console</p> }])
  render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>)
  return router
}

/** What `E` (or a click) opens in the Town: every card renders, none takes the page down. */
describe('TownDrawer', () => {
  it('opens an agent card (house, villager) without a render loop', () => {
    mount()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => { store.getState().openDrawer('agent', MOCK_IDS.agents.eval) })
    expect(screen.getByRole('complementary', { name: 'Villager' })).toBeInTheDocument()
    expect(screen.getByText('Decisions')).toBeInTheDocument()
    expect(screen.getAllByText(/GPU jobs/).length).toBeGreaterThan(0)
    // a store change (a new event) re-renders the card without looping
    act(() => { store.getState().pushToast({ kind: 'info', text: 'tick' }) })
    expect(screen.getByRole('complementary', { name: 'Villager' })).toBeInTheDocument()
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/getSnapshot|Maximum update depth/)
    error.mockRestore()
  })

  it('opens every other card the Town points at', () => {
    mount()
    const s = store.getState()
    const vault = Object.keys(s.vaults.byId)[0]!
    const pool = s.pools.order[0]!
    for (const [kind, id, title] of [['pool', pool, 'Pool'], ['vault', vault, 'Vault'], ['rail', 'harbor', 'Harbor office'], ['me', 'workshop', 'Workshop'], ['listing', 'gone_0', 'Stall']] as const) {
      act(() => { store.getState().openDrawer(kind, id) })
      expect(screen.getByRole('complementary', { name: title })).toBeInTheDocument()
    }
  })

  it('the workshop leads to the provider console', async () => {
    const router = mount()
    act(() => { store.getState().openDrawer('me', 'workshop') })
    await userEvent.click(screen.getByRole('button', { name: 'Open the provider console' }))
    expect(router.state.location.pathname).toBe('/provider')
    expect(store.getState().ui.drawer).toBeUndefined()
  })
})

describe('ErrorBoundary', () => {
  it('shows the fallback instead of the broken child and recovers when the key changes', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = () => { throw new Error('boom') }
    const { rerender } = render(<ErrorBoundary resetKey="a" fallback={e => <p>fallback: {e.message}</p>}><Boom /></ErrorBoundary>)
    expect(screen.getByText('fallback: boom')).toBeInTheDocument()
    rerender(<ErrorBoundary resetKey="b" fallback={e => <p>fallback: {e.message}</p>}><p>fine</p></ErrorBoundary>)
    expect(screen.getByText('fine')).toBeInTheDocument()
    error.mockRestore()
  })
})
