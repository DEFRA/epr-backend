import { describe, it, expect } from 'vitest'
import { transformReceivedLoadsRow } from './received-loads-reprocessing.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

describe('transformReceivedLoadsRow', () => {
  it('transforms valid row data correctly', () => {
    const rowData = {
      ROW_ID: 'row-123',
      DATE_RECEIVED_FOR_REPROCESSING: '2025-01-15',
      GROSS_WEIGHT: 100.5
    }

    const result = transformReceivedLoadsRow(rowData, 0)

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      rowId: 'row-123',
      data: rowData
    })
  })

  it('throws error when ROW_ID is missing', () => {
    const rowData = {
      DATE_RECEIVED_FOR_REPROCESSING: '2025-01-15',
      GROSS_WEIGHT: 100.5
    }

    expect(() => transformReceivedLoadsRow(rowData, 5)).toThrow(
      'Missing ROW_ID at row 5'
    )
  })

  it('throws error when DATE_RECEIVED_FOR_REPROCESSING is missing', () => {
    const rowData = {
      ROW_ID: 'row-123',
      GROSS_WEIGHT: 100.5
    }

    expect(() => transformReceivedLoadsRow(rowData, 12)).toThrow(
      'Missing DATE_RECEIVED_FOR_REPROCESSING at row 12'
    )
  })

  it('includes row index in error messages', () => {
    const rowData = {
      GROSS_WEIGHT: 100.5
    }

    expect(() => transformReceivedLoadsRow(rowData, 42)).toThrow(
      'Missing ROW_ID at row 42'
    )
  })
})
