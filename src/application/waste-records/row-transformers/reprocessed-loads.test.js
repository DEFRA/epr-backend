import { describe, it, expect } from 'vitest'
import { transformReprocessedLoadsRow } from './reprocessed-loads.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { REPROCESSED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/reprocessor-output/fields.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

describe('transformReprocessedLoadsRow', () => {
  it('transforms valid row data correctly', () => {
    const rowData = {
      [REPROCESSED_LOADS_FIELDS.ROW_ID]: 'row-123',
      someOtherField: 'value'
    }
    const rowIndex = 5

    const result = transformReprocessedLoadsRow(rowData, rowIndex)

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
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

    expect(() => transformReprocessedLoadsRow(rowData, rowIndex)).toThrow(
      `Missing ${REPROCESSED_LOADS_FIELDS.ROW_ID} at row ${rowIndex}`
    )
  })
})
