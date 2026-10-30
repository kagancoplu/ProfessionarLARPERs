/**
 * Compile contracts/base-htlc/*.sol with solc-js → contracts/base-htlc/artifacts.json
 * (abi + creation bytecode). `npm run compile -w @agentcoop/maker`. The EVM test
 * recompiles and compares, so the committed artifact cannot drift from the source.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CONTRACTS_DIR = fileURLToPath(new URL('../../../contracts/base-htlc/', import.meta.url))
export const ARTIFACTS_FILE = join(CONTRACTS_DIR, 'artifacts.json')
const SOURCES = ['HTLC.sol', 'MockUSDC.sol']
/** Base runs Cancun-era opcodes; the in-memory EVM in tests uses the same hardfork. */
export const EVM_VERSION = 'cancun'

export interface Artifact { abi: unknown[], bytecode: `0x${string}` }
export interface Artifacts { compiler: string, evmVersion: string, contracts: Record<'AgentCoopHTLC' | 'MockUSDC', Artifact> }

export function compile (): Artifacts {
  const solc = createRequire(import.meta.url)('solc') as { compile: (input: string) => string, version: () => string }
  const input = {
    language: 'Solidity',
    sources: Object.fromEntries(SOURCES.map(f => [f, { content: readFileSync(join(CONTRACTS_DIR, f), 'utf8') }])),
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: EVM_VERSION,
      metadata: { bytecodeHash: 'none' },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
    }
  }
  const out = JSON.parse(solc.compile(JSON.stringify(input))) as { errors?: Array<{ severity: string, formattedMessage: string }>, contracts: Record<string, Record<string, { abi: unknown[], evm: { bytecode: { object: string } } }>> }
  const errors = (out.errors ?? []).filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => e.formattedMessage).join('\n'))
  const pick = (file: string, name: string): Artifact => ({ abi: out.contracts[file][name].abi, bytecode: `0x${out.contracts[file][name].evm.bytecode.object}` })
  return { compiler: solc.version(), evmVersion: EVM_VERSION, contracts: { AgentCoopHTLC: pick('HTLC.sol', 'AgentCoopHTLC'), MockUSDC: pick('MockUSDC.sol', 'MockUSDC') } }
}

export const loadArtifacts = (): Artifacts => JSON.parse(readFileSync(ARTIFACTS_FILE, 'utf8')) as Artifacts

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = compile()
  writeFileSync(ARTIFACTS_FILE, `${JSON.stringify(a, null, 2)}\n`)
  console.log(`✓ ${ARTIFACTS_FILE} (${a.compiler}, ${a.evmVersion}; HTLC ${(a.contracts.AgentCoopHTLC.bytecode.length - 2) / 2} B)`)
}
