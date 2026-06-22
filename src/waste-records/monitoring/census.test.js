import { describe, it, expect } from 'vitest'

import { summariseCensus } from './census.js'

const reconciliation = (overrides = {}) => ({
  registrationId: 'reg',
  accreditationId: 'acc',
  head: 'log-1',
  hasCommittedSubmission: true,
  hasRowStateData: true,
  rowStateCount: 1,
  committedRowCount: 1,
  creditTotal: { rowStates: 10, event: 10, drift: 0 },
  missingRows: [],
  extraRows: [],
  classificationDivergences: [],
  isClean: true,
  ...overrides
})

describe('summariseCensus', () => {
  it('summarises an empty estate as clean with zero counts', () => {
    expect(summariseCensus([])).toEqual({
      totalPartitions: 0,
      partitionsWithCommittedSubmission: 0,
      partitionsCovered: 0,
      partitionsMissingRowStateData: 0,
      cleanPartitions: 0,
      partitionsWithDiscrepancies: 0,
      totalMissingRows: 0,
      totalExtraRows: 0,
      partitionsWithCreditTotalDrift: 0,
      totalClassificationDivergences: 0,
      isEstateClean: true
    })
  })

  it('aggregates coverage, cleanliness and discrepancy totals across the estate', () => {
    const reconciliations = [
      reconciliation(),
      reconciliation({
        hasRowStateData: false,
        rowStateCount: 0,
        isClean: false
      }),
      reconciliation({
        head: null,
        hasCommittedSubmission: false,
        hasRowStateData: false,
        rowStateCount: 0,
        committedRowCount: 0,
        isClean: true
      }),
      reconciliation({
        isClean: false,
        missingRows: [{ rowId: 'a' }, { rowId: 'b' }],
        extraRows: [{ rowId: 'c' }],
        creditTotal: { rowStates: 5, event: 10, drift: -5 },
        classificationDivergences: [{ rowId: 'a' }]
      })
    ]

    expect(summariseCensus(reconciliations)).toEqual({
      totalPartitions: 4,
      partitionsWithCommittedSubmission: 3,
      partitionsCovered: 2,
      partitionsMissingRowStateData: 1,
      cleanPartitions: 2,
      partitionsWithDiscrepancies: 2,
      totalMissingRows: 2,
      totalExtraRows: 1,
      partitionsWithCreditTotalDrift: 1,
      totalClassificationDivergences: 1,
      isEstateClean: false
    })
  })
})
