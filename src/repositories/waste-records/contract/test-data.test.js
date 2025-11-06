import { describe, it, expect } from 'vitest'
import { buildWasteRecord } from './test-data.js'

describe('test-data', () => {
  describe('buildWasteRecord', () => {
    it('throws error when rowId is not provided', () => {
      expect(() => buildWasteRecord({})).toThrow('rowId is required')
    })

    it('throws error when overrides is undefined', () => {
      expect(() => buildWasteRecord()).toThrow('rowId is required')
    })

    it('throws error when overrides is null', () => {
      expect(() => buildWasteRecord(null)).toThrow('rowId is required')
    })

    it('builds valid waste record when rowId is provided', () => {
      const record = buildWasteRecord({ rowId: 'test-row-1' })
      expect(record.rowId).toBe('test-row-1')
      expect(record.organisationId).toBe('org-1')
      expect(record.registrationId).toBe('reg-1')
    })
  })
})
