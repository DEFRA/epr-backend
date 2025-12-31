import { describe, it, expect, vi } from 'vitest'
import {
  extractWasteBalanceFields,
  isWithinAccreditationDateRange
} from './extractor.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import * as exporterExtractor from '#domain/waste-balances/table-schemas/exporter/validators/waste-balance-extractor.js'
import * as reprocessorInputExtractor from '#domain/waste-balances/table-schemas/reprocessor-input/validators/waste-balance-extractor.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

describe('extractWasteBalanceFields', () => {
  const baseRecord = {
    organisationId: 'org-id',
    registrationId: 'reg-id',
    rowId: 'row-id',
    versions: [],
    type: WASTE_RECORD_TYPE.RECEIVED
  }

  it('delegates to exporter extractor for EXPORTER processing type', () => {
    const record = {
      ...baseRecord,
      data: { processingType: PROCESSING_TYPES.EXPORTER }
    }
    const expectedResult = {
      dispatchDate: new Date(),
      prnIssued: false,
      transactionAmount: 100
    }

    const spy = vi
      .spyOn(exporterExtractor, 'extractWasteBalanceFields')
      .mockReturnValue(expectedResult)

    const result = extractWasteBalanceFields(record)

    expect(result).toBe(expectedResult)
    expect(spy).toHaveBeenCalledWith(record)
    spy.mockRestore()
  })

  it('delegates to reprocessor input extractor for REPROCESSOR_INPUT processing type', () => {
    const record = {
      ...baseRecord,
      data: { processingType: PROCESSING_TYPES.REPROCESSOR_INPUT }
    }
    const expectedResult = {
      dispatchDate: new Date(),
      prnIssued: false,
      transactionAmount: 100
    }

    const spy = vi
      .spyOn(reprocessorInputExtractor, 'extractWasteBalanceFields')
      .mockReturnValue(expectedResult)

    const result = extractWasteBalanceFields(record)

    expect(result).toBe(expectedResult)
    expect(spy).toHaveBeenCalledWith(record)
    spy.mockRestore()
  })

  it('returns null for unknown processing type', () => {
    const record = {
      ...baseRecord,
      data: { processingType: 'UNKNOWN' }
    }
    const result = extractWasteBalanceFields(record)
    expect(result).toBeNull()
  })

  it('returns null when processing type is missing', () => {
    const record = { ...baseRecord, data: {} }
    const result = extractWasteBalanceFields(record)
    expect(result).toBeNull()
  })
})

describe('isWithinAccreditationDateRange', () => {
  const accreditation = {
    validFrom: '2025-01-01',
    validTo: '2025-12-31'
  }

  it('returns true when date is within range', () => {
    const date = new Date('2025-06-15')
    expect(isWithinAccreditationDateRange(date, accreditation)).toBe(true)
  })

  it('returns true when date is on start boundary', () => {
    const date = new Date('2025-01-01')
    expect(isWithinAccreditationDateRange(date, accreditation)).toBe(true)
  })

  it('returns true when date is on end boundary', () => {
    const date = new Date('2025-12-31')
    expect(isWithinAccreditationDateRange(date, accreditation)).toBe(true)
  })

  it('returns false when date is before range', () => {
    const date = new Date('2024-12-31')
    expect(isWithinAccreditationDateRange(date, accreditation)).toBe(false)
  })

  it('returns false when date is after range', () => {
    const date = new Date('2026-01-01')
    expect(isWithinAccreditationDateRange(date, accreditation)).toBe(false)
  })
})
