import { describe, it, expect } from 'vitest'

import { summariseCensus } from './census.js'

const reconciliation = (overrides = {}) => ({
  registrationId: 'reg',
  accreditationId: 'acc',
  head: 'log-1',
  hasCommittedSubmission: true,
  hasWasteRecordStateData: true,
  wasteRecordStateCount: 1,
  committedRowCount: 1,
  creditTotal: { wasteRecordStates: 10, event: 10, drift: 0 },
  missingRows: [],
  extraRows: [],
  classificationDivergences: [],
  isClean: true,
  ...overrides
})

describe('summariseCensus', () => {
  it('summarises an empty estate as clean with zero counts', () => {
    expect(summariseCensus([])).toEqual({
      totalLedgers: 0,
      ledgersWithCommittedSubmission: 0,
      ledgersCovered: 0,
      ledgersMissingSummaryLogRowStateData: 0,
      cleanLedgers: 0,
      ledgersWithDiscrepancies: 0,
      totalMissingRows: 0,
      totalExtraRows: 0,
      ledgersWithCreditTotalDrift: 0,
      totalClassificationDivergences: 0,
      isEstateClean: true
    })
  })

  it('aggregates coverage, cleanliness and discrepancy totals across the estate', () => {
    const reconciliations = [
      reconciliation(),
      reconciliation({
        hasWasteRecordStateData: false,
        wasteRecordStateCount: 0,
        isClean: false
      }),
      reconciliation({
        head: null,
        hasCommittedSubmission: false,
        hasWasteRecordStateData: false,
        wasteRecordStateCount: 0,
        committedRowCount: 0,
        isClean: true
      }),
      reconciliation({
        isClean: false,
        missingRows: [{ rowId: 'a' }, { rowId: 'b' }],
        extraRows: [{ rowId: 'c' }],
        creditTotal: { wasteRecordStates: 5, event: 10, drift: -5 },
        classificationDivergences: [{ rowId: 'a' }]
      })
    ]

    expect(summariseCensus(reconciliations)).toEqual({
      totalLedgers: 4,
      ledgersWithCommittedSubmission: 3,
      ledgersCovered: 2,
      ledgersMissingSummaryLogRowStateData: 1,
      cleanLedgers: 2,
      ledgersWithDiscrepancies: 2,
      totalMissingRows: 2,
      totalExtraRows: 1,
      ledgersWithCreditTotalDrift: 1,
      totalClassificationDivergences: 1,
      isEstateClean: false
    })
  })
})
