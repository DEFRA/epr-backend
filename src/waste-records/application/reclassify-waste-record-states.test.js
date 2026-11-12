import { describe, it, expect } from 'vitest'

import {
  reclassifyWasteRecordState,
  reclassifyWasteRecordStates
} from './reclassify-waste-record-states.js'
import { projectSummaryLogRowState } from './project-summary-log-row-state.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

/** @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord */
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { roundToTwoDecimalPlaces } from '#common/helpers/decimal-utils.js'
import { getTemplate } from '#domain/summary-logs/table-schemas/index.js'
import { toYear } from '#common/helpers/dates/year.js'
import { buildAccreditation } from '#repositories/organisations/contract/test-data.js'

/** @typedef {import('#domain/organisations/accreditation.js').Accreditation} Accreditation */

const accreditationCovering = (validFrom, validTo) =>
  /** @type {Accreditation} */ (
    /** @type {unknown} */ (
      buildAccreditation({ id: 'acc-1', validFrom, validTo })
    )
  )

const receivedRowState = (overrides = {}) => ({
  rowId: '1001',
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: {
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
  },
  classification: {
    outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
    reasons: [],
    transactionAmount: 9
  },
  ...overrides
})

/**
 * @param {Accreditation | null} accreditation
 * @returns {import('./reclassify-waste-record-states.js').ReclassificationContext}
 */
const contextWith = (accreditation) => ({
  accreditation,
  overseasSites: ORS_VALIDATION_DISABLED
})

describe('reclassifyWasteRecordStates', () => {
  it('classifies a row the accreditation now covers as included', () => {
    const [row] = reclassifyWasteRecordStates(
      [receivedRowState()],
      toYear(2026),
      contextWith(accreditationCovering('2026-01-01', '2027-01-01'))
    )

    expect(row.classification).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: 9
    })
  })

  it('replaces a stamped inclusion when the accreditation no longer covers the row', () => {
    const stampedAsIncluded = receivedRowState()

    const [row] = reclassifyWasteRecordStates(
      [stampedAsIncluded],
      toYear(2026),
      contextWith(accreditationCovering('2026-06-01', '2027-01-01'))
    )

    expect(stampedAsIncluded.classification.outcome).toBe(
      WASTE_BALANCE_OUTCOME.INCLUDED
    )
    expect(row.classification).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.IGNORED,
      reasons: [{ code: 'OUTSIDE_ACCREDITATION_PERIOD' }],
      transactionAmount: 0
    })
  })

  it('replaces a stamped exclusion when the accreditation now covers the row', () => {
    const stampedAsIgnored = receivedRowState({
      classification: {
        outcome: WASTE_BALANCE_OUTCOME.IGNORED,
        reasons: [{ code: 'OUTSIDE_ACCREDITATION_PERIOD' }],
        transactionAmount: 0
      }
    })

    const [row] = reclassifyWasteRecordStates(
      [stampedAsIgnored],
      toYear(2026),
      contextWith(accreditationCovering('2026-01-01', '2027-01-01'))
    )

    expect(row.classification.outcome).toBe(WASTE_BALANCE_OUTCOME.INCLUDED)
    expect(row.classification.transactionAmount).toBe(9)
  })

  it('carries the row identity, type, template and data through untouched', () => {
    const state = receivedRowState()

    const [row] = reclassifyWasteRecordStates(
      [state],
      toYear(2026),
      contextWith(accreditationCovering('2026-01-01', '2027-01-01'))
    )

    expect(row.rowId).toBe('1001')
    expect(row.wasteRecordType).toBe(WASTE_RECORD_TYPE.RECEIVED)
    expect(row.processingType).toBe(PROCESSING_TYPES.REPROCESSOR_INPUT)
    expect(row.data).toEqual(state.data)
  })

  it('selects the table schema from the processing type the row reports under', () => {
    const covering = accreditationCovering('2026-01-01', '2027-01-01')

    const [underReprocessorInput] = reclassifyWasteRecordStates(
      [receivedRowState()],
      toYear(2026),
      contextWith(covering)
    )
    const [underExporter] = reclassifyWasteRecordStates(
      [receivedRowState({ processingType: PROCESSING_TYPES.EXPORTER })],
      toYear(2026),
      contextWith(covering)
    )

    expect(underReprocessorInput.classification.outcome).toBe(
      WASTE_BALANCE_OUTCOME.INCLUDED
    )
    expect(underExporter.classification.outcome).toBe(
      WASTE_BALANCE_OUTCOME.NOT_APPLICABLE
    )
  })

  it.each([2026, 2027])(
    "classifies a %s row on that year's template",
    (year) => {
      const [row] = reclassifyWasteRecordStates(
        [receivedRowState()],
        toYear(year),
        contextWith(accreditationCovering('2026-01-01', '2027-01-01'))
      )

      expect(row.classification.outcome).toBe(WASTE_BALANCE_OUTCOME.INCLUDED)
    }
  )

  it.each([
    ['a year with no templates', PROCESSING_TYPES.REPROCESSOR_INPUT, 2028],
    ['an unknown processing type', 'UNKNOWN', 2026]
  ])('is NOT_APPLICABLE for %s', (_name, processingType, year) => {
    const [row] = reclassifyWasteRecordStates(
      [receivedRowState({ processingType })],
      toYear(year),
      contextWith(accreditationCovering('2026-01-01', '2027-01-01'))
    )

    expect(row.classification.outcome).toBe(
      WASTE_BALANCE_OUTCOME.NOT_APPLICABLE
    )
  })

  it('is NOT_APPLICABLE for every row when the registration has no accreditation', () => {
    const [row] = reclassifyWasteRecordStates(
      [receivedRowState()],
      toYear(2026),
      contextWith(null)
    )

    expect(row.classification.outcome).toBe(
      WASTE_BALANCE_OUTCOME.NOT_APPLICABLE
    )
  })
})

/** @returns {WasteRecord} */
const fullPrecisionReceivedRecord = (tonnage) => ({
  rowId: '1001',
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: {
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
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
    TONNAGE_RECEIVED_FOR_RECYCLING: tonnage
  }
})

describe('reclassifying a projected row state preserves the stamped classification', () => {
  const reprocessorInputTableSchemas = getTemplate(
    toYear(2026),
    PROCESSING_TYPES.REPROCESSOR_INPUT
  ).tableSchemas
  const covering = accreditationCovering('2026-01-01', '2027-01-01')
  const fullPrecisionTonnage = 9.126789
  const twoDecimalPlaceTonnage = roundToTwoDecimalPlaces(fullPrecisionTonnage)

  it('drops precision below two decimal places when it stamps and stores the row', () => {
    const stamped = projectSummaryLogRowState(
      fullPrecisionReceivedRecord(fullPrecisionTonnage),
      reprocessorInputTableSchemas,
      covering,
      ORS_VALIDATION_DISABLED
    )

    expect(twoDecimalPlaceTonnage).not.toBe(fullPrecisionTonnage)
    expect(stamped.classification.transactionAmount).toBe(
      twoDecimalPlaceTonnage
    )
    expect(stamped.data.TONNAGE_RECEIVED_FOR_RECYCLING).toBe(
      twoDecimalPlaceTonnage
    )
  })

  it('reproduces the stamped classification when it re-derives from the stored two-decimal-place data', () => {
    const stamped = projectSummaryLogRowState(
      fullPrecisionReceivedRecord(fullPrecisionTonnage),
      reprocessorInputTableSchemas,
      covering,
      ORS_VALIDATION_DISABLED
    )

    const reclassified = reclassifyWasteRecordState(stamped, toYear(2026), {
      accreditation: covering,
      overseasSites: ORS_VALIDATION_DISABLED
    })

    expect(reclassified.classification).toEqual(stamped.classification)
  })
})
