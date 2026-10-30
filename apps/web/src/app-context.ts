/** What main.tsx wires once and components reach through context: bus, wallet controller, mock/replay runtimes. */
import { createContext, useContext } from 'react'
import type { EventBus } from './events/bus'
import type { MockRuntime } from './mock/browser'
import type { ReplayPlayer } from './replay/player'
import type { WalletController } from './wallet/client'

export interface AppRuntime {
  bus: EventBus
  wallet: WalletController
  mock?: MockRuntime
  replay?: ReplayPlayer
}

export const AppRuntimeContext = createContext<AppRuntime | undefined>(undefined)

export function useRuntime (): AppRuntime {
  const rt = useContext(AppRuntimeContext)
  if (rt === undefined) throw new Error('AppRuntimeContext is missing')
  return rt
}
