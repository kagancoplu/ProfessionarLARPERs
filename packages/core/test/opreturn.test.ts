import { describe, expect, it } from 'vitest'
import { OP, Script, Utils } from '../src/sdk'
import { buildOpReturn, parseOpReturn } from '../src/scripts/opreturn'
import { COOP_OPS } from '../src/types'

describe('agentcoop OP_RETURN envelope', () => {
  it('round-trips every op', () => {
    for (const op of COOP_OPS) {
      const json = { v: '1', poolId: 'ab'.repeat(32) + '_0', credits: '600', nested: { a: '1' }, list: ['x', 'y'] }
      const script = buildOpReturn(op, json)
      expect(script.toHex().startsWith('006a')).toBe(true) // OP_FALSE OP_RETURN
      expect(parseOpReturn(script)).toEqual({ op, json })
      expect(parseOpReturn(script.toHex())).toEqual({ op, json })
    }
  })

  it('leaves optional (undefined) fields out', () => {
    const parsed = parseOpReturn(buildOpReturn('pool', { v: '1', backstopMax: undefined }))
    expect(parsed?.json).toEqual({ v: '1' })
  })

  it('refuses non-string values, nested ones included', () => {
    expect(() => buildOpReturn('pledge', { credits: 600 })).toThrow(/BAD_OP_RETURN/)
    expect(() => buildOpReturn('pledge', { ok: true })).toThrow(/BAD_OP_RETURN/)
    expect(() => buildOpReturn('pledge', { a: { b: 1 } })).toThrow(/BAD_OP_RETURN/)
    expect(() => buildOpReturn('pledge', { a: ['1', 2] })).toThrow(/BAD_OP_RETURN/)
    expect(() => buildOpReturn('pledge', { a: null })).toThrow(/BAD_OP_RETURN/)
    expect(() => buildOpReturn('nope' as any, {})).toThrow(/unknown op/)
  })

  it('ignores anything that is not an agentcoop envelope', () => {
    const raw = (...fields: string[]): Script => {
      const s = new Script().writeOpCode(OP.OP_FALSE).writeOpCode(OP.OP_RETURN)
      for (const f of fields) s.writeBin(Utils.toArray(f, 'utf8'))
      return s
    }
    expect(parseOpReturn(raw('Hello BSV Blockchain'))).toBeNull()
    expect(parseOpReturn(raw('othertag', 'pool', '{"v":"1"}'))).toBeNull()
    expect(parseOpReturn(raw('agentcoop', 'mint', '{"v":"1"}'))).toBeNull()
    expect(parseOpReturn(raw('agentcoop', 'pool', '{not json'))).toBeNull()
    expect(parseOpReturn(raw('agentcoop', 'pool', '[]'))).toBeNull()
    expect(parseOpReturn(raw('agentcoop', 'pool', '{"credits":600}'))).toBeNull()
    expect(parseOpReturn(raw('agentcoop', 'pool', '{"v":"1"}', 'extra'))).toBeNull()
    expect(parseOpReturn('76a914' + '00'.repeat(20) + '88ac')).toBeNull() // P2PKH
    expect(parseOpReturn('zz')).toBeNull()
  })
})
