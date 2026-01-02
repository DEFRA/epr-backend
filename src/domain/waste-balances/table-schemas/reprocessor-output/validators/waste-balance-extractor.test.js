import { describe, it, expect } from 'vitest'
import { extractWasteBalanceFields } from './waste-balance-extractor.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { YES_NO_VALUES } from '#domain/summary-logs/table-schemas/shared/index.js'
import { REPROCESSED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/reprocessor-output/fields.js'

describe('extractWasteBalanceFields (REPROCESSOR_OUTPUT)', () => {
  const validProcessedData = {
    processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT,
    [REPROCESSED_LOADS_FIELDS.DATE_LOAD_LEFT_SITE]: '2025-01-15',
    [REPROCESSED_LOADS_FIELDS.ADD_PRODUCT_WEIGHT]: YES_NO_VALUES.YES,
    [REPROCESSED_LOADS_FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION]: 100.5
  }

  const baseRecord = {
    organisationId: 'org-id',
    registrationId: 'reg-id',
    rowId: 'row-id',
    versions: []
  }

  it('returns null if processing type is not REPROCESSOR_OUTPUT', () => {
    const record = {
      ...baseRecord,
      type: WASTE_RECORD_TYPE.PROCESSED,
      data: {
        ...validProcessedData,
        processingType: PROCESSING_TYPES.EXPORTER
      }
    }
    expect(extractWasteBalanceFields(record)).toBeNull()
  })

  it('returns null if record type is not PROCESSED', () => {
    const record = {
      ...baseRecord,
      type: WASTE_RECORD_TYPE.RECEIVED, // Not PROCESSED
      data: validProcessedData
    }
    expect(extractWasteBalanceFields(record)).toBeNull()
  })

  it('extracts fields correctly for valid processed record', () => {
    const record = {
      ...baseRecord,
      type: WASTE_RECORD_TYPE.PROCESSED,
      data: validProcessedData
    }

    const result = extractWasteBalanceFields(record)

    expect(result).toEqual({
      dispatchDate: new Date('2025-01-15'),
      prnIssued: false,
      transactionAmount: 100.5
    })
  })

  it('returns null if validation fails (missing date)', () => {
    const invalidData = { ...validProcessedData }
    delete invalidData[REPROCESSED_LOADS_FIELDS.DATE_LOAD_LEFT_SITE]

    const record = {
      ...baseRecord,
      type: WASTE_RECORD_TYPE.PROCESSED,
      data: invalidData
    }

    expect(extractWasteBalanceFields(record)).toBeNull()
  })

  it('returns null if ADD_PRODUCT_WEIGHT is not YES', () => {
    const record = {
      ...baseRecord,
      type: WASTE_RECORD_TYPE.PROCESSED,
      data: {
        ...validProcessedData,
        [REPROCESSED_LOADS_FIELDS.ADD_PRODUCT_WEIGHT]: YES_NO_VALUES.NO
      }
    }

    expect(extractWasteBalanceFields(record)).toBeNull()
  })

  it('defaults transactionAmount to 0 if missing', () => {
    const dataWithoutAmount = { ...validProcessedData }
    delete dataWithoutAmount[
      REPROCESSED_LOADS_FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION
    ]

    const record = {
      ...baseRecord,
      type: WASTE_RECORD_TYPE.PROCESSED,
      data: dataWithoutAmount
    }

    const result = extractWasteBalanceFields(record)
    expect(result.transactionAmount).toBe(0)
  })
})
