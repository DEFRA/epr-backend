import { describe, it, expect } from 'vitest'
import { transformReceivedLoadsRowReprocessorOutput } from './received-loads-reprocessing-output.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/reprocessor-output/fields.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

describe('transformReceivedLoadsRowReprocessorOutput', () => {
  it('transforms valid row data correctly', () => {
    const rowData = {
      [RECEIVED_LOADS_FIELDS.ROW_ID]: 'row-123',
      someOtherField: 'value'
    }
    const rowIndex = 5

    const result = transformReceivedLoadsRowReprocessorOutput(rowData, rowIndex)

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      rowId: 'row-123',
      data: {
        ...rowData,
        processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
      }
    })
  })

  it('throws error if ROW_ID is missing', () => {
    const rowData = {
      someOtherField: 'value'
    }
    const rowIndex = 5

    expect(() =>
      transformReceivedLoadsRowReprocessorOutput(rowData, rowIndex)
    ).toThrow(`Missing ${RECEIVED_LOADS_FIELDS.ROW_ID} at row ${rowIndex}`)
  })
})
