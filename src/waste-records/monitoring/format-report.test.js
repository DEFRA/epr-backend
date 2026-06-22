import { describe, it, expect } from 'vitest'

import { formatReport } from './format-report.js'

const cleanReconciliation = {
  registrationId: 'reg-1',
  accreditationId: 'acc-1',
  head: 'log-1',
  hasCommittedSubmission: true,
  hasRowStateData: true,
  rowStateCount: 2,
  committedRowCount: 2,
  creditTotal: { rowStates: 30, event: 30, drift: 0 },
  missingRows: [],
  extraRows: [],
  classificationDivergences: [],
  isClean: true
}

const census = {
  totalPartitions: 1,
  partitionsWithCommittedSubmission: 1,
  partitionsCovered: 1,
  partitionsMissingRowStateData: 0,
  cleanPartitions: 1,
  partitionsWithDiscrepancies: 0,
  totalMissingRows: 0,
  totalExtraRows: 0,
  partitionsWithCreditTotalDrift: 0,
  totalClassificationDivergences: 0,
  isEstateClean: true
}

describe('formatReport', () => {
  it('reports a clean estate as the green light for the flag flip', () => {
    const report = formatReport({
      reconciliations: [cleanReconciliation],
      census
    })

    expect(report).toContain('CLEAN')
    expect(report).toContain('Partitions covered: 1/1')
    expect(report).not.toContain('reg-1')
  })

  it('lists each partition with discrepancies and its specific issues', () => {
    const report = formatReport({
      reconciliations: [
        {
          ...cleanReconciliation,
          registrationId: 'reg-2',
          hasRowStateData: false,
          rowStateCount: 0,
          missingRows: [{ rowId: 'row-9', wasteRecordType: 'received' }],
          creditTotal: { rowStates: 5, event: 30, drift: -25 },
          isClean: false
        }
      ],
      census: {
        ...census,
        partitionsCovered: 0,
        partitionsMissingRowStateData: 1,
        cleanPartitions: 0,
        partitionsWithDiscrepancies: 1,
        totalMissingRows: 1,
        partitionsWithCreditTotalDrift: 1,
        isEstateClean: false
      }
    })

    expect(report).toContain('DISCREPANCIES FOUND')
    expect(report).toContain('reg-2')
    expect(report).toContain('acc-1')
    expect(report).toContain('no row-state data')
    expect(report).toContain('missing rows: 1')
    expect(report).toContain('creditTotal drift: -25')
  })

  it('labels a registered-only partition and lists extra rows on their own', () => {
    const report = formatReport({
      reconciliations: [
        {
          ...cleanReconciliation,
          registrationId: 'reg-3',
          accreditationId: null,
          extraRows: [{ rowId: 'row-x', wasteRecordType: 'received' }],
          isClean: false
        }
      ],
      census: {
        ...census,
        cleanPartitions: 0,
        partitionsWithDiscrepancies: 1,
        totalExtraRows: 1,
        isEstateClean: false
      }
    })

    expect(report).toContain(
      '- registration reg-3 (registered-only): extra rows: 1'
    )
  })

  it('notes classification divergences as a context-sensitive signal, separate from the verdict', () => {
    const report = formatReport({
      reconciliations: [
        {
          ...cleanReconciliation,
          classificationDivergences: [
            {
              rowId: 'row-1',
              wasteRecordType: 'received',
              rowStateIncluded: true,
              legacyIncluded: false
            }
          ]
        }
      ],
      census: { ...census, totalClassificationDivergences: 1 }
    })

    expect(report).toContain('CLEAN')
    expect(report).toContain(
      'Classification divergences (context-sensitive): 1'
    )
  })
})
