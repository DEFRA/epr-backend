import { describe, it, expect } from 'vitest'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'
import { YES_NO_VALUES } from '#domain/summary-logs/table-schemas/shared/index.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  extractWasteBalanceFields,
  getRowDateStatus
} from './waste-balance-extractor.js'
import { isWithinAccreditationDateRange } from '#common/helpers/dates/accreditation.js'

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

  const baseRecord = {
    organisationId: 'org-id',
    registrationId: 'reg-id',
    rowId: 'row-id',
    versions: []
  }

  it('should extract fields from valid exporter record', () => {
    const record = {
      ...baseRecord,
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: validData
    }
    const result = extractWasteBalanceFields(record)

    expect(result).toEqual({
      dispatchDate: new Date('2025-01-20'),
      prnIssued: false,
      transactionAmount: 100
    })
  })

  it('should return null if processing type is not EXPORTER', () => {
    const record = {
      ...baseRecord,
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: { ...validData, processingType: 'REPROCESSOR' }
    }
    const result = extractWasteBalanceFields(record)
    expect(result).toBeNull()
  })

  it('should return null if DATE_OF_EXPORT is missing', () => {
    const data = { ...validData }
    delete data[RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]
    const record = { ...baseRecord, type: WASTE_RECORD_TYPE.RECEIVED, data }
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
    const record = { ...baseRecord, type: WASTE_RECORD_TYPE.RECEIVED, data }
    const result = extractWasteBalanceFields(record)

    expect(result.transactionAmount).toBe(150)
  })

  it('should default transactionAmount to 0 if tonnage is null', () => {
    const data = {
      ...validData,
      [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: null
    }
    const record = { ...baseRecord, type: WASTE_RECORD_TYPE.RECEIVED, data }
    const result = extractWasteBalanceFields(record)

    expect(result.transactionAmount).toBe(0)
  })

  it('should round transactionAmount to two decimal places', () => {
    const data = {
      ...validData,
      [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: 100.125
    }
    const record = { ...baseRecord, type: WASTE_RECORD_TYPE.RECEIVED, data }
    const result = extractWasteBalanceFields(record)

    expect(result.transactionAmount).toBe(100.13)
  })

  it('should round interim site tonnage to two decimal places', () => {
    const data = {
      ...validData,
      [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]:
        YES_NO_VALUES.YES,
      [RECEIVED_LOADS_FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR]: 150.105,
      [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: null
    }
    const record = { ...baseRecord, type: WASTE_RECORD_TYPE.RECEIVED, data }
    const result = extractWasteBalanceFields(record)

    expect(result.transactionAmount).toBe(150.11)
  })

  it('should handle prnIssued correctly', () => {
    const data = {
      ...validData,
      [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]:
        YES_NO_VALUES.YES
    }
    const record = { ...baseRecord, type: WASTE_RECORD_TYPE.RECEIVED, data }
    const result = extractWasteBalanceFields(record)

    expect(result.prnIssued).toBe(true)
  })
})

describe('getRowDateStatus', () => {
  const accreditation = {
    validFrom: '2025-01-01',
    validTo: '2025-12-31'
  }

  it('should return null when DATE_OF_EXPORT is within range', () => {
    const data = {
      [RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]: '2025-06-15'
    }

    expect(getRowDateStatus(data, accreditation)).toBeNull()
  })

  it('should return IGNORED when DATE_OF_EXPORT is outside range', () => {
    const data = {
      [RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]: '2024-06-15'
    }

    expect(getRowDateStatus(data, accreditation)).toBe(ROW_OUTCOME.IGNORED)
  })

  it('should return null when no date fields are present', () => {
    const data = {}

    expect(getRowDateStatus(data, accreditation)).toBeNull()
  })
})

describe('isWithinAccreditationDateRange', () => {
  const accreditation = {
    validFrom: '2025-01-01T00:00:00.000Z',
    validTo: '2025-12-31T23:59:59.999Z'
  }

  it('should return true if date is within range', () => {
    const date = new Date('2025-06-15T12:00:00.000Z')
    expect(isWithinAccreditationDateRange(date, accreditation)).toBe(true)
  })

  it('should return true if date is exactly start date', () => {
    const date = new Date('2025-01-01T00:00:00.000Z')
    expect(isWithinAccreditationDateRange(date, accreditation)).toBe(true)
  })

  it('should return true if date is exactly end date', () => {
    const date = new Date('2025-12-31T23:59:59.999Z')
    expect(isWithinAccreditationDateRange(date, accreditation)).toBe(true)
  })

  it('should return false if date is before start date', () => {
    const date = new Date('2024-12-31T23:59:59.999Z')
    expect(isWithinAccreditationDateRange(date, accreditation)).toBe(false)
  })

  it('should return false if date is after end date', () => {
    const date = new Date('2026-01-01T00:00:00.000Z')
    expect(isWithinAccreditationDateRange(date, accreditation)).toBe(false)
  })
})
