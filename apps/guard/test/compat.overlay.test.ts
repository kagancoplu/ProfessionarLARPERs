/**
 * Track B's overlay recognizes D's vaults: `packages/overlay/src/vault.ts`
 * derives the same script from the same record and the overlay's record
 * validation accepts D's record unchanged.
 */
import { describe, expect, it } from 'vitest'
import { PrivateKey } from '@agentcoop/core/sdk'
import { parseOpReturn } from '@agentcoop/core'
import { newVaultId, vaultRecordScript, vaultScriptForRecord, type VaultRecord } from '@agentcoop/core/scripts/vault'
import { expectedVaultScript, isVaultScriptHex } from '../../../packages/overlay/src/vault'
import { validateVaultRecord } from '../../../packages/overlay/src/records'

describe("Track B's overlay and D's vault agree", () => {
  const id = (): string => PrivateKey.fromRandom().toPublicKey().toString()
  const record: VaultRecord = { v: '1', vaultId: newVaultId(), owner: id(), agent: id(), guard: id() }

  it('same script from the same record, same template, same record validation', () => {
    expect(expectedVaultScript(record.owner, record.agent, record.guard, record.vaultId).toHex()).toBe(vaultScriptForRecord(record).toHex())
    expect(isVaultScriptHex(vaultScriptForRecord(record).toHex())).toBe(true)
    const parsed = parseOpReturn(vaultRecordScript(record))
    expect(parsed?.op).toBe('vault')
    expect(validateVaultRecord(parsed!.json)).toEqual(record)
  })
})
