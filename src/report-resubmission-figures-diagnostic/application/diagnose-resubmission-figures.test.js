import { describe, expect, it } from 'vitest'

import { diagnoseResubmissionFigures } from './diagnose-resubmission-figures.js'

const ENFORCED = {
  closedPeriodRestated: {
    uploadedAt: '2025-04-01T00:00:00.000Z',
    summaryLogId: 'sl-1'
  }
}

const OPERATOR_REQUESTED = {
  operatorRequested: {
    requestedAt: '2025-04-01T00:00:00.000Z',
    requestedBy: { id: 'u1', name: 'Op', position: 'Manager' }
  }
}

const recyclingBlock = (overrides = {}) => ({
  suppliers: [
    { supplierName: 'Acme', tonnageReceived: 10 },
    { supplierName: 'Beta', tonnageReceived: 20 }
  ],
  totalTonnageReceived: 30,
  // manual-entry fields: excluded from the figure diff
  tonnageRecycled: 25,
  tonnageNotRecycled: 5,
  ...overrides
})

/**
 * A submission. `enforced` (default true) makes it the auto-enforced trigger
 * for the pair it begins, by flagging it `closedPeriodRestated`.
 *
 * @param {number} submissionNumber
 * @param {*} [options]
 */
const submission = (submissionNumber, options = {}) => {
  const { enforced = true, resubmissionRequired, ...blocks } = options
  return {
    submissionNumber,
    resubmissionRequired:
      resubmissionRequired ?? (enforced ? ENFORCED : undefined),
    recyclingActivity: recyclingBlock(),
    ...blocks
  }
}

/**
 * @param {object} overrides
 * @returns {import('./diagnose-resubmission-figures.js').ResubmissionPeriodGroup}
 */
const group = (overrides) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  year: 2025,
  cadence: 'monthly',
  period: 3,
  submissions: [],
  ...overrides
})

describe('diagnoseResubmissionFigures', () => {
  it('flags an auto-enforced resubmission with identical figures', () => {
    const { reports, summary } = diagnoseResubmissionFigures([
      group({ submissions: [submission(1), submission(2)] })
    ])

    expect(summary).toEqual({
      resubmittedPeriods: 1,
      resubmissionPairs: 1,
      autoEnforcedResubmissions: 1,
      identicalResubmissions: 1,
      changedResubmissions: 0
    })
    expect(reports).toEqual([
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2025,
        cadence: 'monthly',
        period: 3,
        fromSubmissionNumber: 1,
        toSubmissionNumber: 2
      }
    ])
  })

  it('excludes a user-inflicted (operator-requested) resubmission', () => {
    const { reports, summary } = diagnoseResubmissionFigures([
      group({
        submissions: [
          submission(1, { resubmissionRequired: OPERATOR_REQUESTED }),
          submission(2)
        ]
      })
    ])

    expect(summary).toMatchObject({
      resubmissionPairs: 1,
      autoEnforcedResubmissions: 0,
      identicalResubmissions: 0
    })
    expect(reports).toEqual([])
  })

  it('excludes a pair whose earlier submission carries no resubmission flag', () => {
    const { summary } = diagnoseResubmissionFigures([
      group({
        submissions: [submission(1, { enforced: false }), submission(2)]
      })
    ])

    expect(summary).toMatchObject({
      resubmissionPairs: 1,
      autoEnforcedResubmissions: 0
    })
  })

  it('ignores changes to manual-entry fields when comparing figures', () => {
    const changedManualOnly = submission(2, {
      recyclingActivity: recyclingBlock({
        tonnageRecycled: 1,
        tonnageNotRecycled: 29
      })
    })

    const { summary } = diagnoseResubmissionFigures([
      group({ submissions: [submission(1), changedManualOnly] })
    ])

    expect(summary.identicalResubmissions).toBe(1)
    expect(summary.changedResubmissions).toBe(0)
  })

  it('treats a pure supplier reordering as identical', () => {
    const reordered = submission(2, {
      recyclingActivity: recyclingBlock({
        suppliers: [
          { supplierName: 'Beta', tonnageReceived: 20 },
          { supplierName: 'Acme', tonnageReceived: 10 }
        ]
      })
    })

    const { summary } = diagnoseResubmissionFigures([
      group({ submissions: [submission(1), reordered] })
    ])

    expect(summary.identicalResubmissions).toBe(1)
  })

  it('flags a genuine figure change as changed', () => {
    const changed = submission(2, {
      recyclingActivity: recyclingBlock({
        suppliers: [
          { supplierName: 'Acme', tonnageReceived: 11 }, // tonnage moved
          { supplierName: 'Beta', tonnageReceived: 20 }
        ],
        totalTonnageReceived: 31
      })
    })

    const { reports, summary } = diagnoseResubmissionFigures([
      group({ submissions: [submission(1), changed] })
    ])

    expect(summary).toMatchObject({
      identicalResubmissions: 0,
      changedResubmissions: 1
    })
    expect(reports).toEqual([])
  })

  it('treats a supplier identity change (not just tonnage) as changed', () => {
    const renamed = submission(2, {
      recyclingActivity: recyclingBlock({
        suppliers: [
          { supplierName: 'Acme Ltd', tonnageReceived: 10 }, // name edited
          { supplierName: 'Beta', tonnageReceived: 20 }
        ]
      })
    })

    const { summary } = diagnoseResubmissionFigures([
      group({ submissions: [submission(1), renamed] })
    ])

    expect(summary.changedResubmissions).toBe(1)
  })

  it('treats an activity block appearing in only one submission as changed', () => {
    const gainedExport = submission(2, {
      exportActivity: {
        overseasSites: [],
        unapprovedOverseasSites: [],
        totalTonnageExported: 5,
        tonnageRefusedAtDestination: 0,
        tonnageStoppedDuringExport: 0,
        totalTonnageRefusedOrStopped: 0,
        tonnageRepatriated: 0,
        tonnageReceivedNotExported: 0
      }
    })

    const { summary } = diagnoseResubmissionFigures([
      group({ submissions: [submission(1), gainedExport] })
    ])

    expect(summary.changedResubmissions).toBe(1)
  })

  it('compares wasteSent and prn issuedTonnage, ignoring derived averagePricePerTonne', () => {
    // No recyclingActivity: a waste-sent/prn-only report shape.
    const withWasteAndPrn = (submissionNumber, averagePricePerTonne) =>
      submission(submissionNumber, {
        recyclingActivity: undefined,
        wasteSent: {
          tonnageSentToReprocessor: 5,
          tonnageSentToExporter: 0,
          tonnageSentToAnotherSite: 2,
          finalDestinations: [{ recipientName: 'Dest', tonnageSentOn: 7 }]
        },
        prn: { issuedTonnage: 40, averagePricePerTonne, totalRevenue: 480 }
      })

    const { summary } = diagnoseResubmissionFigures([
      group({ submissions: [withWasteAndPrn(1, 12), withWasteAndPrn(2, 99)] })
    ])

    expect(summary.identicalResubmissions).toBe(1)
    expect(summary.changedResubmissions).toBe(0)
  })

  it('flags a prn issuedTonnage change as changed', () => {
    const { summary } = diagnoseResubmissionFigures([
      group({
        submissions: [
          submission(1, { prn: { issuedTonnage: 40 } }),
          submission(2, { prn: { issuedTonnage: 41 } })
        ]
      })
    ])

    expect(summary.changedResubmissions).toBe(1)
  })

  it('classifies every successive auto-enforced pair independently', () => {
    const { summary } = diagnoseResubmissionFigures([
      group({
        submissions: [
          submission(1),
          submission(2),
          submission(3, {
            recyclingActivity: recyclingBlock({
              suppliers: [{ supplierName: 'Acme', tonnageReceived: 99 }],
              totalTonnageReceived: 99
            })
          })
        ]
      })
    ])

    expect(summary).toMatchObject({
      resubmittedPeriods: 1,
      resubmissionPairs: 2,
      autoEnforcedResubmissions: 2,
      identicalResubmissions: 1,
      changedResubmissions: 1
    })
  })

  it('sorts submissions by submissionNumber before pairing', () => {
    const { reports } = diagnoseResubmissionFigures([
      group({ submissions: [submission(2), submission(1)] })
    ])

    expect(reports[0]).toMatchObject({
      fromSubmissionNumber: 1,
      toSubmissionNumber: 2
    })
  })

  it('returns zeroed summary for no groups', () => {
    const { reports, summary } = diagnoseResubmissionFigures([])

    expect(reports).toEqual([])
    expect(summary).toEqual({
      resubmittedPeriods: 0,
      resubmissionPairs: 0,
      autoEnforcedResubmissions: 0,
      identicalResubmissions: 0,
      changedResubmissions: 0
    })
  })
})
