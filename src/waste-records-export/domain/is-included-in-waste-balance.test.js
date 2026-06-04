import { isIncludedInWasteBalance } from './is-included-in-waste-balance.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'

describe('isIncludedInWasteBalance', () => {
  const accreditation = {
    id: 'acc-1',
    validFrom: '2026-01-01',
    validTo: '2027-01-01',
    statusHistory: []
  }

  it('returns false when record.excludedFromWasteBalance is true', () => {
    const record = {
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: { processingType: PROCESSING_TYPES.REPROCESSOR_INPUT },
      excludedFromWasteBalance: true
    }
    expect(
      isIncludedInWasteBalance(record, accreditation, ORS_VALIDATION_DISABLED)
    ).toBe(false)
  })

  it('returns false when no schema can be found for the record', () => {
    const record = {
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: { processingType: 'NOT_A_REAL_TYPE' }
    }
    expect(
      isIncludedInWasteBalance(record, accreditation, ORS_VALIDATION_DISABLED)
    ).toBe(false)
  })

  it('returns false when the schema does not have classifyForWasteBalance', () => {
    // SENT_ON records typically lack classifyForWasteBalance
    const record = {
      type: WASTE_RECORD_TYPE.SENT_ON,
      data: { processingType: PROCESSING_TYPES.EXPORTER }
    }
    expect(
      isIncludedInWasteBalance(record, accreditation, ORS_VALIDATION_DISABLED)
    ).toBe(false)
  })

  it('returns true when classifyForWasteBalance returns INCLUDED', () => {
    // A reprocessor RECEIVED record with all required fields should classify INCLUDED
    const record = {
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
        ROW_ID: '1001',
        DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
        EWC_CODE: '15 01 02',
        DESCRIPTION_WASTE: 'Plastic packaging',
        WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
        GROSS_WEIGHT: 10,
        TARE_WEIGHT: 1,
        PALLET_WEIGHT: 0,
        NET_WEIGHT: 9,
        BAILING_WIRE_PROTOCOL: 'No',
        HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Sampling',
        WEIGHT_OF_NON_TARGET_MATERIALS: 0,
        RECYCLABLE_PROPORTION_PERCENTAGE: 100,
        TONNAGE_RECEIVED_FOR_RECYCLING: 9
      }
    }
    expect(
      isIncludedInWasteBalance(record, accreditation, ORS_VALIDATION_DISABLED)
    ).toBe(true)
  })

  it('returns false for a registered-only accreditation even when the record would otherwise be INCLUDED', () => {
    const registeredOnlyAccreditation = { ...accreditation, status: 'created' }
    const record = {
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
        ROW_ID: '1001',
        DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
        EWC_CODE: '15 01 02',
        DESCRIPTION_WASTE: 'Plastic packaging',
        WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
        GROSS_WEIGHT: 10,
        TARE_WEIGHT: 1,
        PALLET_WEIGHT: 0,
        NET_WEIGHT: 9,
        BAILING_WIRE_PROTOCOL: 'No',
        HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Sampling',
        WEIGHT_OF_NON_TARGET_MATERIALS: 0,
        RECYCLABLE_PROPORTION_PERCENTAGE: 100,
        TONNAGE_RECEIVED_FOR_RECYCLING: 9
      }
    }
    expect(
      isIncludedInWasteBalance(
        record,
        registeredOnlyAccreditation,
        ORS_VALIDATION_DISABLED
      )
    ).toBe(false)
  })

  it('returns false when classifyForWasteBalance returns EXCLUDED (PRN already issued)', () => {
    const record = {
      type: WASTE_RECORD_TYPE.EXPORTED,
      data: {
        processingType: PROCESSING_TYPES.EXPORTER,
        ROW_ID: '1001',
        DATE_RECEIVED_FOR_EXPORT: '2026-02-01',
        EWC_CODE: '15 01 02',
        DESCRIPTION_WASTE: 'Plastic packaging',
        WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'Yes',
        GROSS_WEIGHT: 10,
        TARE_WEIGHT: 1,
        PALLET_WEIGHT: 0,
        NET_WEIGHT: 9,
        BAILING_WIRE_PROTOCOL: 'No',
        HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Sampling',
        WEIGHT_OF_NON_TARGET_MATERIALS: 0,
        RECYCLABLE_PROPORTION_PERCENTAGE: 100,
        TONNAGE_RECEIVED_FOR_EXPORT: 9,
        TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 9,
        DATE_OF_EXPORT: '2026-03-01',
        BASEL_EXPORT_CODE: 'B3010',
        CUSTOMS_CODES: '391510',
        CONTAINER_NUMBER: 'CN-001',
        DATE_RECEIVED_BY_OSR: '2026-04-01',
        OSR_ID: '099',
        DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No'
      }
    }
    expect(
      isIncludedInWasteBalance(record, accreditation, ORS_VALIDATION_DISABLED)
    ).toBe(false)
  })
})
