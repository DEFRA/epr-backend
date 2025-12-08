import { describe, expect, it } from 'vitest'
import exporterRecords from './exporter-records.json' with { type: 'json' }
import { EXPORTER_FIELD } from '#domain/waste-balances/constants.js'

describe('Waste Record Seed Data', () => {
  describe('Exporter Records', () => {
    it('should have 3 records', () => {
      expect(exporterRecords).toHaveLength(3)
    })

    it('should have valid structure for Record 1 (Standard Export)', () => {
      const record = exporterRecords[0]
      expect(record.rowId).toBe('1000')
      expect(record.type).toBe('received')
      expect(record.data[EXPORTER_FIELD.DATE_OF_DISPATCH]).toBe(
        '2025-06-01T00:00:00.000Z'
      )
      expect(record.data[EXPORTER_FIELD.PRN_ISSUED]).toBe('No')
      expect(record.data[EXPORTER_FIELD.INTERIM_SITE]).toBe('No')
      expect(record.data[EXPORTER_FIELD.EXPORT_TONNAGE]).toBe(10.5)
    })

    it('should have valid structure for Record 2 (Interim Site)', () => {
      const record = exporterRecords[1]
      expect(record.rowId).toBe('1001')
      expect(record.type).toBe('received')
      expect(record.data[EXPORTER_FIELD.DATE_OF_DISPATCH]).toBe(
        '2025-06-02T00:00:00.000Z'
      )
      expect(record.data[EXPORTER_FIELD.PRN_ISSUED]).toBe('No')
      expect(record.data[EXPORTER_FIELD.INTERIM_SITE]).toBe('Yes')
      expect(record.data[EXPORTER_FIELD.INTERIM_TONNAGE]).toBe(20.0)
    })

    it('should have valid structure for Record 3 (PRN Issued)', () => {
      const record = exporterRecords[2]
      expect(record.rowId).toBe('1002')
      expect(record.type).toBe('received')
      expect(record.data[EXPORTER_FIELD.DATE_OF_DISPATCH]).toBe(
        '2025-06-03T00:00:00.000Z'
      )
      expect(record.data[EXPORTER_FIELD.PRN_ISSUED]).toBe('Yes')
      expect(record.data[EXPORTER_FIELD.EXPORT_TONNAGE]).toBe(100.0)
    })

    it('should have valid version structure', () => {
      const record = exporterRecords[0]
      expect(record.versions).toHaveLength(1)
      const version = record.versions[0]

      expect(version.id).toBeDefined()
      expect(version.createdAt).toBe('2025-01-01T00:00:00.000Z')
      expect(version.status).toBe('created')

      expect(version.createdBy).toEqual({
        id: 'user-1',
        organisationId: 'org-1',
        name: 'System User'
      })

      expect(version.summaryLog).toEqual({
        id: 'sl-1',
        uri: 's3://bucket/import.csv'
      })

      // Verify version data matches record data
      expect(version.data).toEqual(record.data)
    })
  })
})
