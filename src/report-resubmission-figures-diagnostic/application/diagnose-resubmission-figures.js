/**
 * PAE-1985 spike: sizes how much resubmission churn is figure-neutral — a
 * closed period resubmitted whose reported figures are identical to the
 * previous submission. It compares only the SL-derived figures a report
 * presents, deliberately excluding provenance (`source`), lifecycle metadata
 * (`status`, `resubmissionRequired`) and the operator-entered manual fields
 * (`tonnageRecycled`, `tonnageNotRecycled`, `tonnageReceivedNotExported`,
 * `prn.totalRevenue`, `prn.freeTonnage`, `supportingInformation`).
 *
 * `suppliers` and `finalDestinations` are persisted unsorted (see defra-2hq4),
 * so the diff is order-insensitive: a figure-identical pair whose only
 * difference is row order is still identical, and reported separately as
 * `identicalOnlyAfterReorder`.
 */

/** @import { RecyclingActivity, ExportActivity, WasteSent, PrnData } from '#reports/repository/port.js' */

/**
 * @typedef {Object} ResubmissionSubmission
 * @property {number} submissionNumber
 * @property {RecyclingActivity} [recyclingActivity]
 * @property {ExportActivity} [exportActivity]
 * @property {WasteSent} [wasteSent]
 * @property {PrnData} [prn]
 */

/**
 * @typedef {Object} ResubmissionPeriodGroup
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {number} year
 * @property {string} cadence
 * @property {number} period
 * @property {ResubmissionSubmission[]} submissions - all submitted reports for
 *   the period, at least two, in any order.
 */

/**
 * @typedef {Object} IdenticalResubmissionRow
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {number} year
 * @property {string} cadence
 * @property {number} period
 * @property {number} fromSubmissionNumber
 * @property {number} toSubmissionNumber
 * @property {boolean} reorderOnly - true when the pair is identical only after
 *   canonicalising array order (a pure row reordering).
 */

/**
 * @typedef {Object} ResubmissionFiguresSummary
 * @property {number} resubmittedPeriods
 * @property {number} resubmissionPairs
 * @property {number} identicalPairs
 * @property {number} identicalIncludingOrder
 * @property {number} identicalOnlyAfterReorder
 * @property {number} changedPairs
 */

/**
 * The SL-derived, figure-bearing subset of one submission — everything that
 * appears on the report except the manual-entry fields. Missing activity
 * blocks collapse to null so present-vs-absent is itself a difference.
 *
 * @param {ResubmissionSubmission} submission
 */
const extractFigures = (submission) => ({
  recyclingActivity: submission.recyclingActivity
    ? {
        suppliers: submission.recyclingActivity.suppliers,
        totalTonnageReceived: submission.recyclingActivity.totalTonnageReceived
      }
    : null,
  exportActivity: submission.exportActivity
    ? {
        overseasSites: submission.exportActivity.overseasSites,
        unapprovedOverseasSites:
          submission.exportActivity.unapprovedOverseasSites,
        totalTonnageExported: submission.exportActivity.totalTonnageExported,
        tonnageRefusedAtDestination:
          submission.exportActivity.tonnageRefusedAtDestination,
        tonnageStoppedDuringExport:
          submission.exportActivity.tonnageStoppedDuringExport,
        totalTonnageRefusedOrStopped:
          submission.exportActivity.totalTonnageRefusedOrStopped,
        tonnageRepatriated: submission.exportActivity.tonnageRepatriated
      }
    : null,
  wasteSent: submission.wasteSent
    ? {
        tonnageSentToReprocessor: submission.wasteSent.tonnageSentToReprocessor,
        tonnageSentToExporter: submission.wasteSent.tonnageSentToExporter,
        tonnageSentToAnotherSite: submission.wasteSent.tonnageSentToAnotherSite,
        finalDestinations: submission.wasteSent.finalDestinations
      }
    : null,
  prn: submission.prn
    ? {
        issuedTonnage: submission.prn.issuedTonnage,
        averagePricePerTonne: submission.prn.averagePricePerTonne ?? null
      }
    : null
})

/**
 * Recursively serialises a value to a stable string with object keys sorted.
 * When `sortArrays` is set, array elements are ordered by their own canonical
 * serialisation, making the result insensitive to row order.
 *
 * @param {*} value
 * @param {boolean} sortArrays
 * @returns {string}
 */
const serialise = (value, sortArrays) => {
  if (Array.isArray(value)) {
    const parts = value.map((item) => serialise(item, sortArrays))
    if (sortArrays) {
      parts.sort()
    }
    return `[${parts.join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${serialise(value[key], sortArrays)}`
      )
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * Compares one before/after pair of submissions.
 *
 * @param {ResubmissionSubmission} previous
 * @param {ResubmissionSubmission} current
 * @returns {{ identical: boolean, reorderOnly: boolean }}
 */
const classifyPair = (previous, current) => {
  const before = extractFigures(previous)
  const after = extractFigures(current)

  const strictEqual = serialise(before, false) === serialise(after, false)
  if (strictEqual) {
    return { identical: true, reorderOnly: false }
  }

  const canonicalEqual = serialise(before, true) === serialise(after, true)
  return { identical: canonicalEqual, reorderOnly: canonicalEqual }
}

const emptySummary = () => ({
  resubmittedPeriods: 0,
  resubmissionPairs: 0,
  identicalPairs: 0,
  identicalIncludingOrder: 0,
  identicalOnlyAfterReorder: 0,
  changedPairs: 0
})

/**
 * @param {ResubmissionPeriodGroup} periodGroup
 * @param {IdenticalResubmissionRow[]} reports - accumulator, mutated
 * @param {ResubmissionFiguresSummary} summary - accumulator, mutated
 */
const scanPeriod = (periodGroup, reports, summary) => {
  const ordered = [...periodGroup.submissions].sort(
    (a, b) => a.submissionNumber - b.submissionNumber
  )

  summary.resubmittedPeriods += 1

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]
    const current = ordered[index]
    const { identical, reorderOnly } = classifyPair(previous, current)

    summary.resubmissionPairs += 1
    if (!identical) {
      summary.changedPairs += 1
      continue
    }

    summary.identicalPairs += 1
    summary[
      reorderOnly ? 'identicalOnlyAfterReorder' : 'identicalIncludingOrder'
    ] += 1
    reports.push({
      organisationId: periodGroup.organisationId,
      registrationId: periodGroup.registrationId,
      year: periodGroup.year,
      cadence: periodGroup.cadence,
      period: periodGroup.period,
      fromSubmissionNumber: previous.submissionNumber,
      toSubmissionNumber: current.submissionNumber,
      reorderOnly
    })
  }
}

/**
 * @param {ResubmissionPeriodGroup[]} periodGroups
 * @returns {{ reports: IdenticalResubmissionRow[], summary: ResubmissionFiguresSummary }}
 */
export const diagnoseResubmissionFigures = (periodGroups) => {
  /** @type {IdenticalResubmissionRow[]} */
  const reports = []
  const summary = emptySummary()

  for (const periodGroup of periodGroups) {
    scanPeriod(periodGroup, reports, summary)
  }

  return { reports, summary }
}
