import { findPeriodSlot } from '#reports/domain/find-period-slot.js'

/**
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { PeriodicReport } from '#reports/repository/port.js'
 */

/**
 * Finds the submission summary for a specific submission number within a
 * periodic report, checking both the current slot and previous submissions.
 * @param {PeriodicReport | null} periodicReport
 * @param {Cadence} cadence
 * @param {number} period
 * @param {number} submissionNumber
 * @returns {import('#reports/repository/port.js').ReportSummary | null}
 */
export function findSubmissionByNumber(
  periodicReport,
  cadence,
  period,
  submissionNumber
) {
  const slot = findPeriodSlot(periodicReport, { cadence, period })
  if (!slot) {
    return null
  }
  if (slot.current?.submissionNumber === submissionNumber) {
    return slot.current
  }
  return (
    slot.previousSubmissions?.find(
      (s) => s.submissionNumber === submissionNumber
    ) ?? null
  )
}

/**
 * Finds the report ID for a specific submission number within a periodic
 * report, checking both the current slot and previous submissions.
 * @param {PeriodicReport | null} periodicReport
 * @param {Cadence} cadence
 * @param {number} period
 * @param {number} submissionNumber
 * @returns {string|null}
 */
export function findReportIdBySubmissionNumber(
  periodicReport,
  cadence,
  period,
  submissionNumber
) {
  return (
    findSubmissionByNumber(periodicReport, cadence, period, submissionNumber)
      ?.id ?? null
  )
}

/**
 * Whether any submission is stored for the period.
 * @param {PeriodicReport | null} periodicReport
 * @param {Cadence} cadence
 * @param {number} period
 * @returns {boolean}
 */
export function hasStoredSubmission(periodicReport, cadence, period) {
  const slot = findPeriodSlot(periodicReport, { cadence, period })
  return Boolean(slot?.current) || (slot?.previousSubmissions?.length ?? 0) > 0
}
