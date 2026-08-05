/**
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { PeriodicReport } from '#reports/repository/port.js'
 */

/**
 * Finds the submission summary for a specific submission number within periodic
 * reports, checking both the current slot and previous submissions.
 * @param {PeriodicReport[]} periodicReports
 * @param {number} year
 * @param {Cadence} cadence
 * @param {number} period
 * @param {number} submissionNumber
 * @returns {import('#reports/repository/port.js').ReportSummary | null}
 */
export function findSubmissionByNumber(
  periodicReports,
  year,
  cadence,
  period,
  submissionNumber
) {
  const slot = periodicReports.find((pr) => pr.year === year)?.reports?.[
    cadence
  ]?.[period]
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
 * Finds the report ID for a specific submission number within periodic reports,
 * checking both the current slot and previous submissions.
 * @param {PeriodicReport[]} periodicReports
 * @param {number} year
 * @param {Cadence} cadence
 * @param {number} period
 * @param {number} submissionNumber
 * @returns {string|null}
 */
export function findReportIdBySubmissionNumber(
  periodicReports,
  year,
  cadence,
  period,
  submissionNumber
) {
  return (
    findSubmissionByNumber(
      periodicReports,
      year,
      cadence,
      period,
      submissionNumber
    )?.id ?? null
  )
}
