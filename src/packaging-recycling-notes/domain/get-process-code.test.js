import { describe, it, expect } from 'vitest'
import { invalidArg } from '#test/type-helpers.js'
import { MATERIAL } from '#domain/materials.js'
import { getProcessCode } from './get-process-code.js'

describe('getProcessCode', () => {
  describe('returns correct process codes for materials', () => {
    it.each([
      [MATERIAL.ALUMINIUM, 'R4'],
      [MATERIAL.FIBRE, 'R3'],
      [MATERIAL.GLASS, 'R5'],
      [MATERIAL.PAPER, 'R3'],
      [MATERIAL.PLASTIC, 'R3'],
      [MATERIAL.STEEL, 'R4'],
      [MATERIAL.WOOD, 'R3']
    ])('%s maps to %s', (material, expected) => {
      expect(getProcessCode(material)).toBe(expected)
    })
  })

  describe('handles data that bypassed the repository', () => {
    it.each([
      ['unknown material', 'unknown'],
      ['empty string', ''],
      ['mixed case', 'Glass'],
      ['null', null],
      ['undefined', undefined]
    ])('returns null for %s', (_label, material) => {
      expect(getProcessCode(invalidArg(material))).toBeNull()
    })
  })
})
