/**
 * `hello` identity proof (B-P5a §2, MASTER §3.5). The coordinator sends a
 * per-connection nonce; the participant signs "agentcoop hello\n<host>\n<nonce>"
 * with a key derived from its identity for counterparty 'anyone', so the
 * coordinator can check it without any secret. The host binds the proof to
 * the coordinator the participant meant to reach (no relaying a nonce from a
 * fake coordinator to the real one).
 */
import { ProtoWallet, Utils, type WalletInterface, type WalletProtocol } from '@agentcoop/core/sdk'

export const HELLO_PROTOCOL: WalletProtocol = [1, 'agentcoop hello']
export const HELLO_KEY_ID = '1'

export const helloData = (host: string, nonce: string): number[] =>
  Utils.toArray(`agentcoop hello\n${host.toLowerCase()}\n${nonce}`, 'utf8')

/** Participant side: DER signature hex over the hello data. */
export async function signHello (wallet: WalletInterface, host: string, nonce: string): Promise<string> {
  const { signature } = await wallet.createSignature({ data: helloData(host, nonce), protocolID: HELLO_PROTOCOL, keyID: HELLO_KEY_ID, counterparty: 'anyone' })
  return Utils.toHex(signature)
}

const verifier = new ProtoWallet('anyone')

/** Coordinator side. Any malformed input is simply `false`. */
export async function verifyHello (identity: string, host: string, nonce: string, sigHex: unknown): Promise<boolean> {
  if (typeof sigHex !== 'string' || !/^[0-9a-f]{16,160}$/i.test(sigHex)) return false
  try {
    const { valid } = await verifier.verifySignature({
      data: helloData(host, nonce),
      signature: Utils.toArray(sigHex, 'hex'),
      protocolID: HELLO_PROTOCOL,
      keyID: HELLO_KEY_ID,
      counterparty: identity
    })
    return valid
  } catch {
    return false
  }
}
