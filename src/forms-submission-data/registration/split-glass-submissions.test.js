import { logger } from '#common/helpers/logging/logger.js'
import { describe, expect, it, vi } from 'vitest'
import { splitGlassSubmissions } from './split-glass-submissions.js'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL
} from '#domain/organisations/model.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn()
  }
}))

function makeRegistration(overrides = {}) {
  return {
    id: 'reg-1',
    material: MATERIAL.PLASTIC,
    glassRecyclingProcess: undefined,
    orgId: 123,
    systemReference: 'sys-ref-1',
    ...overrides
  }
}

function makeGlassRegistration(glassRecyclingProcess, overrides = {}) {
  return makeRegistration({
    material: MATERIAL.GLASS,
    glassRecyclingProcess,
    ...overrides
  })
}

describe('splitGlassSubmissions', () => {
  it('should return non-glass registrations unchanged', () => {
    const plastic = makeRegistration({ material: MATERIAL.PLASTIC })
    const steel = makeRegistration({ id: 'reg-2', material: MATERIAL.STEEL })

    const result = splitGlassSubmissions([plastic, steel])

    expect(result).toEqual([plastic, steel])
  })

  it('should return glass registration with single remelt process unchanged', () => {
    const remelt = makeGlassRegistration([
      GLASS_RECYCLING_PROCESS.GLASS_RE_MELT
    ])

    const result = splitGlassSubmissions([remelt])

    expect(result).toEqual([remelt])
  })

  it('should return glass registration with single other process unchanged', () => {
    const other = makeGlassRegistration([GLASS_RECYCLING_PROCESS.GLASS_OTHER])

    const result = splitGlassSubmissions([other])

    expect(result).toEqual([other])
  })

  it('should split glass registration with both processes into two registrations', () => {
    const both = makeGlassRegistration(
      [
        GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
        GLASS_RECYCLING_PROCESS.GLASS_OTHER
      ],
      { id: 'original-id', orgId: 999, systemReference: 'sys-ref-99' }
    )

    const result = splitGlassSubmissions([both])

    expect(result).toHaveLength(2)

    expect(result[0]).toEqual({
      ...both,
      glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT]
    })

    expect(result[1]).toEqual(
      expect.objectContaining({
        material: MATERIAL.GLASS,
        orgId: 999,
        systemReference: 'sys-ref-99',
        glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER]
      })
    )
  })

  it('should preserve the original id on the remelt registration', () => {
    const both = makeGlassRegistration(
      [
        GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
        GLASS_RECYCLING_PROCESS.GLASS_OTHER
      ],
      { id: 'original-id' }
    )

    const result = splitGlassSubmissions([both])

    expect(result[0].id).toBe('original-id')
  })

  it('should assign a new unique id to the other registration', () => {
    const both = makeGlassRegistration(
      [
        GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
        GLASS_RECYCLING_PROCESS.GLASS_OTHER
      ],
      { id: 'original-id' }
    )

    const result = splitGlassSubmissions([both])

    expect(result[1].id).not.toBe('original-id')
    expect(result[1].id).toBeTruthy()
  })

  it('should handle a mix of glass and non-glass registrations', () => {
    const plastic = makeRegistration({ id: 'plastic-1' })
    const glassBoth = makeGlassRegistration(
      [
        GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
        GLASS_RECYCLING_PROCESS.GLASS_OTHER
      ],
      { id: 'glass-both' }
    )
    const glassRemelt = makeGlassRegistration(
      [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT],
      { id: 'glass-remelt' }
    )

    const result = splitGlassSubmissions([plastic, glassBoth, glassRemelt])

    expect(result).toHaveLength(4)
    expect(result[0].id).toBe('plastic-1')
    expect(result[1].id).toBe('glass-both')
    expect(result[1].glassRecyclingProcess).toEqual([
      GLASS_RECYCLING_PROCESS.GLASS_RE_MELT
    ])
    expect(result[2].glassRecyclingProcess).toEqual([
      GLASS_RECYCLING_PROCESS.GLASS_OTHER
    ])
    expect(result[3].id).toBe('glass-remelt')
  })

  it('should log when registrations are split', () => {
    const both = makeGlassRegistration([
      GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
      GLASS_RECYCLING_PROCESS.GLASS_OTHER
    ])

    splitGlassSubmissions([both])

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Split 1 glass registration(s) with both processes into remelt + other'
    })
  })

  it('should not log when no registrations are split', () => {
    const remelt = makeGlassRegistration([
      GLASS_RECYCLING_PROCESS.GLASS_RE_MELT
    ])

    splitGlassSubmissions([remelt])

    expect(logger.info).not.toHaveBeenCalled()
  })

  it('should copy all properties to both split registrations', () => {
    const both = makeGlassRegistration(
      [
        GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
        GLASS_RECYCLING_PROCESS.GLASS_OTHER
      ],
      {
        id: 'original-id',
        orgId: 42,
        systemReference: 'sys-ref',
        orgName: 'Test Org',
        cbduNumber: 'CBDU123',
        suppliers: 'Some suppliers'
      }
    )

    const result = splitGlassSubmissions([both])

    for (const reg of result) {
      expect(reg.orgId).toBe(42)
      expect(reg.systemReference).toBe('sys-ref')
      expect(reg.orgName).toBe('Test Org')
      expect(reg.cbduNumber).toBe('CBDU123')
      expect(reg.suppliers).toBe('Some suppliers')
      expect(reg.material).toBe(MATERIAL.GLASS)
    }
  })
})
