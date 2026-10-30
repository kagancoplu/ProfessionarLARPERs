/**
 * The coordinator's `hello` identity proof (MASTER §3.5, B-P5a): sign "agentcoop hello\n<host>\n<nonce>"
 * with [1,'agentcoop hello'], keyID '1', counterparty 'anyone'. Mirrors apps/coordinator/src/auth.ts.
 * `host` must be what the coordinator sees in the Host header: through the Vite proxy that is the
 * browser's own host (changeOrigin is off for /api/coop); in a build it is the coordinator URL's host.
 */
import { Utils, type WalletInterface, type WalletProtocol } from '@bsv/sdk'

export const HELLO_PROTOCOL: WalletProtocol = [1, 'agentcoop hello']
export const HELLO_KEY_ID = '1'

export const helloData = (host: string, nonce: string): number[] => Utils.toArray(`agentcoop hello\n${host.toLowerCase()}\n${nonce}`, 'utf8')

export async function signHello (wallet: Pick<WalletInterface, 'createSignature'>, host: string, nonce: string): Promise<string> {
  const { signature } = await wallet.createSignature({ data: helloData(host, nonce), protocolID: HELLO_PROTOCOL, keyID: HELLO_KEY_ID, counterparty: 'anyone' })
  return Utils.toHex(signature)
}

export function coordinatorHost (coopUrl: string, loc: { host: string } = location): string {
  return coopUrl.startsWith('/') ? loc.host : new URL(coopUrl).host
}
