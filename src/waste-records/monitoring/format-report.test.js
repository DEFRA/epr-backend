import { describe, it, expect } from 'vitest'

import { formatCensusSummary, formatLedgerDiagnostic } from './format-report.js'

const cleanReconciliation = {
  registrationId: 'reg-1',
  accreditationId: 'acc-1',
  head: 'log-1',
  hasCommittedSubmission: true,
  hasWasteRecordStateData: true,
  wasteRecordStateCount: 2,
  committedRowCount: 2,
  creditTotal: { wasteRecordStates: 30, event: 30, drift: 0 },
  missingRows: [],
  extraRows: [],
  classificationDivergences: [],
  isClean: true
}

const census = {
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
}

describe('formatCensusSummary', () => {
  it('renders the estate counts without any pass/fail verdict', () => {
    const summary = formatCensusSummary(census)

    expect(summary).toContain('ledgers: 4')
    expect(summary).toContain('with committed submission: 3')
    expect(summary).toContain('covered: 2')
    expect(summary).toContain('missing waste record state data: 1')
    expect(summary).toContain('with discrepancies: 2')
    expect(summary).toContain('missing rows: 2')
    expect(summary).toContain('extra rows: 1')
    expect(summary).toContain('creditTotal drift: 1')
    expect(summary).toContain('classification divergences: 1')
    expect(summary).not.toContain('VERDICT')
    expect(summary).not.toContain('CLEAN')
    expect(summary).not.toContain('green light')
  })
})

describe('formatLedgerDiagnostic', () => {
  it('labels the ledger and lists its missing rows, drift and coverage gap', () => {
    const line = formatLedgerDiagnostic({
      ...cleanReconciliation,
      registrationId: 'reg-2',
      hasWasteRecordStateData: false,
      wasteRecordStateCount: 0,
      missingRows: [{ rowId: 'row-9', wasteRecordType: 'received' }],
      creditTotal: { wasteRecordStates: 5, event: 30, drift: -25 },
      isClean: false
    })

    expect(line).toContain('registration reg-2 / accreditation acc-1')
    expect(line).toContain('head log-1')
    expect(line).toContain('no waste record state data')
    expect(line).toContain('missing rows: received:row-9')
    expect(line).toContain('creditTotal drift: -25')
    expect(line).toContain('waste record states 5 vs event 30')
  })

  it('labels a registered-only ledger and lists extra rows', () => {
    const line = formatLedgerDiagnostic({
      ...cleanReconciliation,
      registrationId: 'reg-3',
      accreditationId: null,
      extraRows: [{ rowId: 'row-x', wasteRecordType: 'received' }],
      isClean: false
    })

    expect(line).toContain('registration reg-3 (registered-only)')
    expect(line).toContain('extra rows: received:row-x')
  })

  it('shows each classification divergence with its reasons for human review', () => {
    const line = formatLedgerDiagnostic({
      ...cleanReconciliation,
      classificationDivergences: [
        {
          rowId: 'row-1',
          wasteRecordType: 'received',
          wasteRecordStateIncluded: false,
          legacyIncluded: true,
          reasons: [
            { code: 'ORS_NOT_APPROVED', field: 'overseasSiteId' },
            { code: 'PRN_ISSUED' }
          ]
        }
      ]
    })

    expect(line).toContain('classification divergences:')
    expect(line).toContain('received:row-1')
    expect(line).toContain('waste record state excluded, legacy included')
    expect(line).toContain('ORS_NOT_APPROVED (overseasSiteId)')
    expect(line).toContain('PRN_ISSUED')
  })

  it('records a divergence with no stated reasons rather than omitting it', () => {
    const line = formatLedgerDiagnostic({
      ...cleanReconciliation,
      classificationDivergences: [
        {
          rowId: 'row-2',
          wasteRecordType: 'received',
          wasteRecordStateIncluded: false,
          legacyIncluded: true,
          reasons: []
        }
      ]
    })

    expect(line).toContain('received:row-2')
    expect(line).toContain('waste record state excluded, legacy included')
    expect(line).toContain('reasons: none')
  })
})
