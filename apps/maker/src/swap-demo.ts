/**
 * Live Coop Rail swap: USDC on Base Sepolia → BSV mainnet, straight into an agent's
 * Mandate Vault (task a.5; docs/RAIL-POC.md "Ready but not run"). Dry run unless --yes.
 *
 *   npm run swap-demo -w @agentcoop/maker -- --vault <vaultId>                  # checks everything, moves nothing
 *   npm run swap-demo -w @agentcoop/maker -- --vault <vaultId> --amount 0.5 --yes
 *
 * Options: --amount <USDC> (default 0.5, at most 1), --agent <server wallet> (default agent-1),
 * --maker <server wallet> (default maker).
 *
 * Needs (.env, never printed): WALLET_MAKER_KEY and the agent's WALLET_*_KEY (funded: the maker
 * pays the HTLC, the agent its claim fee), BASE_PRIVATE_KEY (maker, Base Sepolia ETH for gas),
 * BASE_AGENT_PRIVATE_KEY (agent, ETH + test USDC), BASE_HTLC_ADDRESS and BASE_USDC_ADDRESS
 * (`npm run deploy -w @agentcoop/maker`), RAIL_SATS_PER_USDC, GUARD_URL (a guard on which the
 * owner registered the vault for this agent, with a policy), ARCADE_URL optional.
 *
 * Every step is printed with its link as it happens. The completed refund (step 3) is written
 * to data/rail/<swapId>.json BEFORE the funding is sent: if the run stops before the claim, the
 * maker's watchdog (`npm run watchdog -w @agentcoop/maker`, also inside `npm run maker`) broadcasts
 * that file's `refundEF` once the tip is past `refundLockTime`; the agent calls `refund(id)` on Base
 * after the Base timeout.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AuthFetch } from '@agentcoop/core/sdk'
import { fetchChainPolicy } from '@agentcoop/core'
import { httpCosigner } from '@agentcoop/core/signers/VaultSigner'
import { createPublicClient, formatEther, formatUnits, getAddress, http, parseUnits, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { arcadeUrl, chain, DATA_DIR, hasKey, keyVar, wocTxUrl } from '../../../scripts/lib/env' // also loads .env
import { flag, option, run, short } from '../../../scripts/lib/cli'
import { poolBalance } from '../../../scripts/lib/funding'
import { openWallet } from '../../../scripts/wallets'
import { USDC_ABI } from './base'
import { ViemEvm } from './evm'
import { quote } from './rail'
import { MAX_SWAP_SATS, MAX_SWAP_USDC, runSwap, type SwapStep } from './swap'

const baseTx = (h: string): string => `https://sepolia.basescan.org/tx/${h}`
const isKey = (k: string | undefined): k is Hex => k !== undefined && /^0x[0-9a-fA-F]{64}$/.test(k)
const isAddr = (a: string | undefined): a is Address => a !== undefined && /^0x[0-9a-fA-F]{40}$/.test(a)

async function main (): Promise<void> {
  const args = process.argv.slice(2)
  const yes = flag(args, '--yes')
  const vaultId = option(args, '--vault')
  const agentName = option(args, '--agent') ?? 'agent-1'
  const makerName = option(args, '--maker') ?? 'maker'
  const amount = parseUnits(option(args, '--amount') ?? '0.5', 6)
  const rpc = process.env.BASE_RPC_URL || 'https://sepolia.base.org'
  const guardUrl = process.env.GUARD_URL ?? 'http://localhost:8091'
  const satsPerUsdc = Number(process.env.RAIL_SATS_PER_USDC ?? '')

  const problems: string[] = []
  const need = (ok: boolean, what: string): void => { if (!ok) problems.push(what) }
  need(vaultId !== undefined, '--vault <vaultId> (the agent\'s vault, registered on the guard)')
  need(amount > 0n && amount <= MAX_SWAP_USDC, `--amount between 0.000001 and ${formatUnits(MAX_SWAP_USDC, 6)} USDC (PoC cap)`)
  need(Number.isFinite(satsPerUsdc) && satsPerUsdc > 0, 'RAIL_SATS_PER_USDC in .env (sats per whole USDC)')
  need(hasKey(makerName), `${keyVar(makerName)} in .env`)
  need(hasKey(agentName), `${keyVar(agentName)} in .env`)
  need(isKey(process.env.BASE_PRIVATE_KEY), 'BASE_PRIVATE_KEY (maker EVM key) in .env')
  need(isKey(process.env.BASE_AGENT_PRIVATE_KEY), 'BASE_AGENT_PRIVATE_KEY (agent EVM key) in .env')
  need(isAddr(process.env.BASE_HTLC_ADDRESS), 'BASE_HTLC_ADDRESS in .env (npm run deploy -w @agentcoop/maker)')
  need(isAddr(process.env.BASE_USDC_ADDRESS), 'BASE_USDC_ADDRESS in .env (Circle test USDC or the deployed MockUSDC)')
  if (problems.length > 0) throw new Error(`missing:\n  - ${problems.join('\n  - ')}`)

  const q = quote(amount, satsPerUsdc)
  if (q.sats < 1 || q.sats > MAX_SWAP_SATS) throw new Error(`the quote is ${q.sats} sat; the PoC cap is 1..${MAX_SWAP_SATS} (lower --amount)`)
  const makerKey = process.env.BASE_PRIVATE_KEY as Hex
  const agentKey = process.env.BASE_AGENT_PRIVATE_KEY as Hex
  const makerEvm = privateKeyToAccount(makerKey).address
  const agentEvm = privateKeyToAccount(agentKey).address
  const htlc = getAddress(process.env.BASE_HTLC_ADDRESS!)
  const usdc = getAddress(process.env.BASE_USDC_ADDRESS!)
  const arcade = arcadeUrl()

  const maker = await openWallet(makerName)
  const agent = await openWallet(agentName)
  try {
    // --- checks (read only) ---
    const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) })
    const [makerEth, agentEth, agentUsdc] = await Promise.all([
      client.getBalance({ address: makerEvm }),
      client.getBalance({ address: agentEvm }),
      client.readContract({ address: usdc, abi: USDC_ABI, functionName: 'balanceOf', args: [agentEvm] }) as Promise<bigint>
    ])
    const [makerSats, agentSats, { height }] = await Promise.all([poolBalance(maker.wallet), poolBalance(agent.wallet), fetchChainPolicy(arcade)])
    const health = await (await fetch(`${guardUrl}/healthz`)).json() as { ok?: boolean, identityKey?: string, network?: string }
    const vres = await new AuthFetch(agent.wallet).fetch(`${guardUrl}/vaults/${encodeURIComponent(vaultId!)}`, { method: 'GET' })
    const v = await vres.json() as { record?: { agent: string, guard: string }, lockingScriptHex?: string, reason?: string }

    console.log(`Coop Rail swap · Base Sepolia (${rpc}) → BSV ${chain()} (Arcade ${arcade}, height ${height})`)
    console.log(`quote: ${formatUnits(amount, 6)} USDC → ${q.sats} sat at ${satsPerUsdc} sat/USDC − ${q.spreadBps / 100} %`)
    console.log(`maker  EVM ${makerEvm} · ${formatEther(makerEth)} ETH · BSV ${makerName} ${short(maker.identityKey)} · ${makerSats.spendableSatoshis} sat`)
    console.log(`agent  EVM ${agentEvm} · ${formatEther(agentEth)} ETH · ${formatUnits(agentUsdc, 6)} USDC · BSV ${agentName} ${short(agent.identityKey)} · ${agentSats.spendableSatoshis} sat`)
    console.log(`guard  ${guardUrl} · ${health.identityKey !== undefined ? short(health.identityKey) : '?'} · vault ${vaultId} → ${vres.ok ? 'registered' : `${vres.status} ${v.reason ?? ''}`}`)

    need(makerEth > 0n, 'maker EVM address needs Base Sepolia ETH (gas for the claim)')
    need(agentEth > 0n, 'agent EVM address needs Base Sepolia ETH (gas for approve + lock)')
    need(agentUsdc >= amount, `agent EVM address needs ≥ ${formatUnits(amount, 6)} USDC`)
    need(makerSats.spendableSatoshis >= q.sats + 200, `${makerName} needs ≥ ${q.sats + 200} sat (HTLC + fee)`)
    need(agentSats.spendableSatoshis >= 200, `${agentName} needs ≥ 200 sat (claim fee)`)
    need(health.ok === true && health.identityKey !== undefined, `guard at ${guardUrl} is not answering /healthz`)
    need(vres.ok && v.lockingScriptHex !== undefined, `vault ${vaultId} is not readable on the guard for ${agentName} (owner: create-vault + policy)`)
    need(v.record?.agent === agent.identityKey, `vault ${vaultId} belongs to another agent`)
    need(v.record?.guard === health.identityKey, `vault ${vaultId} names another guard`)
    if (problems.length > 0) throw new Error(`not ready:\n  - ${problems.join('\n  - ')}`)

    if (!yes) {
      console.log(`\n✓ ready. Dry run: nothing was sent. Add --yes to lock ${formatUnits(amount, 6)} USDC on Base Sepolia and move ${q.sats} sat on BSV ${chain()}.`)
      return
    }

    // --- the swap ---
    const evm = new ViemEvm(rpc, [makerKey, agentKey])
    const outDir = join(DATA_DIR, 'rail')
    mkdirSync(outDir, { recursive: true })
    let file = ''
    const record: Record<string, unknown> = { started: new Date().toISOString(), vaultId, amountUsdc: formatUnits(amount, 6), network: chain() }
    const save = (): void => { if (file !== '') writeFileSync(file, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 }) }
    const onStep = (s: SwapStep): void => {
      switch (s.step) {
        case 'quote': file = join(outDir, `${s.swapId}.json`); record.swapId = s.swapId; record.hash = s.hash; record.sats = s.quote.sats; console.log(`· swap ${s.swapId} · hash ${s.hash.slice(0, 16)}…`); break
        case 'base_locked': record.baseLock = { id: s.id, tx: s.txHash, timeout: s.timeout }; console.log(`✓ 1 Base lock ${baseTx(s.txHash)} (refundable by the agent after ${s.timeout})`); break
        case 'funding_signed': record.fundingTxid = s.txid; record.fundingVout = s.vout; console.log(`· 2 BSV funding signed, not sent: ${s.txid} (v1, ${s.satoshis} sat)`); break
        case 'refund_ready': record.refundHex = s.rawHex; record.refundEF = s.efHex; record.refundTxid = s.txid; record.refundLockTime = s.lockTime; console.log(`✓ 3 refund pre-signed (nLockTime ${s.lockTime}), saved to ${file}`); break
        case 'funding_sent': record.fundingSent = true; console.log(`✓ 4 BSV funding ${wocTxUrl(s.txid)}`); break
        case 'claimed': record.claimTxid = s.txid; console.log(`✓ 5 claim into the vault ${wocTxUrl(s.txid)} (${s.satoshis} sat; guard kind:'rail')`); break
        case 'base_claimed': record.baseClaimTx = s.txHash; console.log(`✓ 6 maker claimed the USDC ${baseTx(s.txHash)}`); break
      }
      save() // the refund is on disk before step 4 sends the funding
    }
    const r = await runSwap({
      evm, htlc, usdc, agentEvm, makerEvm,
      agent: agent.wallet, maker: maker.wallet,
      agentIdentity: agent.identityKey, makerIdentity: maker.identityKey, guardIdentity: health.identityKey!,
      cosign: httpCosigner(guardUrl),
      vault: { vaultId: vaultId!, lockingScriptHex: v.lockingScriptHex! },
      height: async () => (await fetchChainPolicy(arcade)).height
    }, { amount, satsPerUsdc, onStep })
    record.done = new Date().toISOString()
    save()
    const t = new Date().toISOString().slice(0, 16)
    console.log('\nSTATUS "Mainnet işlemleri":')
    console.log(`| ${t} | T11 Coop Rail funding (BSV) | ${r.fundingTxid} | D | swap ${r.swapId}, ${r.sats} sat, v1 |`)
    console.log(`| ${t} | T11 Coop Rail claim into the vault (BSV) | ${r.claimTxid} | D | agent + guard; reveals the secret |`)
    console.log(`| ${t} | T11b Coop Rail lock (Base Sepolia) | ${r.baseLockTx} | D | ${formatUnits(amount, 6)} USDC |`)
    console.log(`| ${t} | T11b Coop Rail claim (Base Sepolia) | ${r.baseClaimTx} | D | maker, with the secret from the BSV claim |`)
  } finally {
    await agent.close()
    await maker.close()
  }
}

run(main)
