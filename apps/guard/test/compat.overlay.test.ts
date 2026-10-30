/**
 * Track B's overlay recognizes D's vaults: its B.P3 stubs derive the same
 * script from the same record. Excluded from this package's typecheck
 * (tsconfig "exclude"): packages/overlay is an ESM/Bundler package and is
 * typechecked by its own tsconfig.
 */
import { describe, expect, it } from 'vitest'
import { PrivateKey } from '@bsv/sdk'
import { newVaultId, vaultRecordScript, vaultScriptForRecord, type VaultRecord } from '../../../packages/core/src/scripts/vault'
import { parseOpReturn } from '../../../packages/overlay/src/stub/opreturn'
import { expectedVaultScript, isVaultScriptHex } from '../../../packages/overlay/src/stub/vault'
import { validateVaultRecord } from '../../../packages/overlay/src/records'

describe("Track B's overlay and D's vault agree", () => {
  const id = (): string => PrivateKey.fromRandom().toPublicKey().toString()
  const record: VaultRecord = { v: '1', vaultId: newVaultId(), owner: id(), agent: id(), guard: id() }

  it('same script from the same record, same template, same record validation', () => {
    expect(expectedVaultScript(record.owner, record.agent, record.guard, record.vaultId).toHex()).toBe(vaultScriptForRecord(record).toHex())
    expect(isVaultScriptHex(vaultScriptForRecord(record).toHex())).toBe(true)
    const parsed = parseOpReturn(vaultRecordScript(record))
    expect(validateVaultRecord(parsed!.json)).toEqual(record)
  })
})
