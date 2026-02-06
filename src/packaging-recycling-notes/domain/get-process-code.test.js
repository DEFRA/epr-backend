import { describe, it, expect } from 'vitest'
import { getProcessCode } from './get-process-code.js'

describe('getProcessCode', () => {
  describe('returns correct process codes for materials', () => {
    it.each([
      ['aluminium', 'R4'],
      ['fibre', 'R3'],
      ['glass', 'R5'],
      ['paper', 'R3'],
      ['plastic', 'R3'],
      ['steel', 'R4'],
      ['wood', 'R3']
    ])('%s maps to %s', (material, expected) => {
      expect(getProcessCode(material)).toBe(expected)
    })
  })

  describe('handles case insensitivity', () => {
    it.each([
      ['PAPER', 'R3'],
      ['Paper', 'R3'],
      ['GLASS', 'R5'],
      ['Glass', 'R5'],
      ['ALUMINIUM', 'R4'],
      ['Aluminium', 'R4']
    ])('returns correct code for %s', (material, expected) => {
      expect(getProcessCode(material)).toBe(expected)
    })
  })

  describe('handles invalid inputs', () => {
    it('returns null for unknown material', () => {
      expect(getProcessCode('unknown')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(getProcessCode('')).toBeNull()
    })

    it('returns null for null', () => {
      expect(getProcessCode(null)).toBeNull()
    })

    it('returns null for undefined', () => {
      expect(getProcessCode(undefined)).toBeNull()
    })
  })
})
