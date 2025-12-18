import { describe, it, expect } from 'vitest'
import { transformSentOnLoadsRow } from './sent-on-loads.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

describe('transformSentOnLoadsRow', () => {
  it('should transform a sent on load row correctly', () => {
    const row = {
      ROW_ID: 'row-1',
      DATE_LOAD_LEFT_SITE: '2023-06-01',
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: '10.5',
      'Is this an interim site?': 'No'
    }

    const result = transformSentOnLoadsRow(
      row,
      1,
      PROCESSING_TYPES.REPROCESSOR_INPUT
    )

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
      rowId: 'row-1',
      data: {
        ...row,
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
      }
    })
  })

  it('should throw error if Row ID is missing', () => {
    const row = {
      DATE_LOAD_LEFT_SITE: '2023-06-01'
    }
    expect(() =>
      transformSentOnLoadsRow(row, 1, PROCESSING_TYPES.REPROCESSOR_INPUT)
    ).toThrow('Missing ROW_ID at row 1')
  })

  it('should throw error if DATE_LOAD_LEFT_SITE is missing', () => {
    const row = {
      ROW_ID: 'row-1'
    }
    expect(() =>
      transformSentOnLoadsRow(row, 1, PROCESSING_TYPES.REPROCESSOR_INPUT)
    ).toThrow('Missing DATE_LOAD_LEFT_SITE at row 1')
  })
})
