import { VERSION_STATUS } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { isRegistrationAccredited } from '#domain/organisations/registration-utils.js'
import { MONTHS_PER_PERIOD } from '#reports/domain/cadence.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {PeriodicReport} from '#reports/repository/port.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */

/**
 * @typedef {Object} PeriodStatusBucket
 * @property {{ count: number, tonnes: number }} included
 * @property {{ count: number }} excluded
 */

/**
 * @typedef {Object} PeriodStatusByChange
 * @property {PeriodStatusBucket} added
 * @property {PeriodStatusBucket} adjusted
 */

/**
 * @typedef {Object} LoadsByPeriodStatus
 * @property {PeriodStatusByChange} open
 * @property {PeriodStatusByChange} closed
 */

const emptyBucket = () => ({
  included: { count: 0, tonnes: 0 },
  excluded: { count: 0 }
})

const emptyStatus = () => ({
  added: emptyBucket(),
  adjusted: emptyBucket()
})

/** @returns {LoadsByPeriodStatus} */
const emptyResult = () => ({
  open: emptyStatus(),
  closed: emptyStatus()
})

/**
 * Determines record status from the waste record's version history.
 *
 * @param {ValidatedWasteRecord['record']} record
 * @param {string} summaryLogId
 * @returns {'added' | 'adjusted' | 'unchanged'}
 */
const determineRecordStatus = (record, summaryLogId) => {
  const lastVersion = record.versions[record.versions.length - 1]
  if (lastVersion.summaryLog?.id !== summaryLogId) {
    return 'unchanged'
  }
  return lastVersion.status === VERSION_STATUS.CREATED ? 'added' : 'adjusted'
}

/**
 * Normalises a date value to an ISO string (YYYY-MM-DD or YYYY-MM).
 * Handles Date objects, ISO date strings, and YYYY-MM month strings.
 *
 * @param {string | Date} dateValue
 * @returns {string}
 */
const toIsoDate = (dateValue) =>
  dateValue instanceof Date
    ? dateValue.toISOString().slice(0, 10)
    : String(dateValue)

/**
 * Extracts the month number (1-12) from a date value.
 * Handles Date objects, YYYY-MM-DD and YYYY-MM formats.
 *
 * @param {string | Date} dateValue
 * @returns {number}
 */
const extractMonth = (dateValue) => {
  const str = toIsoDate(dateValue)
  return Number(str.slice(5, 7))
}

/**
 * Extracts the year from a date value.
 *
 * @param {string | Date} dateValue
 * @returns {number}
 */
const extractYear = (dateValue) => Number(toIsoDate(dateValue).slice(0, 4))

/**
 * Builds a set of closed period keys from submitted reports.
 *
 * A period is closed when a report has been submitted for it. That means
 * either the current report is in submitted status, or there is at least
 * one previous submission.
 *
 * Keys are formatted as "year:period" (e.g. "2026:1").
 *
 * @param {PeriodicReport[]} submittedReports
 * @param {string} cadence
 * @returns {Set<string>}
 */
const buildClosedPeriods = (submittedReports, cadence) => {
  const closed = new Set()
  for (const periodicReport of submittedReports) {
    const slots = periodicReport.reports[cadence]
    if (!slots) continue
    for (const [period, slot] of Object.entries(slots)) {
      const hasBeenSubmitted =
        slot.current?.status === REPORT_STATUS.SUBMITTED ||
        slot.previousSubmissions?.length > 0
      if (hasBeenSubmitted) {
        closed.add(`${periodicReport.year}:${period}`)
      }
    }
  }
  return closed
}

/**
 * Maps a month to its reporting period number.
 *
 * @param {number} month - 1-12
 * @param {string} cadence - 'monthly' or 'quarterly'
 * @returns {number}
 */
const monthToPeriod = (month, cadence) => {
  const monthsPerPeriod = MONTHS_PER_PERIOD[cadence]
  return Math.ceil(month / monthsPerPeriod)
}

/**
 * Classifies waste records by reporting period status (open/closed).
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords
 * @param {ValidatedWasteRecord[]} params.wasteBalanceRecords
 * @param {string} params.summaryLogId
 * @param {Registration} params.registration
 * @param {PeriodicReport[]} params.submittedReports
 * @param {Object<string, { reportingDateField: string, wasteRecordType: string }>} params.tableSchemas
 * @param {Map<string, number>} params.transactionAmounts - rowId => tonnage for included waste-balance records
 * @returns {LoadsByPeriodStatus}
 */
export const classifyByPeriodStatus = ({
  wasteRecords,
  wasteBalanceRecords,
  summaryLogId,
  registration,
  submittedReports,
  tableSchemas,
  transactionAmounts
}) => {
  const result = emptyResult()

  const cadence = isRegistrationAccredited(registration)
    ? 'monthly'
    : 'quarterly'

  const closedPeriods = buildClosedPeriods(submittedReports, cadence)

  const wasteBalanceRowIds = new Set(
    wasteBalanceRecords.map((wr) => wr.record.rowId)
  )

  for (const wasteRecord of wasteRecords) {
    const { record, outcome } = wasteRecord

    // Skip IGNORED records (outside accreditation date range)
    if (outcome === ROW_OUTCOME.IGNORED) continue

    // Skip unchanged records (not displayed on check page)
    const status = determineRecordStatus(record, summaryLogId)
    if (status === 'unchanged') continue

    // Look up the table schema to find the reporting date field
    const schema = tableSchemas[wasteRecord.tableName]
    if (!schema) continue

    const dateValue = record.data[schema.reportingDateField]
    if (!dateValue) continue

    const year = extractYear(dateValue)
    const month = extractMonth(dateValue)
    const period = monthToPeriod(month, cadence)
    const periodKey = `${year}:${period}`

    const periodStatus = closedPeriods.has(periodKey) ? 'closed' : 'open'
    const isIncluded =
      outcome === ROW_OUTCOME.INCLUDED && wasteBalanceRowIds.has(record.rowId)

    const bucket = result[periodStatus][status]

    if (isIncluded) {
      bucket.included.count += 1
      bucket.included.tonnes += transactionAmounts.get(record.rowId) ?? 0
    } else {
      bucket.excluded.count += 1
    }
  }

  return result
}
