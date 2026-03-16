import { ObjectId } from 'mongodb'
import { describe, expect, it } from 'vitest'
import {
  validateOverseasSiteId,
  validateOverseasSiteInsert,
  validateOverseasSiteRead
} from './validation.js'

describe('validateOverseasSiteId', () => {
  it('returns the id for a valid 24-char hex string', () => {
    const id = new ObjectId().toHexString()
    expect(validateOverseasSiteId(id)).toBe(id)
  })

  it('throws badData for a non-hex string', () => {
    expect(() => validateOverseasSiteId('not-a-valid-id')).toThrow(
      'Invalid overseas site ID'
    )
  })

  it('throws badData for an empty string', () => {
    expect(() => validateOverseasSiteId('')).toThrow('Invalid overseas site ID')
  })
})

describe('validateOverseasSiteInsert', () => {
  it('throws badData for invalid input', () => {
    expect(() => validateOverseasSiteInsert({})).toThrow(
      'Invalid overseas site data'
    )
  })

  it('returns validated data for valid input', () => {
    const result = validateOverseasSiteInsert({
      name: 'Test Site',
      address: { line1: '1 Street', townOrCity: 'Town' },
      country: 'India',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    expect(result.name).toBe('Test Site')
  })
})

describe('validateOverseasSiteRead', () => {
  it('throws badImplementation for invalid document', () => {
    expect(() => validateOverseasSiteRead({ id: 'bad-doc' })).toThrow(
      'Invalid overseas site document bad-doc'
    )
  })

  it('returns validated data for valid document', () => {
    const result = validateOverseasSiteRead({
      id: 'abc123',
      name: 'Test Site',
      address: { line1: '1 Street', townOrCity: 'Town' },
      country: 'India',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    expect(result.id).toBe('abc123')
  })
})
