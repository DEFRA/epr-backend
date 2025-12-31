import { describe, it, expect } from 'vitest'
import { transformSentOnLoadsRow } from './sent-on-loads.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

describe('transformSentOnLoadsRow', () => {
  it('transforms valid row data correctly', () => {
    const rowData = {
      ROW_ID: 'row-123',
      DATE_LOAD_LEFT_SITE: '2025-01-20',
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 50.25
    }

    const result = transformSentOnLoadsRow(rowData, 0)

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
      rowId: 'row-123',
      data: {
        ...rowData,
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
      }
    })
  })

  it('throws error when ROW_ID is missing', () => {
    const rowData = {
      DATE_LOAD_LEFT_SITE: '2025-01-20',
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 50.25
    }

    expect(() => transformSentOnLoadsRow(rowData, 0)).toThrow(
      'Missing ROW_ID at row 0'
    )
  })
})
