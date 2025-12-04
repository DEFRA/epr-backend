import { describe, it, expect } from 'vitest'
import { buildWasteRecord } from './test-data.js'
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
})
