/**
 * The mock BSV Desktop (track-E 0.5): same WalletInterface surface the flows use, every signing
 * call goes through an on-screen "Approve in BSV Desktop" scroll, txids are `mock_` prefixed.
 * Only the methods the app calls are implemented; the rest throw a clear error.
 */
import type { WalletInterface } from '@bsv/sdk'
import { mockTxid } from './data'
import { approvalStore } from './approvals'

export interface MockWalletOptions {
  identityKey: string
  network?: 'mainnet' | 'testnet'
  /** simulated Desktop latency */
  delayMs?: number
  /** auto-approve without the dialog (tests) */
  autoApprove?: boolean
}

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

export function createMockWallet (opts: MockWalletOptions): WalletInterface {
  const network = opts.network ?? 'mainnet'
  const delay = opts.delayMs ?? 400
  const approve = async (title: string, lines: string[]): Promise<void> => {
    await wait(delay)
    const ok = opts.autoApprove === true ? true : await approvalStore.getState().request({ title, lines })
    if (!ok) throw new Error('User rejected the request in BSV Desktop (mock)')
  }
  const notImplemented = (name: string) => async (): Promise<never> => { throw new Error(`mock wallet: ${name} is not implemented`) }

  const wallet = {
    waitForAuthentication: async () => { await wait(delay); return { authenticated: true as const } },
    isAuthenticated: async () => ({ authenticated: true as const }),
    getNetwork: async () => ({ network }),
    getVersion: async () => ({ version: 'mock-desktop-0.1' }),
    getHeight: async () => ({ height: 920_000 }),
    getPublicKey: async (args: { identityKey?: boolean, protocolID?: unknown, keyID?: string }) => {
      if (args.identityKey === true) return { publicKey: opts.identityKey }
      // derived keys: deterministic fake, never the identity key (AGENTS.md rule)
      const seed = `${JSON.stringify(args.protocolID)}:${args.keyID ?? ''}`
      let h = 7
      for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
      return { publicKey: '02' + h.toString(16).padStart(8, '0').repeat(8) }
    },
    createAction: async (args: { description: string, outputs?: Array<{ satoshis: number, outputDescription?: string }> }) => {
      const total = (args.outputs ?? []).reduce((s, o) => s + o.satoshis, 0)
      await approve(args.description, [`${total} sat in ${args.outputs?.length ?? 0} output(s)`, ...(args.outputs ?? []).map(o => `· ${o.satoshis} sat ${o.outputDescription ?? ''}`)])
      const txid = mockTxid('action')
      return { txid, tx: [] as number[] }
    },
    signAction: async () => ({ txid: mockTxid('signed'), tx: [] as number[] }),
    createSignature: async (args: { protocolID?: unknown, keyID?: string }) => {
      await approve('Sign with a derived key', [`protocol ${JSON.stringify(args.protocolID)}`, `keyID ${args.keyID ?? ''}`])
      return { signature: [] as number[] }
    },
    internalizeAction: async () => ({ accepted: true as const }),
    listOutputs: async () => ({ totalOutputs: 0, outputs: [] }),
    relinquishOutput: async () => ({ relinquished: true as const }),
    abortAction: async () => ({ aborted: true as const }),
    listActions: async () => ({ totalActions: 0, actions: [] }),
    revealCounterpartyKeyLinkage: notImplemented('revealCounterpartyKeyLinkage'),
    revealSpecificKeyLinkage: notImplemented('revealSpecificKeyLinkage'),
    encrypt: notImplemented('encrypt'),
    decrypt: notImplemented('decrypt'),
    createHmac: notImplemented('createHmac'),
    verifyHmac: notImplemented('verifyHmac'),
    verifySignature: notImplemented('verifySignature'),
    acquireCertificate: notImplemented('acquireCertificate'),
    listCertificates: notImplemented('listCertificates'),
    proveCertificate: notImplemented('proveCertificate'),
    relinquishCertificate: notImplemented('relinquishCertificate'),
    discoverByIdentityKey: notImplemented('discoverByIdentityKey'),
    discoverByAttributes: notImplemented('discoverByAttributes'),
    getHeaderForHeight: notImplemented('getHeaderForHeight')
  }
  return wallet as unknown as WalletInterface
}
