/** What main.tsx wires once and components reach through context: bus, wallet controller, mock/replay runtimes. */
import { createContext, useContext } from 'react'
import type { EventBus } from './events/bus'
import type { MockRuntime } from './mock/browser'
import type { ReplayPlayer } from './replay/player'
import type { WalletController } from './wallet/client'
import type { CoordinatorFeed } from './events/adapters/coordinatorWs'
import type { FlowsApi } from './wallet/flows/types'

export interface AppRuntime {
  bus: EventBus
  wallet: WalletController
  mock?: MockRuntime
  replay?: ReplayPlayer
  feed?: CoordinatorFeed
  flows: FlowsApi
}

export const AppRuntimeContext = createContext<AppRuntime | undefined>(undefined)

export function useRuntime (): AppRuntime {
  const rt = useContext(AppRuntimeContext)
  if (rt === undefined) throw new Error('AppRuntimeContext is missing')
  return rt
}

export function useFlows (): FlowsApi { return useRuntime().flows }
