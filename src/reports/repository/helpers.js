import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { randomUUID } from 'node:crypto'

/** @type {Record<string, string>} */
export const STATUS_TO_SLOT = {
  [REPORT_STATUS.IN_PROGRESS]: 'created',
  [REPORT_STATUS.READY_TO_SUBMIT]: 'ready',
  [REPORT_STATUS.SUBMITTED]: 'submitted'
}

/**
 * Groups `arr` by `keyFn`, then maps each group through `valueFn`.
 *
 * @template T, V
 * @param {T[]} arr
 * @param {(item: T) => string} keyFn
 * @param {(group: T[]) => V} valueFn
 * @returns {Record<string, V>}
 */
const groupTransform = (arr, keyFn, valueFn) =>
  Object.fromEntries(
    Object.entries(Object.groupBy(arr, keyFn)).map(([k, v]) => [
      k,
      valueFn(/** @type {T[]} */ (v))
    ])
  )

/**
 * Groups raw report documents into the PeriodicReport nested structure.
 *
 * Sorts by submissionNumber descending so the latest submission is processed first.
 * The highest-numbered report becomes `current`;
 * all previous submitted reports are collected in `previousSubmissions`.
 *
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {Object[]} docs
 * @returns {import('./port.js').PeriodicReport[]}
 */
export const groupAsPeriodicReports = (
  organisationId,
  registrationId,
  docs
) => {
  const toSubmission = ({ id, submissionNumber, status }) => ({
    id,
    status: status.currentStatus,
    submissionNumber,
    submittedAt: status.submitted?.at ?? null,
    submittedBy: status.submitted?.by ?? null
  })

  const buildPeriodSummary = (periodDocs) => {
    const [first, ...rest] = [...periodDocs].sort(
      (a, b) => b.submissionNumber - a.submissionNumber
    )
    const { startDate, endDate, dueDate } = first
    return {
      startDate,
      endDate,
      dueDate,
      current: toSubmission(first),
      previousSubmissions: rest.map(toSubmission)
    }
  }

  const byYear = Object.groupBy(docs, (doc) => doc.year)
  return Object.entries(byYear).map(([year, yearDocs]) => ({
    organisationId,
    registrationId,
    year: Number(year),
    reports: groupTransform(
      /** @type {Object[]} */ (yearDocs),
      (doc) => doc.cadence,
      (cadenceDocs) =>
        groupTransform(cadenceDocs, (doc) => doc.period, buildPeriodSummary)
    )
  }))
}

/**
 * Groups raw reports and transforms them into periodic reports.
 * @param {import('./port.js').Report[]} reports
 * @returns {import('./port.js').PeriodicReport[]}
 */
export const transformToPeriodicReports = (reports) => {
  const grouped = reports.reduce((acc, report) => {
    const key = `${report.organisationId}::${report.registrationId}`
    acc[key] ??= []
    acc[key].push(report)
    return acc
  }, {})

  return Object.values(grouped).flatMap((group) => {
    const { organisationId, registrationId } = group[0]
    return groupAsPeriodicReports(organisationId, registrationId, group)
  })
}

/** @type {import('./port.js').Report} */
/**
 * @param {import('./port.js').CreateReportParams} validatedParams
 * @returns {import('./port.js').Report}
 */
export const prepareCreateReportParams = (validatedParams) => {
  const { changedBy, ...reportCreateParams } = validatedParams

  const providedReportParams = Object.fromEntries(
    Object.entries(reportCreateParams).filter(
      ([_, value]) => value !== undefined
    )
  )
  const now = new Date().toISOString()
  const reportId = randomUUID()

  return /** @type {import('./port.js').Report} */ ({
    id: reportId,
    version: 1,
    schemaVersion: 1,
    ...providedReportParams,
    status: {
      currentStatus: REPORT_STATUS.IN_PROGRESS,
      currentStatusAt: now,
      [STATUS_TO_SLOT[REPORT_STATUS.IN_PROGRESS]]: { at: now, by: changedBy },
      history: [{ status: REPORT_STATUS.IN_PROGRESS, at: now, by: changedBy }]
    }
  })
}
