import { describe, it, expect } from 'vitest'
import { extractWasteBalanceFields } from './extractor.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'

describe('Waste Balance Extractor', () => {
  const validExporterRow = {
    processingType: PROCESSING_TYPES.EXPORTER,
    [RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]: new Date('2023-06-01'),
    [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: 'No',
    [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: 'No',
    [RECEIVED_LOADS_FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR]: 0,
    [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: 10.5
  }

  it('should extract fields for a valid exporter row', () => {
    const result = extractWasteBalanceFields(validExporterRow)
    expect(result).toEqual({
      date: '2023-06-01T00:00:00.000Z',
      prnIssued: false,
      interimSite: false,
      interimTonnage: 0,
      exportTonnage: 10.5
    })
  })

  it('should return null if processingType is not EXPORTER', () => {
    const row = {
      ...validExporterRow,
      processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
    }
    const result = extractWasteBalanceFields(row)
    expect(result).toBeNull()
  })

  it('should return null if validation fails', () => {
    const row = { ...validExporterRow }
    delete row[RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]
    const result = extractWasteBalanceFields(row)
    expect(result).toBeNull()
  })

  it('should handle null tonnage fields by defaulting to 0', () => {
    const row = {
      ...validExporterRow,
      [RECEIVED_LOADS_FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR]: null,
      [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: null
    }
    const result = extractWasteBalanceFields(row)
    expect(result.interimTonnage).toBe(0)
    expect(result.exportTonnage).toBe(0)
  })

  it('should correctly identify prnIssued and interimSite as booleans', () => {
    const row = {
      ...validExporterRow,
      [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: 'Yes',
      [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: 'Yes'
    }
    const result = extractWasteBalanceFields(row)
    expect(result.prnIssued).toBe(true)
    expect(result.interimSite).toBe(true)
  })
})
