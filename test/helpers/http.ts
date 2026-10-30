/** Start an Express app on an ephemeral port. */
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

export interface Listening { server: Server, url: string, close: () => Promise<void> }

export async function listen (app: { listen: (port: number, cb: () => void) => Server }): Promise<Listening> {
  return await new Promise(resolve => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo
      resolve({ server, url: `http://localhost:${port}`, close: async () => { await new Promise(r => server.close(() => r(undefined))) } })
    })
  })
}
