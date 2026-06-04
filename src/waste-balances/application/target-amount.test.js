import { describe, it, expect } from 'vitest'
import { getTargetAmount } from './target-amount.js'
import { RECEIVED_LOADS_FIELDS as FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { buildWasteRecord } from '#repositories/waste-records/contract/test-data.js'

const includedExportRecord = buildWasteRecord({
  type: WASTE_RECORD_TYPE.EXPORTED,
  data: {
    processingType: PROCESSING_TYPES.EXPORTER,
    [FIELDS.ROW_ID]: 1000,
    [FIELDS.DATE_RECEIVED_FOR_EXPORT]: '2023-01-15',
    [FIELDS.EWC_CODE]: '15 01 01',
    [FIELDS.DESCRIPTION_WASTE]: 'Aluminium - other',
    [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: 'No',
    [FIELDS.GROSS_WEIGHT]: 12,
    [FIELDS.TARE_WEIGHT]: 1,
    [FIELDS.PALLET_WEIGHT]: 0.5,
    [FIELDS.NET_WEIGHT]: 10.5,
    [FIELDS.BAILING_WIRE_PROTOCOL]: 'No',
    [FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION]: 'AAIG percentage',
    [FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS]: 0,
    [FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE]: 1,
    [FIELDS.TONNAGE_RECEIVED_FOR_EXPORT]: 10.5,
    [FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: 10.5,
    [FIELDS.DATE_OF_EXPORT]: '2023-06-01',
    [FIELDS.BASEL_EXPORT_CODE]: 'B3020',
    [FIELDS.CUSTOMS_CODES]: '4707',
    [FIELDS.CONTAINER_NUMBER]: 'CONT001',
    [FIELDS.DATE_RECEIVED_BY_OSR]: '2023-06-15',
    [FIELDS.OSR_ID]: '001',
    [FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: 'No'
  }
})

const dateRange = {
  validFrom: '2023-01-01',
  validTo: '2023-12-31',
  statusHistory: [
    { status: 'created', updatedAt: '2022-12-01T00:00:00.000Z' },
    { status: 'approved', updatedAt: '2022-12-15T00:00:00.000Z' }
  ]
}

describe('getTargetAmount', () => {
  it('credits the export tonnage for an approved accreditation', () => {
    const accreditation = { ...dateRange, status: 'approved' }

    expect(
      getTargetAmount(
        includedExportRecord,
        accreditation,
        ORS_VALIDATION_DISABLED
      )
    ).toBe(10.5)
  })

  it('returns 0 for a created (registered-only) accreditation even within its dates', () => {
    const accreditation = { ...dateRange, status: 'created' }

    expect(
      getTargetAmount(
        includedExportRecord,
        accreditation,
        ORS_VALIDATION_DISABLED
      )
    ).toBe(0)
  })

  it('returns 0 for a rejected accreditation even within its dates', () => {
    const accreditation = { ...dateRange, status: 'rejected' }

    expect(
      getTargetAmount(
        includedExportRecord,
        accreditation,
        ORS_VALIDATION_DISABLED
      )
    ).toBe(0)
  })
})
