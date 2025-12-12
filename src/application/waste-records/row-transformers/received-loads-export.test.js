import { describe, it, expect } from 'vitest'
import { transformExportLoadsRow } from './received-loads-export.js'

describe('transformExportLoadsRow', () => {
  it('throws error if ROW_ID is missing', () => {
    const rowData = {
      SOME_OTHER_FIELD: 'value'
    }
    expect(() => transformExportLoadsRow(rowData, 1)).toThrow(
      'Missing ROW_ID at row 1'
    )
  })

  it('transforms valid row data', () => {
    const rowData = {
      ROW_ID: 123,
      OTHER_FIELD: 'value'
    }
    const result = transformExportLoadsRow(rowData, 1)
    expect(result).toEqual({
      wasteRecordType: 'exported',
      rowId: 123,
      data: {
        ...rowData,
        processingType: 'EXPORTER'
      }
    })
  })
})
