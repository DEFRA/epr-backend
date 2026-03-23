import { describe, it, expect } from 'vitest'
import { transformReceivedLoadsExportRowRegisteredOnly } from './received-loads-export-exporter-registered-only.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

describe('transformReceivedLoadsExportRowRegisteredOnly', () => {
  it('transforms valid row data correctly', () => {
    const rowData = {
      ROW_ID: 'row-1000',
      MONTH_RECEIVED_FOR_EXPORT: '2025-01-01',
      NET_WEIGHT: 10.5
    }

    const result = transformReceivedLoadsExportRowRegisteredOnly(rowData, 0)

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      rowId: 'row-1000',
      data: {
        ...rowData,
        processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
      }
    })
  })

  it('throws error when ROW_ID is missing', () => {
    const rowData = {
      MONTH_RECEIVED_FOR_EXPORT: '2025-01-01',
      NET_WEIGHT: 10.5
    }

    expect(() =>
      transformReceivedLoadsExportRowRegisteredOnly(rowData, 5)
    ).toThrow('Missing ROW_ID at row 5')
  })

  it('transforms row when optional fields are missing', () => {
    const rowData = {
      ROW_ID: 'row-1000',
      NET_WEIGHT: 10.5
    }

    const result = transformReceivedLoadsExportRowRegisteredOnly(rowData, 0)

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      rowId: 'row-1000',
      data: {
        ...rowData,
        processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
      }
    })
  })

  it('includes row index in error messages', () => {
    const rowData = {
      NET_WEIGHT: 10.5
    }

    expect(() =>
      transformReceivedLoadsExportRowRegisteredOnly(rowData, 42)
    ).toThrow('Missing ROW_ID at row 42')
  })
})
