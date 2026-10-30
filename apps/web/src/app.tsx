import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { queryClient } from './api/queries'
import { AppRuntimeContext, type AppRuntime } from './app-context'
import { router } from './routes'

export function App ({ runtime }: { runtime: AppRuntime }) {
  return (
    <AppRuntimeContext.Provider value={runtime}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppRuntimeContext.Provider>
  )
}
