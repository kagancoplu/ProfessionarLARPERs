/**
 * Offline AgentCoop stack in one process, for `npm run demo:*` and the tests:
 * wallet-toolbox's mock chain, Track B's overlay (tm_agentcoop) and
 * coordinator (signing rounds over WS, a manual block height so deadlines can
 * pass), the provider API, the provider operator (a wallet-toolbox wallet in
 * place of BSV Desktop) and funded agents. Every transaction is real (built,
 * signed, SPV-checked, admitted by the overlay); only the chain is simulated.
 */
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { Wallet } from '@bsv/wallet-toolbox'
import { Transaction } from '@agentcoop/core/sdk'
import { COOP_SERVICE, COOP_TOPIC, memoryOutbox, OverlayClient, type LineageOptions } from '@agentcoop/core'
import { createMockChain, type MockChain } from '../../../../test/helpers/mockchain'
import { startOverlay, type RunningOverlay } from '../../../../packages/overlay/src/server'
import { broadcastMock } from '../../../../packages/overlay/test/helpers/settlement'
import { ManualHeight } from '../../../coordinator/src/chain'
import { coreProtocol } from '../../../coordinator/src/protocol'
import { noSpentChecker } from '../../../coordinator/src/spent'
import { startCoordinator, type RunningCoordinator } from '../../../coordinator/src/server'
import { createProviderApp } from '../../../provider-api/src/app'
import { CreditLedger } from '../../../provider-api/src/credits'
import { JobRunner } from '../../../provider-api/src/runner'
import { loadProducts, PRODUCTS_DIR, type Product } from '../../../provider-api/src/products'
import { mint, openPool, type CliContext, type OpenPoolArgs } from '../../../provider-cli/src/commands'
import { PoolRegistry, type PoolRecord } from '../../../provider-cli/src/pools'
import { Agent } from '../agent'
import { rulesBrain, type Brain } from '../brain'
import { AgentLog } from '../log'
import { Market } from '../market'
import { PoolParticipant } from '../participant'
import { Procurement } from '../procurement'
import { loadProfile } from '../profile'

export interface StackOptions {
  /** decisions.log / activity.log go here (default: a temp dir). */
  dataDir?: string
  /** No console output (tests). */
  quiet?: boolean
  /** Simulated GPU minutes per second (default 3000: jobs take well under a second). */
  minutesPerSecond?: number
  brain?: Brain
  /** Products whose credit token the operator mints at start (default: gpu-h100 only). */
  products?: string[]
}

export interface DemoAgent {
  agent: Agent
  participant: PoolParticipant
  procurement: Procurement
  market: Market
  wallet: Wallet
}

export interface MockStack {
  chain: MockChain
  height: ManualHeight
  overlayUrl: string
  coopUrl: string
  apiUrl: string
  dataDir: string
  products: Product[]
  /** gpu-h100's credit token. */
  tokenId: string
  /** Every minted product's credit token. */
  tokenIds: Record<string, string>
  operator: CliContext
  lineage: LineageOptions
  overlayClient: () => OverlayClient
  openPool: (args: Omit<OpenPoolArgs, 'product'> & { product?: string }) => Promise<PoolRecord>
  agent: (profile: string) => Promise<DemoAgent>
  /** Mine `n` blocks and tell the coordinator the new height. */
  advanceBlocks: (n: number) => Promise<void>
  close: () => Promise<void>
}

const randomPort = (): number => 20000 + Math.floor(Math.random() * 20000)

function tempProducts (minutesPerSecond: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-demo-products-'))
  cpSync(PRODUCTS_DIR, dir, { recursive: true })
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const p = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    if (p.simulate.minutesPerSecond !== undefined) p.simulate.minutesPerSecond = minutesPerSecond
    writeFileSync(join(dir, f), JSON.stringify(p, null, 2))
  }
  return dir
}

export async function startMockStack (opts: StackOptions = {}): Promise<MockStack> {
  const say = (line: string): void => { if (opts.quiet !== true) console.log(line) }
  const dataDir = opts.dataDir ?? mkdtempSync(join(tmpdir(), 'agentcoop-demo-'))
  mkdirSync(dataDir, { recursive: true })
  const work = mkdtempSync(join(tmpdir(), 'agentcoop-stack-'))
  const chain = await createMockChain()
  const fetchTx = async (txid: string): Promise<Transaction> =>
    Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))
  const lineage: LineageOptions = { fetchTx }

  const overlay: RunningOverlay = await startOverlay({ port: randomPort(), dbFile: join(work, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
  const overlayClient = (): OverlayClient => new OverlayClient(overlay.url, memoryOutbox(), 'main', undefined, COOP_TOPIC, COOP_SERVICE)

  const height = new ManualHeight(await chain.services.getHeight())
  const coop: RunningCoordinator = await startCoordinator(
    { port: randomPort(), overlayUrl: overlay.url, arcadeUrl: 'http://unused.invalid', dbFile: join(work, 'coordinator.db'), pollMs: 400, roundTimeoutMs: 20_000, maxRounds: 3, spentCheck: 'none', network: 'main' },
    {
      height,
      protocol: coreProtocol({
        arcadeUrl: 'http://unused.invalid',
        policy: async () => ({ height: height.value!, satsPerKb: 100 }),
        broadcast: async tx => { await broadcastMock(chain.services, tx); return tx.id('hex') }
      }),
      spent: noSpentChecker,
      log: (event, f) => {
        if (['round_start', 'settled', 'round_failed', 'pool_failed', 'gave_up'].includes(event)) say(`\x1b[90mcoordinator ${event} ${JSON.stringify(f)}\x1b[0m`)
      }
    }
  )

  // Provider: the operator mints with provider-cli; provider-api serves the jobs.
  const [operatorWallet, providerWallet] = await Promise.all([chain.makeWallet(), chain.makeWallet()])
  await chain.fund(operatorWallet)
  await chain.fund(providerWallet)
  const productsDir = tempProducts(opts.minutesPerSecond ?? 3000)
  const operator: CliContext = {
    wallet: operatorWallet,
    overlay: overlayClient(),
    coopApiUrl: coop.url,
    providerApiUrl: 'http://provider.local',
    productsDir,
    pools: new PoolRegistry(),
    out: line => { say(`\x1b[32mprovider \x1b[0m ${line}`) }
  }
  const symbols: Record<string, string> = { 'gpu-h100': 'H100HR', 'data-proxy': 'PROXYGB' }
  const tokenIds: Record<string, string> = {}
  for (const id of opts.products ?? ['gpu-h100']) {
    tokenIds[id] = (await mint(operator, { sym: symbols[id] ?? id.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 16), amt: 100_000n, dec: 0, product: id })).tokenId
  }
  const tokenId = tokenIds['gpu-h100']
  const products = loadProducts(productsDir)
  const runner = new JobRunner({ products })
  const app = createProviderApp({ wallet: providerWallet, products, runner, ledger: new CreditLedger(), overlay: overlayClient(), fetchTx, coopApiUrl: coop.url })
  const api: Server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)) })
  const apiUrl = `http://localhost:${(api.address() as AddressInfo).port}`

  const agents: DemoAgent[] = []

  return {
    chain,
    height,
    overlayUrl: overlay.url,
    coopUrl: coop.url,
    apiUrl,
    dataDir,
    products,
    tokenId,
    tokenIds,
    operator,
    lineage,
    overlayClient,
    openPool: async args => await openPool(operator, { ...args, product: args.product ?? 'gpu-h100' }),
    agent: async name => {
      const wallet = await chain.makeWallet()
      await chain.fund(wallet)
      const profile = loadProfile(name)
      const log = new AgentLog(profile.name, dataDir, opts.quiet)
      const client = overlayClient()
      const agent = new Agent({ wallet, profile, providerUrl: apiUrl, overlay: client, log, stateDir: dataDir })
      const participant = new PoolParticipant({ wallet, kit: agent.tokens!, coopApiUrl: coop.url, log, lineage, reconnect: false })
      await participant.connect()
      const market = new Market(agent, { coopApiUrl: coop.url, lineage })
      const procurement = new Procurement({ agent, brain: opts.brain ?? rulesBrain, participant, market, coopApiUrl: coop.url })
      const a = { agent, participant, procurement, market, wallet }
      agents.push(a)
      return a
    },
    advanceBlocks: async n => {
      for (let i = 0; i < n; i++) await chain.mineBlock()
      height.value = await chain.services.getHeight()
    },
    close: async () => {
      for (const a of agents) a.participant.close()
      runner.stop()
      await new Promise(resolve => api.close(() => resolve(undefined)))
      await coop.close()
      await overlay.close()
      await chain.close()
    }
  }
}
