import { describe, it, expect } from 'vitest'
import {
  validateOrganisationId,
  validateRegistrationId,
  validateWasteRecord
} from './validation.js'
import {
  WASTE_RECORD_TYPE,
  WASTE_RECORD_TEMPLATE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'

describe('validation', () => {
  describe('validateOrganisationId', () => {
    it('accepts valid organisation ID', () => {
      const result = validateOrganisationId('org-123')
      expect(result).toBe('org-123')
    })

    it('rejects empty string', () => {
      expect(() => validateOrganisationId('')).toThrow(
        /organisationId cannot be empty/
      )
    })

    it('rejects non-string', () => {
      expect(() => validateOrganisationId(123)).toThrow(
        /organisationId must be a string/
      )
    })
  })

  describe('validateRegistrationId', () => {
    it('accepts valid registration ID', () => {
      const result = validateRegistrationId('reg-123')
      expect(result).toBe('reg-123')
    })

    it('rejects empty string', () => {
      expect(() => validateRegistrationId('')).toThrow(
        /registrationId cannot be empty/
      )
    })

    it('rejects non-string', () => {
      expect(() => validateRegistrationId(123)).toThrow(
        /registrationId must be a string/
      )
    })
  })

  describe('validateWasteRecord', () => {
    const validRecord = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      rowId: 'row-1',
      type: WASTE_RECORD_TYPE.RECEIVED,
      template: WASTE_RECORD_TEMPLATE.EXPORTER,
      data: { ROW_ID: 'row-1', VALUE: 'test' },
      versions: [
        {
          createdAt: '2025-01-15T10:00:00.000Z',
          status: VERSION_STATUS.CREATED,
          summaryLog: { id: 'log-1', uri: 's3://bucket/key' },
          data: { ROW_ID: 'row-1', VALUE: 'test' }
        }
      ]
    }

    it('accepts valid waste record', () => {
      const result = validateWasteRecord(validRecord)
      expect(result).toEqual(validRecord)
    })

    it('accepts waste record with optional accreditationId', () => {
      const recordWithAccreditation = {
        ...validRecord,
        accreditationId: 'acc-1'
      }
      const result = validateWasteRecord(recordWithAccreditation)
      expect(result.accreditationId).toBe('acc-1')
    })

    it('rejects record missing organisationId', () => {
      const { organisationId: _, ...invalid } = validRecord
      expect(() => validateWasteRecord(invalid)).toThrow(
        /organisationId is required/
      )
    })

    it('rejects record missing registrationId', () => {
      const { registrationId: _, ...invalid } = validRecord
      expect(() => validateWasteRecord(invalid)).toThrow(
        /registrationId is required/
      )
    })

    it('rejects record missing rowId', () => {
      const { rowId: _, ...invalid } = validRecord
      expect(() => validateWasteRecord(invalid)).toThrow(
        /Invalid waste record:.*rowId.*is required/
      )
    })

    it('rejects record missing type', () => {
      const { type: _, ...invalid } = validRecord
      expect(() => validateWasteRecord(invalid)).toThrow(
        /Invalid waste record:.*type.*is required/
      )
    })

    it('rejects record with invalid type', () => {
      const invalid = { ...validRecord, type: 'invalid-type' }
      expect(() => validateWasteRecord(invalid)).toThrow(
        /Invalid waste record:.*type.*must be one of/
      )
    })

    it('rejects record missing data', () => {
      const { data: _, ...invalid } = validRecord
      expect(() => validateWasteRecord(invalid)).toThrow(
        /Invalid waste record:.*data.*is required/
      )
    })

    it('rejects record missing versions', () => {
      const { versions: _, ...invalid } = validRecord
      expect(() => validateWasteRecord(invalid)).toThrow(
        /Invalid waste record:.*versions.*is required/
      )
    })

    it('rejects record with empty versions array', () => {
      const invalid = { ...validRecord, versions: [] }
      expect(() => validateWasteRecord(invalid)).toThrow(
        /Invalid waste record:.*versions.*must contain at least 1 items/
      )
    })
  })
})
