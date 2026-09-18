import { describe, expect, it } from 'vitest'

import { diagnoseResubmissionFigures } from './diagnose-resubmission-figures.js'

/**
 * Builds one submitted-report submission with a figure-bearing recycling block.
 * @param {number} submissionNumber
 * @param {object} [overrides]
 */
const recyclingSubmission = (submissionNumber, overrides = {}) => ({
  submissionNumber,
  recyclingActivity: {
    suppliers: [
      { supplierName: 'Acme', tonnageReceived: 10 },
      { supplierName: 'Beta', tonnageReceived: 20 }
    ],
    totalTonnageReceived: 30,
    // manual-entry fields: excluded from the figure diff
    tonnageRecycled: 25,
    tonnageNotRecycled: 5
  },
  ...overrides
})

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
  it('classifies a resubmission with identical figures as identical', () => {
    const { reports, summary } = diagnoseResubmissionFigures([
      group({ submissions: [recyclingSubmission(1), recyclingSubmission(2)] })
    ])

    expect(summary).toMatchObject({
      resubmittedPeriods: 1,
      resubmissionPairs: 1,
      identicalPairs: 1,
      identicalIncludingOrder: 1,
      identicalOnlyAfterReorder: 0,
      changedPairs: 0
    })
    expect(reports).toEqual([
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2025,
        cadence: 'monthly',
        period: 3,
        fromSubmissionNumber: 1,
        toSubmissionNumber: 2,
        reorderOnly: false
      }
    ])
  })

  it('ignores changes to manual-entry fields when classifying', () => {
    const changedManualOnly = recyclingSubmission(2, {
      recyclingActivity: {
        suppliers: [
          { supplierName: 'Acme', tonnageReceived: 10 },
          { supplierName: 'Beta', tonnageReceived: 20 }
        ],
        totalTonnageReceived: 30,
        tonnageRecycled: 1, // operator revised a manual field
        tonnageNotRecycled: 29
      }
    })

    const { summary } = diagnoseResubmissionFigures([
      group({ submissions: [recyclingSubmission(1), changedManualOnly] })
    ])

    expect(summary.identicalPairs).toBe(1)
    expect(summary.changedPairs).toBe(0)
  })

  it('treats a pure supplier reordering as identical-only-after-reorder', () => {
    const reordered = recyclingSubmission(2, {
      recyclingActivity: {
        suppliers: [
          { supplierName: 'Beta', tonnageReceived: 20 },
          { supplierName: 'Acme', tonnageReceived: 10 }
        ],
        totalTonnageReceived: 30,
        tonnageRecycled: 25,
        tonnageNotRecycled: 5
      }
    })

    const { reports, summary } = diagnoseResubmissionFigures([
      group({ submissions: [recyclingSubmission(1), reordered] })
    ])

    expect(summary).toMatchObject({
      identicalPairs: 1,
      identicalIncludingOrder: 0,
      identicalOnlyAfterReorder: 1,
      changedPairs: 0
    })
    expect(reports[0].reorderOnly).toBe(true)
  })

  it('classifies a genuine figure change as changed', () => {
    const changed = recyclingSubmission(2, {
      recyclingActivity: {
        suppliers: [
          { supplierName: 'Acme', tonnageReceived: 11 }, // tonnage moved
          { supplierName: 'Beta', tonnageReceived: 20 }
        ],
        totalTonnageReceived: 31,
        tonnageRecycled: 25,
        tonnageNotRecycled: 6
      }
    })

    const { reports, summary } = diagnoseResubmissionFigures([
      group({ submissions: [recyclingSubmission(1), changed] })
    ])

    expect(summary).toMatchObject({ identicalPairs: 0, changedPairs: 1 })
    expect(reports).toEqual([])
  })

  it('treats a supplier identity change (not just tonnage) as changed', () => {
    const renamed = recyclingSubmission(2, {
      recyclingActivity: {
        suppliers: [
          { supplierName: 'Acme Ltd', tonnageReceived: 10 }, // name edited
          { supplierName: 'Beta', tonnageReceived: 20 }
        ],
        totalTonnageReceived: 30,
        tonnageRecycled: 25,
        tonnageNotRecycled: 5
      }
    })

    const { summary } = diagnoseResubmissionFigures([
      group({ submissions: [recyclingSubmission(1), renamed] })
    ])

    expect(summary.changedPairs).toBe(1)
  })

  it('treats an activity block appearing in only one submission as changed', () => {
    const gainedExport = recyclingSubmission(2, {
      recyclingActivity: recyclingSubmission(1).recyclingActivity,
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
      group({ submissions: [recyclingSubmission(1), gainedExport] })
    ])

    expect(summary.changedPairs).toBe(1)
  })

  it('compares every successive pair in a period with three submissions', () => {
    const { summary } = diagnoseResubmissionFigures([
      group({
        submissions: [
          recyclingSubmission(1),
          recyclingSubmission(2),
          recyclingSubmission(3, {
            recyclingActivity: {
              suppliers: [{ supplierName: 'Acme', tonnageReceived: 99 }],
              totalTonnageReceived: 99,
              tonnageRecycled: 99,
              tonnageNotRecycled: 0
            }
          })
        ]
      })
    ])

    expect(summary).toMatchObject({
      resubmittedPeriods: 1,
      resubmissionPairs: 2,
      identicalPairs: 1,
      changedPairs: 1
    })
  })

  it('sorts submissions by submissionNumber before pairing', () => {
    const { reports } = diagnoseResubmissionFigures([
      group({ submissions: [recyclingSubmission(2), recyclingSubmission(1)] })
    ])

    expect(reports[0]).toMatchObject({
      fromSubmissionNumber: 1,
      toSubmissionNumber: 2
    })
  })

  it('compares wasteSent and prn blocks, ignoring prn manual fields', () => {
    const withWasteAndPrn = (submissionNumber, prnOverrides = {}) => ({
      submissionNumber,
      wasteSent: {
        tonnageSentToReprocessor: 5,
        tonnageSentToExporter: 0,
        tonnageSentToAnotherSite: 2,
        finalDestinations: [{ recipientName: 'Dest', tonnageSentOn: 7 }]
      },
      prn: {
        issuedTonnage: 40,
        averagePricePerTonne: 12,
        totalRevenue: 480, // manual field: excluded
        freeTonnage: 3, // manual field: excluded
        ...prnOverrides
      }
    })

    const { summary } = diagnoseResubmissionFigures([
      group({
        submissions: [
          withWasteAndPrn(1),
          withWasteAndPrn(2, { totalRevenue: 999, freeTonnage: 9 })
        ]
      })
    ])

    expect(summary).toMatchObject({ identicalPairs: 1, changedPairs: 0 })
  })

  it('treats a prn with no averagePricePerTonne as identical across submissions', () => {
    const withPrn = (submissionNumber) => ({
      submissionNumber,
      prn: { issuedTonnage: 40 } // no averagePricePerTonne: defaults to null
    })

    const { summary } = diagnoseResubmissionFigures([
      group({ submissions: [withPrn(1), withPrn(2)] })
    ])

    expect(summary.identicalPairs).toBe(1)
  })

  it('classifies a prn issuedTonnage change as changed', () => {
    const { summary } = diagnoseResubmissionFigures([
      group({
        submissions: [
          { submissionNumber: 1, prn: { issuedTonnage: 40 } },
          { submissionNumber: 2, prn: { issuedTonnage: 41 } }
        ]
      })
    ])

    expect(summary.changedPairs).toBe(1)
  })

  it('returns zeroed summary for no groups', () => {
    const { reports, summary } = diagnoseResubmissionFigures([])

    expect(reports).toEqual([])
    expect(summary).toEqual({
      resubmittedPeriods: 0,
      resubmissionPairs: 0,
      identicalPairs: 0,
      identicalIncludingOrder: 0,
      identicalOnlyAfterReorder: 0,
      changedPairs: 0
    })
  })
})
