/**
 * TEST-ONLY participant bot: a wallet-toolbox wallet on the coordinator's WS.
 * On `sign_request` it checks its own input and credit output (a minimal
 * stand-in for A's verifySettlementPlan) and then behaves as told.
 */
import { Transaction, Utils, type WalletInterface } from '@bsv/sdk'
import { WebSocket } from 'ws'
import { decodeBsv21 } from '../../../../packages/overlay/src/kit/inscription'
import { receivePkh } from '../../../../packages/overlay/src/kit/addresses'
import { SCOPE_ALL, signInput, type Coin } from '../../../../packages/overlay/test/helpers/settlement'

export type Behavior = 'sign' | 'silent' | 'reject' | 'garbage'

export interface Bot {
  identity: string
  ws: WebSocket
  messages: any[]
  addCoin: (coin: Coin) => void
  waitFor: (pred: (m: any) => boolean, ms?: number) => Promise<any>
  close: () => void
}

export async function startBot (coopUrl: string, wallet: WalletInterface, opts: { behavior?: (round: number) => Behavior, delayMs?: number } = {}): Promise<Bot> {
  const { publicKey: identity } = await wallet.getPublicKey({ identityKey: true })
  const coins = new Map<string, Coin>()
  const messages: any[] = []
  const ws = new WebSocket(`${coopUrl.replace('http', 'ws')}/ws`)
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
  const send = (m: object): void => { ws.send(JSON.stringify(m)) }

  ws.on('message', d => {
    const msg = JSON.parse(d.toString())
    messages.push(msg)
    if (msg.type !== 'sign_request') return
    void (async () => {
      const behavior = opts.behavior?.(msg.round) ?? 'sign'
      if (opts.delayMs !== undefined) await new Promise(resolve => setTimeout(resolve, opts.delayMs))
      const tx = Transaction.fromAtomicBEEF(msg.plan.templateBEEF)
      const idx: number = msg.yourInputIndex
      const input = tx.inputs[idx]
      const coin = coins.get(`${input.sourceTXID ?? input.sourceTransaction!.id('hex')}_${input.sourceOutputIndex}`)
      const mine = msg.plan.participants.find((p: any) => p.outpoint === coin?.sourceTransaction.id('hex') + '_' + String(coin?.vout))
      const creditOk = mine !== undefined && tx.outputs.some(o => {
        const d = decodeBsv21(o.lockingScript)
        return d !== null && d.ownerPkh === receivePkh(identity, 0) && d.amt === mine.credits
      })
      if (coin === undefined || !creditOk) { send({ type: 'sign_reject', poolId: msg.poolId, round: msg.round, reason: 'plan check failed' }); return }
      if (behavior === 'silent') return
      if (behavior === 'reject') { send({ type: 'sign_reject', poolId: msg.poolId, round: msg.round, reason: 'policy' }); return }
      const unlockingScriptHex = behavior === 'garbage'
        ? Utils.toHex([0x02, 0xde, 0xad])
        : (await signInput(wallet, tx, idx, coin.key, SCOPE_ALL)).toHex()
      send({ type: 'sign_response', poolId: msg.poolId, round: msg.round, inputIndex: idx, unlockingScriptHex })
    })()
  })
  send({ type: 'hello', identity, poolIds: [] })

  const waitFor = async (pred: (m: any) => boolean, ms = 15_000): Promise<any> => {
    const end = Date.now() + ms
    for (;;) {
      const hit = messages.find(pred)
      if (hit !== undefined) return hit
      if (Date.now() > end) throw new Error(`bot ${identity.slice(0, 8)} timed out; got ${JSON.stringify(messages.map(m => m.type))}`)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  await waitFor(m => m.type === 'hello_ack')
  return {
    identity,
    ws,
    messages,
    addCoin: coin => { coins.set(`${coin.sourceTransaction.id('hex')}_${coin.vout}`, coin) },
    waitFor,
    close: () => ws.close()
  }
}
