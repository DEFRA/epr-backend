import { describe, it, expect } from 'vitest'
import { transformLoadsExportedRowRegisteredOnly } from './loads-exported-exporter-registered-only.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

describe('transformLoadsExportedRowRegisteredOnly', () => {
  it('transforms valid row data correctly', () => {
    const rowData = {
      ROW_ID: 'row-2000',
      TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5.0,
      DATE_OF_EXPORT: '2025-03-01'
    }

    const result = transformLoadsExportedRowRegisteredOnly(rowData, 0)

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
      rowId: 'row-2000',
      data: {
        ...rowData,
        processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
      }
    })
  })

  it('throws error when ROW_ID is missing', () => {
    const rowData = {
      TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5.0,
      DATE_OF_EXPORT: '2025-03-01'
    }

    expect(() => transformLoadsExportedRowRegisteredOnly(rowData, 5)).toThrow(
      'Missing ROW_ID at row 5'
    )
  })

  it('transforms row when optional fields are missing', () => {
    const rowData = {
      ROW_ID: 'row-2000'
    }

    const result = transformLoadsExportedRowRegisteredOnly(rowData, 0)

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
      rowId: 'row-2000',
      data: {
        ...rowData,
        processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
      }
    })
  })

  it('includes row index in error messages', () => {
    const rowData = {
      TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5.0
    }

    expect(() => transformLoadsExportedRowRegisteredOnly(rowData, 42)).toThrow(
      'Missing ROW_ID at row 42'
    )
  })
})
