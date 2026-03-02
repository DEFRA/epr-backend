import { describe, it, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { prnInsertSchema, prnReadSchema } from './schema.js'
import {
  buildPrn as buildValidPrnInsert,
  buildAwaitingAuthorisationPrn,
  buildAwaitingAcceptancePrn
} from './contract/test-data.js'

const buildReadDocument = (overrides = {}) => ({
  id: '507f1f77bcf86cd799439011',
  ...buildValidPrnInsert(),
  ...overrides
})

describe('PRN insert schema', () => {
  describe('valid documents', () => {
    it('accepts a valid v2 PRN document', () => {
      const data = buildValidPrnInsert()
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts without optional tradingName on organisation', () => {
      const data = buildValidPrnInsert({
        organisation: { id: 'org-1', name: 'Org' }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts without optional tradingName on issuedToOrganisation', () => {
      const data = buildValidPrnInsert({
        issuedToOrganisation: { id: 'recipient-1', name: 'Recipient' }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts optional registrationType on issuedToOrganisation', () => {
      const data = buildValidPrnInsert({
        issuedToOrganisation: {
          id: 'recipient-1',
          name: 'Recipient',
          registrationType: 'LARGE_PRODUCER'
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts optional registrationType on organisation', () => {
      const data = buildValidPrnInsert({
        organisation: {
          id: 'org-1',
          name: 'Org',
          registrationType: 'COMPLIANCE_SCHEME'
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts without optional notes', () => {
      const data = buildValidPrnInsert()
      delete data.notes
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts with notes provided', () => {
      const data = buildValidPrnInsert({ notes: 'Some issuer notes' })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('rejects null notes on insert', () => {
      const data = buildValidPrnInsert({ notes: null })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('accepts glassRecyclingProcess when material is glass', () => {
      const data = buildValidPrnInsert({
        accreditation: {
          id: 'acc-1',
          accreditationNumber: 'ACC-001',
          accreditationYear: 2026,
          material: 'glass',
          submittedToRegulator: 'ea',
          glassRecyclingProcess: 'glass_re_melt',
          siteAddress: { line1: '1 Test St', postcode: 'SW1A 1AA' }
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts siteAddress for reprocessors', () => {
      const data = buildValidPrnInsert({
        accreditation: {
          id: 'acc-1',
          accreditationNumber: 'ACC-001',
          accreditationYear: 2026,
          material: 'plastic',
          submittedToRegulator: 'ea',
          siteAddress: {
            line1: '123 Test Street',
            postcode: 'SW1A 1AA'
          }
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts siteAddress with all optional fields', () => {
      const data = buildValidPrnInsert({
        accreditation: {
          id: 'acc-1',
          accreditationNumber: 'ACC-001',
          accreditationYear: 2026,
          material: 'plastic',
          submittedToRegulator: 'ea',
          siteAddress: {
            line1: '123 Test Street',
            line2: 'Suite 4',
            town: 'London',
            county: 'Greater London',
            postcode: 'SW1A 1AA',
            country: 'England'
          }
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts null prnNumber', () => {
      const data = buildValidPrnInsert({ prnNumber: null })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts business operation slots on status', () => {
      const data = buildAwaitingAuthorisationPrn()
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
      expect(data.status.created).toBeDefined()
    })

    it('accepts status with issued operation', () => {
      const data = buildAwaitingAcceptancePrn()
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts null updatedBy', () => {
      const data = buildValidPrnInsert({ updatedBy: null })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })
  })

  describe('required fields', () => {
    it('rejects when schemaVersion is missing', () => {
      const data = buildValidPrnInsert()
      delete data.schemaVersion
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when organisation is missing', () => {
      const data = buildValidPrnInsert()
      delete data.organisation
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when organisation.id is missing', () => {
      const data = buildValidPrnInsert({
        organisation: { name: 'Org' }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when organisation.name is missing', () => {
      const data = buildValidPrnInsert({
        organisation: { id: 'org-1' }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when registrationId is missing', () => {
      const data = buildValidPrnInsert()
      delete data.registrationId
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when accreditation is missing', () => {
      const data = buildValidPrnInsert()
      delete data.accreditation
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when accreditation.id is missing', () => {
      const data = buildValidPrnInsert({
        accreditation: {
          accreditationNumber: 'ACC-001',
          accreditationYear: 2026,
          material: 'plastic',
          submittedToRegulator: 'ea'
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when accreditation.accreditationNumber is missing', () => {
      const data = buildValidPrnInsert({
        accreditation: {
          id: 'acc-1',
          accreditationYear: 2026,
          material: 'plastic',
          submittedToRegulator: 'ea'
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when accreditation.accreditationYear is missing', () => {
      const data = buildValidPrnInsert({
        accreditation: {
          id: 'acc-1',
          accreditationNumber: 'ACC-001',
          material: 'plastic',
          submittedToRegulator: 'ea'
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when accreditation.material is missing', () => {
      const data = buildValidPrnInsert({
        accreditation: {
          id: 'acc-1',
          accreditationNumber: 'ACC-001',
          accreditationYear: 2026,
          submittedToRegulator: 'ea'
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when accreditation.submittedToRegulator is missing', () => {
      const data = buildValidPrnInsert({
        accreditation: {
          id: 'acc-1',
          accreditationNumber: 'ACC-001',
          accreditationYear: 2026,
          material: 'plastic'
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when tonnage is missing', () => {
      const data = buildValidPrnInsert()
      delete data.tonnage
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when isExport is missing', () => {
      const data = buildValidPrnInsert()
      delete data.isExport
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when status is missing', () => {
      const data = buildValidPrnInsert()
      delete data.status
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })
  })

  describe('tonnage validation', () => {
    it('rejects zero tonnage', () => {
      const data = buildValidPrnInsert({ tonnage: 0 })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.message).toContain('positive')
    })

    it('rejects negative tonnage', () => {
      const data = buildValidPrnInsert({ tonnage: -5 })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
      expect(error.message).toContain('positive')
    })

    it('accepts positive tonnage', () => {
      const data = buildValidPrnInsert({ tonnage: 1 })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })
  })

  describe('material enum validation', () => {
    it('rejects invalid material value', () => {
      const data = buildValidPrnInsert({
        accreditation: {
          id: 'acc-1',
          accreditationNumber: 'ACC-001',
          accreditationYear: 2026,
          material: 'unobtainium',
          submittedToRegulator: 'ea'
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('accepts all valid material values', () => {
      const materials = [
        'aluminium',
        'fibre',
        'glass',
        'paper',
        'plastic',
        'steel',
        'wood'
      ]
      for (const material of materials) {
        const accreditation =
          material === 'glass'
            ? {
                id: 'acc-1',
                accreditationNumber: 'ACC-001',
                accreditationYear: 2026,
                material,
                submittedToRegulator: 'ea',
                glassRecyclingProcess: 'glass_re_melt',
                siteAddress: { line1: '1 Test St', postcode: 'SW1A 1AA' }
              }
            : {
                id: 'acc-1',
                accreditationNumber: 'ACC-001',
                accreditationYear: 2026,
                material,
                submittedToRegulator: 'ea',
                siteAddress: { line1: '1 Test St', postcode: 'SW1A 1AA' }
              }
        const { error } = prnInsertSchema.validate(
          buildValidPrnInsert({ accreditation })
        )
        expect(error).toBeUndefined()
      }
    })
  })

  describe('glassRecyclingProcess enum validation', () => {
    it('rejects invalid glassRecyclingProcess value', () => {
      const data = buildValidPrnInsert({
        accreditation: {
          id: 'acc-1',
          accreditationNumber: 'ACC-001',
          accreditationYear: 2026,
          material: 'glass',
          submittedToRegulator: 'ea',
          glassRecyclingProcess: 'glass_magic'
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('accepts glass_other', () => {
      const data = buildValidPrnInsert({
        accreditation: {
          id: 'acc-1',
          accreditationNumber: 'ACC-001',
          accreditationYear: 2026,
          material: 'glass',
          submittedToRegulator: 'ea',
          glassRecyclingProcess: 'glass_other',
          siteAddress: { line1: '1 Test St', postcode: 'SW1A 1AA' }
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })
  })

  describe('conditional fields', () => {
    it('rejects glass material without glassRecyclingProcess', () => {
      const data = buildValidPrnInsert({
        accreditation: {
          id: 'acc-1',
          accreditationNumber: 'ACC-001',
          accreditationYear: 2026,
          material: 'glass',
          submittedToRegulator: 'ea'
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects glassRecyclingProcess on non-glass materials', () => {
      const data = buildValidPrnInsert({
        accreditation: {
          id: 'acc-1',
          accreditationNumber: 'ACC-001',
          accreditationYear: 2026,
          material: 'plastic',
          submittedToRegulator: 'ea',
          glassRecyclingProcess: 'glass_re_melt',
          siteAddress: { line1: '1 Test St', postcode: 'SW1A 1AA' }
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('requires siteAddress for reprocessors', () => {
      const data = buildValidPrnInsert({
        isExport: false,
        accreditation: {
          id: 'acc-1',
          accreditationNumber: 'ACC-001',
          accreditationYear: 2026,
          material: 'plastic',
          submittedToRegulator: 'ea'
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('accepts missing siteAddress for exporters', () => {
      const data = buildValidPrnInsert({
        isExport: true,
        accreditation: {
          id: 'acc-1',
          accreditationNumber: 'ACC-001',
          accreditationYear: 2026,
          material: 'plastic',
          submittedToRegulator: 'ea'
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts siteAddress for exporters when provided', () => {
      const data = buildValidPrnInsert({
        isExport: true,
        accreditation: {
          id: 'acc-1',
          accreditationNumber: 'ACC-001',
          accreditationYear: 2026,
          material: 'plastic',
          submittedToRegulator: 'ea',
          siteAddress: { line1: '1 Test St', postcode: 'SW1A 1AA' }
        }
      })
      const { error } = prnInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })
  })

  describe('strips unknown fields', () => {
    it('strips unknown top-level fields', () => {
      const data = buildValidPrnInsert({ bogus: 'field' })
      const { error, value } = prnInsertSchema.validate(data, {
        stripUnknown: true
      })
      expect(error).toBeUndefined()
      expect(value.bogus).toBeUndefined()
    })
  })
})

describe('PRN read schema', () => {
  it('accepts a valid read document with id', () => {
    const data = buildReadDocument()
    const { error } = prnReadSchema.validate(data)
    expect(error).toBeUndefined()
  })

  it('rejects when id is missing', () => {
    const data = buildReadDocument()
    delete data.id
    const { error } = prnReadSchema.validate(data)
    expect(error).toBeDefined()
  })

  it('strips MongoDB _id when stripUnknown is enabled', () => {
    const objectId = new ObjectId()
    const data = { ...buildReadDocument(), _id: objectId }
    const { error, value } = prnReadSchema.validate(data, {
      stripUnknown: true
    })
    expect(error).toBeUndefined()
    expect(value._id).toBeUndefined()
    expect(value.id).toBeDefined()
  })

  it('accepts documents in all lifecycle stages', () => {
    const awaitingAuth = buildReadDocument({
      ...buildAwaitingAuthorisationPrn()
    })
    const awaitingAcceptance = buildReadDocument({
      ...buildAwaitingAcceptancePrn()
    })

    expect(prnReadSchema.validate(awaitingAuth).error).toBeUndefined()
    expect(prnReadSchema.validate(awaitingAcceptance).error).toBeUndefined()
  })

  it('coerces null notes to absent', () => {
    const data = buildReadDocument({ notes: null })
    const { error, value } = prnReadSchema.validate(data)
    expect(error).toBeUndefined()
    expect(value).not.toHaveProperty('notes')
  })

  it('rejects when required fields from insert schema are missing', () => {
    const data = buildReadDocument()
    delete data.organisation
    const { error } = prnReadSchema.validate(data)
    expect(error).toBeDefined()
  })
})
