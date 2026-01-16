import { describe, it, expect } from 'vitest'
import { transformReprocessedLoadsRowReprocessorInput } from './reprocessed-loads-reprocessor-input.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { REPROCESSED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/reprocessor-input/fields.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

describe('transformReprocessedLoadsRowReprocessorInput', () => {
  it('transforms valid row data correctly', () => {
    const rowData = {
      [REPROCESSED_LOADS_FIELDS.ROW_ID]: 'row-4001',
      [REPROCESSED_LOADS_FIELDS.DATE_LOAD_LEFT_SITE]: '2024-01-15',
      [REPROCESSED_LOADS_FIELDS.PRODUCT_DESCRIPTION]:
        'Recycled plastic pellets',
      [REPROCESSED_LOADS_FIELDS.END_OF_WASTE_STANDARDS]: 'BS EN 15347',
      [REPROCESSED_LOADS_FIELDS.PRODUCT_TONNAGE]: '1500',
      [REPROCESSED_LOADS_FIELDS.WEIGHBRIDGE_TICKET_NUMBER]: 'WB-12345',
      [REPROCESSED_LOADS_FIELDS.HAULIER_NAME]: 'Acme Haulage',
      [REPROCESSED_LOADS_FIELDS.HAULIER_VEHICLE_REGISTRATION_NUMBER]:
        'AB12 CDE',
      [REPROCESSED_LOADS_FIELDS.CUSTOMER_NAME]: 'Plastic Products Ltd',
      [REPROCESSED_LOADS_FIELDS.CUSTOMER_INVOICE_REFERENCE]: 'INV-2024-001'
    }
    const rowIndex = 5

    const result = transformReprocessedLoadsRowReprocessorInput(
      rowData,
      rowIndex
    )

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
      rowId: 'row-4001',
      data: {
        ...rowData,
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
      }
    })
  })

  it('throws error if ROW_ID is missing', () => {
    const rowData = {
      [REPROCESSED_LOADS_FIELDS.PRODUCT_DESCRIPTION]: 'Recycled plastic pellets'
    }
    const rowIndex = 5

    expect(() =>
      transformReprocessedLoadsRowReprocessorInput(rowData, rowIndex)
    ).toThrow(`Missing ${REPROCESSED_LOADS_FIELDS.ROW_ID} at row ${rowIndex}`)
  })
})
