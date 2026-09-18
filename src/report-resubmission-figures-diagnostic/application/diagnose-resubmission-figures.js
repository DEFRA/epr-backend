/**
 * PAE-1985 spike: sizes how much auto-enforced resubmission is pointless — a
 * closed period the service forced an operator to resubmit (an SL re-upload
 * restated the period) whose reported figures are logically equivalent to the
 * previous submission, so the fresh submission carries no new information.
 *
 * Only auto-enforced resubmissions count. A pair is auto-enforced when the
 * earlier submission carries `resubmissionRequired.closedPeriodRestated` (set
 * by the SL-driven flagging path). Voluntary `operatorRequested` resubmissions
 * are user-inflicted, not something the service forced, so they are excluded
 * from the figure analysis.
 *
 * The comparison covers only summary-log and PRN activity data — the figures a
 * report presents. It deliberately excludes: provenance (`source`), lifecycle
 * metadata (`status`, `resubmissionRequired`), free-text and operator-entered
 * fields (`supportingInformation`, `tonnageRecycled`, `tonnageNotRecycled`,
 * `tonnageReceivedNotExported`, `prn.totalRevenue`, `prn.freeTonnage`), and
 * `prn.averagePricePerTonne` (computed from the operator-entered revenue, so
 * not activity data). `suppliers` and `finalDestinations` are persisted
 * unsorted (see defra-2hq4), so the diff is order-insensitive: logically
 * equivalent figures in a different row order still count as identical.
 */

/** @import { ReportResubmissionRequired, RecyclingActivity, ExportActivity, WasteSent, PrnData } from '#reports/repository/port.js' */

/**
 * @typedef {Object} ResubmissionSubmission
 * @property {number} submissionNumber
 * @property {ReportResubmissionRequired} [resubmissionRequired]
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
 */

/**
 * @typedef {Object} ResubmissionFiguresSummary
 * @property {number} resubmittedPeriods - periods with at least two submissions
 * @property {number} resubmissionPairs - every successive submission pair
 * @property {number} autoEnforcedResubmissions - pairs the service forced (the
 *   earlier submission was flagged `closedPeriodRestated`)
 * @property {number} identicalResubmissions - auto-enforced pairs whose figures
 *   are logically equivalent (the pointless ones)
 * @property {number} changedResubmissions - auto-enforced pairs whose figures
 *   genuinely changed
 */

/**
 * The summary-log and PRN activity subset of one submission — the figures a
 * report presents, without the free-text and operator-entered fields. Missing
 * activity blocks collapse to null so present-vs-absent is itself a difference.
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
  prn: submission.prn ? { issuedTonnage: submission.prn.issuedTonnage } : null
})

/**
 * Recursively serialises a value to a stable string with object keys sorted and
 * array elements ordered by their own serialisation, so the result is
 * insensitive to both key order and row order.
 *
 * @param {*} value
 * @returns {string}
 */
const canonicalise = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalise).sort().join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalise(value[key])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * True when the earlier submission of a pair was flagged for resubmission by
 * the SL-driven closed-period path, so the service forced the resubmission.
 *
 * @param {ResubmissionSubmission} previous
 */
const isAutoEnforced = (previous) =>
  Boolean(previous.resubmissionRequired?.closedPeriodRestated)

/**
 * True when two submissions present logically equivalent activity figures.
 *
 * @param {ResubmissionSubmission} previous
 * @param {ResubmissionSubmission} current
 */
const figuresAreEquivalent = (previous, current) =>
  canonicalise(extractFigures(previous)) ===
  canonicalise(extractFigures(current))

const emptySummary = () => ({
  resubmittedPeriods: 0,
  resubmissionPairs: 0,
  autoEnforcedResubmissions: 0,
  identicalResubmissions: 0,
  changedResubmissions: 0
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

    summary.resubmissionPairs += 1
    if (!isAutoEnforced(previous)) {
      continue
    }

    summary.autoEnforcedResubmissions += 1
    if (!figuresAreEquivalent(previous, current)) {
      summary.changedResubmissions += 1
      continue
    }

    summary.identicalResubmissions += 1
    reports.push({
      organisationId: periodGroup.organisationId,
      registrationId: periodGroup.registrationId,
      year: periodGroup.year,
      cadence: periodGroup.cadence,
      period: periodGroup.period,
      fromSubmissionNumber: previous.submissionNumber,
      toSubmissionNumber: current.submissionNumber
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
