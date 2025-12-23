import { describe, it, expect } from 'vitest'
import { transformReceivedLoadsRow } from './received-loads-reprocessing.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

const TEST_ROW_INDEX_5 = 5
const TEST_ROW_INDEX_12 = 12
const TEST_ROW_INDEX_42 = 42

describe('transformReceivedLoadsRow', () => {
  it('transforms valid row data correctly', () => {
    const rowData = {
      ROW_ID: 'row-123',
      DATE_RECEIVED_FOR_REPROCESSING: '2025-01-15',
      GROSS_WEIGHT: 100.5
    }

    const result = transformReceivedLoadsRow(
      rowData,
      0,
      PROCESSING_TYPES.REPROCESSOR_INPUT
    )

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      rowId: 'row-123',
      data: {
        ...rowData,
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
      }
    })
  })

  it('throws error when ROW_ID is missing', () => {
    const rowData = {
      DATE_RECEIVED_FOR_REPROCESSING: '2025-01-15',
      GROSS_WEIGHT: 100.5
    }

    expect(() =>
      transformReceivedLoadsRow(
        rowData,
        TEST_ROW_INDEX_5,
        PROCESSING_TYPES.REPROCESSOR_INPUT
      )
    ).toThrow(`Missing ROW_ID at row ${TEST_ROW_INDEX_5}`)
  })

  it('throws error when DATE_RECEIVED_FOR_REPROCESSING is missing', () => {
    const rowData = {
      ROW_ID: 'row-123',
      GROSS_WEIGHT: 100.5
    }

    expect(() =>
      transformReceivedLoadsRow(
        rowData,
        TEST_ROW_INDEX_12,
        PROCESSING_TYPES.REPROCESSOR_INPUT
      )
    ).toThrow(
      `Missing DATE_RECEIVED_FOR_REPROCESSING at row ${TEST_ROW_INDEX_12}`
    )
  })

  it('includes row index in error messages', () => {
    const rowData = {
      GROSS_WEIGHT: 100.5
    }

    expect(() =>
      transformReceivedLoadsRow(
        rowData,
        TEST_ROW_INDEX_42,
        PROCESSING_TYPES.REPROCESSOR_INPUT
      )
    ).toThrow(`Missing ROW_ID at row ${TEST_ROW_INDEX_42}`)
  })
})
