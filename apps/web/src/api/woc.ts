import { env } from '../env'

export const isMockTxid = (txid: string): boolean => txid.startsWith('mock_')
export const wocTxUrl = (txid: string): string | undefined => (isMockTxid(txid) ? undefined : `${env.wocTx}${txid}`)
export const shortHex = (s: string | undefined, n = 6): string => (s === undefined ? '' : s.length > 2 * n ? `${s.slice(0, n)}…${s.slice(-n)}` : s)
