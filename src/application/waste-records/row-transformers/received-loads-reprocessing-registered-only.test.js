import { describe, it, expect } from 'vitest'
import { transformReceivedLoadsRowRegisteredOnly } from './received-loads-reprocessing-registered-only.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

const TEST_ROW_INDEX_5 = 5
const TEST_ROW_INDEX_42 = 42

describe('transformReceivedLoadsRowRegisteredOnly', () => {
  it('transforms valid row data correctly', () => {
    const rowData = {
      ROW_ID: 'row-1000',
      MONTH_RECEIVED_FOR_REPROCESSING: '2025-01-01',
      NET_WEIGHT: 10.5
    }

    const result = transformReceivedLoadsRowRegisteredOnly(rowData, 0)

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      rowId: 'row-1000',
      data: {
        ...rowData,
        processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
      }
    })
  })

  it('throws error when ROW_ID is missing', () => {
    const rowData = {
      MONTH_RECEIVED_FOR_REPROCESSING: '2025-01-01',
      NET_WEIGHT: 10.5
    }

    expect(() =>
      transformReceivedLoadsRowRegisteredOnly(rowData, TEST_ROW_INDEX_5)
    ).toThrow(`Missing ROW_ID at row ${TEST_ROW_INDEX_5}`)
  })

  it('transforms row when optional fields are missing', () => {
    const rowData = {
      ROW_ID: 'row-1000',
      NET_WEIGHT: 10.5
    }

    const result = transformReceivedLoadsRowRegisteredOnly(rowData, 0)

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      rowId: 'row-1000',
      data: {
        ...rowData,
        processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
      }
    })
  })

  it('includes row index in error messages', () => {
    const rowData = {
      NET_WEIGHT: 10.5
    }

    expect(() =>
      transformReceivedLoadsRowRegisteredOnly(rowData, TEST_ROW_INDEX_42)
    ).toThrow(`Missing ROW_ID at row ${TEST_ROW_INDEX_42}`)
  })
})
