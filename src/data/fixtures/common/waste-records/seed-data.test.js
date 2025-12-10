import { describe, expect, it } from 'vitest'
import exporterRecords from './exporter-records.json' with { type: 'json' }

const EXPORTER_FIELD = Object.freeze({
  DATE_OF_DISPATCH: 'DATE_OF_DISPATCH',
  PRN_ISSUED: 'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
  INTERIM_SITE: 'DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE',
  INTERIM_TONNAGE: 'TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR',
  EXPORT_TONNAGE: 'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED'
})

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
