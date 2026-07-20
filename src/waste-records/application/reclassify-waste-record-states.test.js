import { describe, it, expect } from 'vitest'

import { reclassifyWasteRecordStates } from './reclassify-waste-record-states.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
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
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  accreditation,
  overseasSites: ORS_VALIDATION_DISABLED
})

describe('reclassifyWasteRecordStates', () => {
  it('classifies a row the accreditation now covers as included', () => {
    const [row] = reclassifyWasteRecordStates(
      [receivedRowState()],
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
      contextWith(accreditationCovering('2026-01-01', '2027-01-01'))
    )

    expect(row.classification.outcome).toBe(WASTE_BALANCE_OUTCOME.INCLUDED)
    expect(row.classification.transactionAmount).toBe(9)
  })

  it('carries the row identity, type and data through untouched', () => {
    const state = receivedRowState()

    const [row] = reclassifyWasteRecordStates(
      [state],
      contextWith(accreditationCovering('2026-01-01', '2027-01-01'))
    )

    expect(row.rowId).toBe('1001')
    expect(row.wasteRecordType).toBe(WASTE_RECORD_TYPE.RECEIVED)
    expect(row.data).toEqual(state.data)
  })

  it('does not mutate the states it is given', () => {
    const state = receivedRowState()

    reclassifyWasteRecordStates(
      [state],
      contextWith(accreditationCovering('2026-06-01', '2027-01-01'))
    )

    expect(state.classification.outcome).toBe(WASTE_BALANCE_OUTCOME.INCLUDED)
  })

  it('is NOT_APPLICABLE for every row when the registration has no accreditation', () => {
    const [row] = reclassifyWasteRecordStates(
      [receivedRowState()],
      contextWith(null)
    )

    expect(row.classification.outcome).toBe(
      WASTE_BALANCE_OUTCOME.NOT_APPLICABLE
    )
  })

  it('returns nothing for no states', () => {
    expect(
      reclassifyWasteRecordStates(
        [],
        contextWith(accreditationCovering('2026-01-01', '2027-01-01'))
      )
    ).toEqual([])
  })
})
