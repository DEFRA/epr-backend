import { describe, it, expect } from 'vitest'
import { transformSentOnLoadsRowExporterRegisteredOnly } from './sent-on-loads-exporter-registered-only.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

describe('transformSentOnLoadsRowExporterRegisteredOnly', () => {
  it('transforms valid row data correctly', () => {
    const rowData = {
      ROW_ID: 'row-4000',
      DATE_LOAD_LEFT_SITE: '2025-03-01',
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 5.0
    }

    const result = transformSentOnLoadsRowExporterRegisteredOnly(rowData, 0)

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
      rowId: 'row-4000',
      data: {
        ...rowData,
        processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
      }
    })
  })

  it('throws error when ROW_ID is missing', () => {
    const rowData = {
      DATE_LOAD_LEFT_SITE: '2025-03-01',
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 5.0
    }

    expect(() =>
      transformSentOnLoadsRowExporterRegisteredOnly(rowData, 5)
    ).toThrow('Missing ROW_ID at row 5')
  })

  it('transforms row when optional fields are missing', () => {
    const rowData = {
      ROW_ID: 'row-4000'
    }

    const result = transformSentOnLoadsRowExporterRegisteredOnly(rowData, 0)

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
      rowId: 'row-4000',
      data: {
        ...rowData,
        processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
      }
    })
  })

  it('includes row index in error messages', () => {
    const rowData = {
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 5.0
    }

    expect(() =>
      transformSentOnLoadsRowExporterRegisteredOnly(rowData, 42)
    ).toThrow('Missing ROW_ID at row 42')
  })
})
