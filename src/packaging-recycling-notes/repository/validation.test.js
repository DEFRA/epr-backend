import { describe, it, expect } from 'vitest'
import { validatePrnInsert } from './validation.js'
import { buildPrn as buildValidPrnInsert } from './contract/test-data.js'

describe('validatePrnInsert', () => {
  it('returns validated value for valid data', () => {
    const data = buildValidPrnInsert()
    const result = validatePrnInsert(data)
    expect(result.schemaVersion).toBe(2)
    expect(result.organisation.id).toBe(data.organisation.id)
  })

  it('strips unknown fields', () => {
    const data = buildValidPrnInsert({ bogus: 'field' })
    const result = validatePrnInsert(data)
    expect(result.bogus).toBeUndefined()
  })

  it('throws Boom.badData for invalid data', () => {
    const data = buildValidPrnInsert()
    delete data.organisation

    expect(() => validatePrnInsert(data)).toThrow()

    try {
      validatePrnInsert(data)
    } catch (error) {
      expect(error.isBoom).toBe(true)
      expect(error.output.statusCode).toBe(422)
      expect(error.message).toContain('Invalid PRN data')
    }
  })

  it('reports all validation errors, not just the first', () => {
    const data = buildValidPrnInsert()
    delete data.organisation
    delete data.accreditation
    delete data.tonnage

    try {
      validatePrnInsert(data)
    } catch (error) {
      expect(error.message).toContain('organisation')
      expect(error.message).toContain('accreditation')
      expect(error.message).toContain('tonnage')
    }
  })
})
