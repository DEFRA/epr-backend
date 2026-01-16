import { describe, it, expect } from 'vitest'
import { transformSentOnLoadsRowExporter } from './sent-on-loads-exporter.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { SENT_ON_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/shared/index.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

describe('transformSentOnLoadsRowExporter', () => {
  it('transforms valid row data correctly', () => {
    const rowData = {
      [SENT_ON_LOADS_FIELDS.ROW_ID]: 'row-4001',
      [SENT_ON_LOADS_FIELDS.DATE_LOAD_LEFT_SITE]: '2024-01-15',
      [SENT_ON_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON]: '500',
      [SENT_ON_LOADS_FIELDS.FINAL_DESTINATION_FACILITY_TYPE]: 'Recycler',
      [SENT_ON_LOADS_FIELDS.FINAL_DESTINATION_NAME]: 'Green Recycling Ltd',
      [SENT_ON_LOADS_FIELDS.FINAL_DESTINATION_ADDRESS]: '123 Industrial Estate',
      [SENT_ON_LOADS_FIELDS.FINAL_DESTINATION_POSTCODE]: 'AB1 2CD',
      [SENT_ON_LOADS_FIELDS.FINAL_DESTINATION_EMAIL]: 'info@greenrecycling.com',
      [SENT_ON_LOADS_FIELDS.FINAL_DESTINATION_PHONE]: '01onal23 456789',
      [SENT_ON_LOADS_FIELDS.YOUR_REFERENCE]: 'REF-001',
      [SENT_ON_LOADS_FIELDS.DESCRIPTION_WASTE]: 'Plastic packaging',
      [SENT_ON_LOADS_FIELDS.EWC_CODE]: '15 01 02',
      [SENT_ON_LOADS_FIELDS.WEIGHBRIDGE_TICKET]: 'WB-12345'
    }
    const rowIndex = 5

    const result = transformSentOnLoadsRowExporter(rowData, rowIndex)

    expect(result).toEqual({
      wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
      rowId: 'row-4001',
      data: {
        ...rowData,
        processingType: PROCESSING_TYPES.EXPORTER
      }
    })
  })

  it('throws error if ROW_ID is missing', () => {
    const rowData = {
      [SENT_ON_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON]: '500'
    }
    const rowIndex = 5

    expect(() => transformSentOnLoadsRowExporter(rowData, rowIndex)).toThrow(
      `Missing ${SENT_ON_LOADS_FIELDS.ROW_ID} at row ${rowIndex}`
    )
  })
})
