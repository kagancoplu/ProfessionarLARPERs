/**
 * Deploy the Coop Rail HTLC to Base Sepolia (D-P3 H3). Dry run unless --yes.
 *
 *   npm run deploy -w @agentcoop/maker              # shows deployer address, balance, what it would do
 *   npm run deploy -w @agentcoop/maker -- --yes     # deploys AgentCoopHTLC (+ MockUSDC if BASE_USDC_ADDRESS is empty)
 *
 * Keys from .env only (BASE_PRIVATE_KEY = maker/deployer, BASE_AGENT_PRIVATE_KEY = the agent's
 * EVM address that receives mock USDC); keys are never printed. Base Sepolia only (testnet).
 */
import { createPublicClient, formatEther, http, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import '../../../scripts/lib/env' // loads .env
import { deployHtlc, deployMockUsdc, USDC_ABI } from './base'
import { ViemEvm } from './evm'

async function main (): Promise<void> {
  const yes = process.argv.includes('--yes')
  const rpc = process.env.BASE_RPC_URL || 'https://sepolia.base.org'
  const key = process.env.BASE_PRIVATE_KEY as Hex | undefined
  if (key === undefined || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('BASE_PRIVATE_KEY (0x + 64 hex) is not set in .env')
  const agentKey = process.env.BASE_AGENT_PRIVATE_KEY as Hex | undefined
  const deployer = privateKeyToAccount(key).address
  const agent = agentKey !== undefined && /^0x[0-9a-fA-F]{64}$/.test(agentKey) ? privateKeyToAccount(agentKey).address : undefined
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) })
  const balance = await client.getBalance({ address: deployer })
  console.log(`Base Sepolia (${rpc}) · deployer ${deployer} · ${formatEther(balance)} ETH${agent !== undefined ? ` · agent ${agent}` : ''}`)
  const usdcSet = process.env.BASE_USDC_ADDRESS !== undefined && process.env.BASE_USDC_ADDRESS !== ''
  console.log(`plan: deploy AgentCoopHTLC${usdcSet ? '' : ' + MockUSDC (mint 2 mUSDC to the agent)'}`)
  if (!yes) { console.log('dry run: add --yes to deploy'); return }
  if (balance === 0n) throw new Error('the deployer has no Base Sepolia ETH (faucet: SETUP-ACCOUNTS #10)')

  const evm = new ViemEvm(rpc, [key])
  const htlc = await deployHtlc(evm, deployer)
  console.log(`✓ AgentCoopHTLC ${htlc} → https://sepolia.basescan.org/address/${htlc}`)
  let token = process.env.BASE_USDC_ADDRESS as Address | undefined
  if (!usdcSet) {
    token = await deployMockUsdc(evm, deployer)
    console.log(`✓ MockUSDC ${token} → https://sepolia.basescan.org/address/${token}`)
    if (agent !== undefined) {
      const { txHash } = await evm.write(deployer, token, USDC_ABI, 'mint', [agent, 2_000_000n])
      console.log(`✓ minted 2 mUSDC to the agent → https://sepolia.basescan.org/tx/${txHash}`)
    }
  }
  console.log(`\nadd to .env:\nBASE_HTLC_ADDRESS=${htlc}${usdcSet ? '' : `\nBASE_USDC_ADDRESS=${token}`}`)
  console.log(`STATUS: | ${new Date().toISOString().slice(0, 16)} | T11b HTLC deploy (Base Sepolia) | ${htlc} | D | |`)
}

main().catch(e => { console.error(`✗ ${(e as Error).message}`); process.exit(1) })
