import { describe, it, expect } from 'vitest'
import { validatePrnInsert } from './validation.js'

const buildValidPrnInsert = (overrides = {}) => ({
  schemaVersion: 2,
  organisation: {
    id: 'org-123',
    name: 'Test Organisation',
    tradingName: 'Test Trading'
  },
  registrationId: 'reg-456',
  accreditation: {
    id: 'acc-789',
    accreditationNumber: 'ACC-2026-001',
    accreditationYear: 2026,
    material: 'plastic',
    submittedToRegulator: 'ea'
  },
  issuedToOrganisation: {
    id: 'recipient-123',
    name: 'Recipient Org',
    tradingName: 'Recipient Trading'
  },
  tonnage: 100,
  isExport: false,
  isDecemberWaste: false,
  issuedAt: null,
  issuedBy: null,
  status: {
    currentStatus: 'draft',
    history: [
      {
        status: 'draft',
        updatedAt: new Date(),
        updatedBy: { id: 'user-1', name: 'Test User' }
      }
    ]
  },
  createdAt: new Date(),
  createdBy: { id: 'user-1', name: 'Test User' },
  updatedAt: new Date(),
  updatedBy: { id: 'user-1', name: 'Test User' },
  ...overrides
})

describe('validatePrnInsert', () => {
  it('returns validated value for valid data', () => {
    const data = buildValidPrnInsert()
    const result = validatePrnInsert(data)
    expect(result.schemaVersion).toBe(2)
    expect(result.organisation.id).toBe('org-123')
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
