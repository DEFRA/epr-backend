import { VERSION_STATUS } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { isRegistrationAccredited } from '#domain/organisations/registration-utils.js'
import { MONTHS_PER_PERIOD } from '#reports/domain/cadence.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { recordKey } from './transaction-amounts.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {PeriodicReport} from '#reports/repository/port.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */
/** @import {TransactionAmounts} from './transaction-amounts.js' */

/**
 * @typedef {Object} LoadSummary
 * @property {number} count
 * @property {number} tonnageDelta
 */

/**
 * @typedef {Object} PeriodStatusByChange
 * @property {LoadSummary} included
 * @property {LoadSummary} excluded
 */

/**
 * @typedef {Object} PeriodStatus
 * @property {PeriodStatusByChange} added
 * @property {PeriodStatusByChange} adjusted
 */

/**
 * @typedef {Object} LoadsByPeriodStatus
 * @property {PeriodStatus} open
 * @property {PeriodStatus} closed
 */

const emptyChangeStatus = () => ({
  included: { count: 0, tonnageDelta: 0 },
  excluded: { count: 0, tonnageDelta: 0 }
})

const emptyStatus = () => ({
  added: emptyChangeStatus(),
  adjusted: emptyChangeStatus()
})

const emptyResult = () => ({
  open: emptyStatus(),
  closed: emptyStatus()
})

/**
 * Determines whether the record was added, adjusted, or unchanged
 * by this summary log.
 *
 * @param {ValidatedWasteRecord['record']} record
 * @param {string} summaryLogId
 * @returns {'added' | 'adjusted' | 'unchanged'}
 */
const determineRecordStatus = (record, summaryLogId) => {
  const lastVersion = record.versions.at(-1)
  if (lastVersion?.summaryLog?.id !== summaryLogId) {
    return 'unchanged'
  }
  return lastVersion.status === VERSION_STATUS.CREATED ? 'added' : 'adjusted'
}

/** Position of the year portion in an ISO date string (YYYY-MM-DD) */
const YEAR_END = 4
/** Start of the month portion in an ISO date string */
const MONTH_START = 5
const MONTH_END = 7

/**
 * Normalises a date value to an ISO string (YYYY-MM-DD or YYYY-MM).
 *
 * @param {string | Date} dateValue
 * @returns {string}
 */
const toIsoDate = (dateValue) =>
  dateValue instanceof Date
    ? dateValue.toISOString().slice(0, 10)
    : String(dateValue)

/**
 * @param {string | Date} dateValue
 * @returns {number}
 */
const extractMonth = (dateValue) => {
  const str = toIsoDate(dateValue)
  return Number(str.slice(MONTH_START, MONTH_END))
}

/**
 * @param {string | Date} dateValue
 * @returns {number}
 */
const extractYear = (dateValue) =>
  Number(toIsoDate(dateValue).slice(0, YEAR_END))

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
 * Builds a set of closed period keys from submitted reports.
 *
 * A period is closed when it has been submitted: either the current
 * report is in submitted status, or there is at least one previous
 * submission.
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
    if (!slots) {
      continue
    }
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
 * Applies the closed-wins rule: iterates reportingDateFields, and if
 * ANY date maps to a closed period the record is classified as closed.
 *
 * Returns null if no date fields have a value (record should be skipped).
 *
 * @param {Record<string, string | Date | null | undefined>} data
 * @param {string[]} reportingDateFields
 * @param {Set<string>} closedPeriods
 * @param {string} cadence
 * @returns {'open' | 'closed' | null}
 */
const classifyPeriodStatus = (
  data,
  reportingDateFields,
  closedPeriods,
  cadence
) => {
  let hasAnyDate = false

  for (const field of reportingDateFields) {
    const dateValue = data[field]
    if (!dateValue) {
      continue
    }

    hasAnyDate = true

    const period = monthToPeriod(extractMonth(dateValue), cadence)
    const periodKey = `${extractYear(dateValue)}:${period}`
    if (closedPeriods.has(periodKey)) {
      return 'closed'
    }
  }

  return hasAnyDate ? 'open' : null
}

/**
 * Classifies a single waste record into the appropriate period status bucket.
 *
 * For added records, classifies the new data into a single period.
 * For adjusted records, classifies both old and new data independently:
 * the old period gets -oldAmount, the new period gets +newAmount.
 * When old and new fall in the same period, this collapses to the net delta.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord} params.wasteRecord
 * @param {string} params.summaryLogId
 * @param {Set<string>} params.closedPeriods
 * @param {string} params.cadence
 * @param {Object<string, { reportingDateFields: string[] }>} params.tableSchemas
 * @param {Map<string, TransactionAmounts>} params.transactionAmounts
 * @param {Map<string, WasteRecord>} params.existingRecordsMap
 * @param {LoadsByPeriodStatus} params.result
 */
const classifyRecord = ({
  wasteRecord,
  summaryLogId,
  closedPeriods,
  cadence,
  tableSchemas,
  transactionAmounts,
  existingRecordsMap,
  result
}) => {
  const { record, outcome } = wasteRecord

  if (outcome === ROW_OUTCOME.IGNORED) {
    return
  }

  const status = determineRecordStatus(record, summaryLogId)
  if (status === 'unchanged') {
    return
  }

  const schema = tableSchemas[wasteRecord.tableName]
  if (!schema) {
    return
  }

  const key = recordKey(record)
  const amounts = transactionAmounts.get(key)
  const isIncluded = outcome === ROW_OUTCOME.INCLUDED
  const { reportingDateFields } = schema
  const classify = (
    /** @type {Record<string, string | Date | null | undefined>} */ data
  ) => classifyPeriodStatus(data, reportingDateFields, closedPeriods, cadence)

  if (status === 'added') {
    const period = classify(record.data)
    if (period) {
      const bucket = result[period].added
      if (isIncluded) {
        bucket.included.count++
        bucket.included.tonnageDelta += amounts?.newAmount ?? 0
      } else {
        bucket.excluded.count++
      }
    }
    return
  }

  classifyAdjustedRecord({
    key,
    amounts,
    isIncluded,
    classify,
    record,
    existingRecordsMap,
    result
  })
}

/**
 * Classifies an adjusted record by its old and new period independently.
 *
 * Applies -oldAmount to the old period and +newAmount to the new period.
 * When the period doesn't change, this naturally collapses to the net
 * delta (newAmount - oldAmount) in a single bucket.
 *
 * @param {Object} params
 * @param {string} params.key
 * @param {TransactionAmounts} [params.amounts]
 * @param {boolean} params.isIncluded
 * @param {(data: Record<string, string | Date | null | undefined>) => 'open' | 'closed' | null} params.classify
 * @param {ValidatedWasteRecord['record']} params.record
 * @param {Map<string, WasteRecord>} params.existingRecordsMap
 * @param {LoadsByPeriodStatus} params.result
 */
const classifyAdjustedRecord = ({
  key,
  amounts,
  isIncluded,
  classify,
  record,
  existingRecordsMap,
  result
}) => {
  const newPeriod = classify(record.data)

  const existing = existingRecordsMap.get(key)
  const oldPeriod = existing ? classify(existing.data) : null

  const countedPeriod = newPeriod ?? oldPeriod
  const target = isIncluded ? 'included' : 'excluded'

  if (oldPeriod) {
    result[oldPeriod].adjusted[target].tonnageDelta -= amounts?.oldAmount ?? 0
  }
  if (newPeriod) {
    result[newPeriod].adjusted[target].tonnageDelta += amounts?.newAmount ?? 0
  }
  if (countedPeriod) {
    result[countedPeriod].adjusted[target].count++
  }
}

/**
 * Classifies waste records by reporting period status (open/closed).
 *
 * Uses the closed-wins rule: if a record has multiple reporting date
 * fields and ANY of them maps to a closed period, the entire record
 * is classified as closed.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords
 * @param {string} params.summaryLogId
 * @param {Registration} params.registration
 * @param {PeriodicReport[]} params.submittedReports
 * @param {Object<string, { reportingDateFields: string[], wasteRecordType: string }>} params.tableSchemas
 * @param {Map<string, TransactionAmounts>} params.transactionAmounts
 * @param {Map<string, WasteRecord>} params.existingRecordsMap
 * @returns {LoadsByPeriodStatus}
 */
export const classifyByPeriodStatus = ({
  wasteRecords,
  summaryLogId,
  registration,
  submittedReports,
  tableSchemas,
  transactionAmounts,
  existingRecordsMap
}) => {
  const result = emptyResult()

  const cadence = isRegistrationAccredited(registration)
    ? 'monthly'
    : 'quarterly'

  const closedPeriods = buildClosedPeriods(submittedReports, cadence)

  for (const wasteRecord of wasteRecords) {
    classifyRecord({
      wasteRecord,
      summaryLogId,
      closedPeriods,
      cadence,
      tableSchemas,
      transactionAmounts,
      existingRecordsMap,
      result
    })
  }

  return result
}
