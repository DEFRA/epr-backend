import { describe, it, expect } from 'vitest'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'
import { YES_NO_VALUES } from '#domain/summary-logs/table-schemas/shared/index.js'
import { extractWasteBalanceFields } from './waste-balance-extractor.js'

describe('extractWasteBalanceFields', () => {
  const validData = {
    processingType: PROCESSING_TYPES.EXPORTER,
    [RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]: '2025-01-20',
    [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]:
      YES_NO_VALUES.NO,
    [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]:
      YES_NO_VALUES.NO,
    [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: 100,
    [RECEIVED_LOADS_FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR]: null
  }

  it('should extract fields from valid exporter record', () => {
    const record = { data: validData }
    const result = extractWasteBalanceFields(record)

    expect(result).toEqual({
      dispatchDate: new Date('2025-01-20'),
      prnIssued: false,
      transactionAmount: 100
    })
  })

  it('should return null if processing type is not EXPORTER', () => {
    const record = { data: { ...validData, processingType: 'REPROCESSOR' } }
    const result = extractWasteBalanceFields(record)
    expect(result).toBeNull()
  })

  it('should return null if DATE_OF_EXPORT is missing', () => {
    const data = { ...validData }
    delete data[RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]
    const record = { data }
    const result = extractWasteBalanceFields(record)
    expect(result).toBeNull()
  })

  it('should handle interim site tonnage', () => {
    const data = {
      ...validData,
      [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]:
        YES_NO_VALUES.YES,
      [RECEIVED_LOADS_FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR]: 150,
      [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: null
    }
    const record = { data }
    const result = extractWasteBalanceFields(record)

    expect(result.transactionAmount).toBe(150)
  })

  it('should default transactionAmount to 0 if tonnage is null', () => {
    const data = {
      ...validData,
      [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: null
    }
    const record = { data }
    const result = extractWasteBalanceFields(record)

    expect(result.transactionAmount).toBe(0)
  })

  it('should handle prnIssued correctly', () => {
    const data = {
      ...validData,
      [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]:
        YES_NO_VALUES.YES
    }
    const record = { data }
    const result = extractWasteBalanceFields(record)

    expect(result.prnIssued).toBe(true)
  })
})
