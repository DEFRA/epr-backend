import { describe, it, expect } from 'vitest'
import { transformSentOnLoadsRowRegisteredOnly } from './sent-on-loads-reprocessor-registered-only.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

const TEST_ROW_INDEX_5 = 5
const TEST_ROW_INDEX_42 = 42

describe('transformSentOnLoadsRowRegisteredOnly', () => {
  it('transforms valid row data correctly', () => {
    const rowData = {
      ROW_ID: 'row-5000',
      DATE_LOAD_LEFT_SITE: '2025-03-01',
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 5.0
    }

    const result = transformSentOnLoadsRowRegisteredOnly(rowData, 0)

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
      rowId: 'row-5000',
      data: {
        ...rowData,
        processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
      }
    })
  })

  it('throws error when ROW_ID is missing', () => {
    const rowData = {
      DATE_LOAD_LEFT_SITE: '2025-03-01',
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 5.0
    }

    expect(() =>
      transformSentOnLoadsRowRegisteredOnly(rowData, TEST_ROW_INDEX_5)
    ).toThrow(`Missing ROW_ID at row ${TEST_ROW_INDEX_5}`)
  })

  it('transforms row when optional fields are missing', () => {
    const rowData = {
      ROW_ID: 'row-5000'
    }

    const result = transformSentOnLoadsRowRegisteredOnly(rowData, 0)

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
      rowId: 'row-5000',
      data: {
        ...rowData,
        processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
      }
    })
  })

  it('includes row index in error messages', () => {
    const rowData = {
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 5.0
    }

    expect(() =>
      transformSentOnLoadsRowRegisteredOnly(rowData, TEST_ROW_INDEX_42)
    ).toThrow(`Missing ROW_ID at row ${TEST_ROW_INDEX_42}`)
  })
})
