import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { Transaction } from '../src/sdk'
import { Transaction as AliasedTransaction } from '@bsv/sdk'

describe('one @bsv/sdk build (MASTER-PLAN §3.1)', () => {
  it('core/sdk, the vitest alias and the CJS build wallet-toolbox loads are the same classes', () => {
    const require = createRequire(import.meta.url)
    const cjs = require('@bsv/sdk') as { Transaction: unknown }
    require('@bsv/wallet-toolbox')
    expect(Transaction).toBe(AliasedTransaction)
    expect(Transaction).toBe(cjs.Transaction)
  })
})
