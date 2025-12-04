import { describe, it, expect } from 'vitest'
import { buildWasteRecord, buildWasteBalance } from './test-data.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

describe('test-data', () => {
  describe('buildWasteRecord', () => {
    it('auto-generates unique rowId when not provided', () => {
      const record1 = buildWasteRecord()
      const record2 = buildWasteRecord()

      expect(record1.rowId).toBeDefined()
      expect(record2.rowId).toBeDefined()
      expect(record1.rowId).not.toBe(record2.rowId)
    })

    it('uses provided rowId when specified', () => {
      const record = buildWasteRecord({ rowId: 'test-row-1' })
      expect(record.rowId).toBe('test-row-1')
    })

    it('builds valid waste record with defaults', () => {
      const record = buildWasteRecord()
      expect(record.organisationId).toBe('org-1')
      expect(record.registrationId).toBe('reg-1')
      expect(record.type).toBe(WASTE_RECORD_TYPE.RECEIVED)
      expect(record.data).toBeDefined()
      expect(record.versions).toHaveLength(1)
    })
  })

  describe('buildWasteBalance', () => {
    it('builds valid waste balance with defaults', () => {
      const balance = buildWasteBalance()

      expect(balance._id).toBeDefined()
      expect(balance.organisationId).toBe('org-1')
      expect(balance.accreditationId).toBe('acc-1')
      expect(balance.schemaVersion).toBe(1)
      expect(balance.version).toBe(1)
      expect(balance.amount).toBe(100)
      expect(balance.availableAmount).toBe(100)
      expect(balance.transactions).toHaveLength(1)
    })

    it('uses provided schemaVersion when specified', () => {
      const balance = buildWasteBalance({ schemaVersion: 2 })
      expect(balance.schemaVersion).toBe(2)
    })

    it('handles zero values correctly with nullish coalescing', () => {
      const balance = buildWasteBalance({
        amount: 0,
        availableAmount: 0,
        schemaVersion: 0,
        version: 0
      })

      expect(balance.amount).toBe(0)
      expect(balance.availableAmount).toBe(0)
      expect(balance.schemaVersion).toBe(0)
      expect(balance.version).toBe(0)
    })
  })
})
