import { VERSION_STATUS } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { isRegistrationAccredited } from '#domain/organisations/registration-utils.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { MONTHS_PER_PERIOD } from '#reports/domain/cadence.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {PeriodicReport} from '#reports/repository/port.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {WasteRecord, WasteRecordVersion} from '#domain/waste-records/model.js' */
/** @import {WasteBalanceClassificationResult} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {ReportsRepository} from '#reports/repository/port.js' */

/**
 * @typedef {Object} PeriodStatusByChange
 * @property {number} tonnageDelta
 */

/**
 * @typedef {Object} PeriodStatus
 * @property {PeriodStatusByChange | null} added
 * @property {PeriodStatusByChange | null} adjusted
 */

/**
 * @typedef {Object} LoadsByPeriodStatus
 * @property {PeriodStatus | null} open
 * @property {PeriodStatus | null} closed
 */

const emptyChangeStatus = () => ({
  tonnageDelta: 0
})

const emptyStatus = () => ({
  added: emptyChangeStatus(),
  adjusted: emptyChangeStatus()
})

const emptyResult = () => ({
  open: emptyStatus(),
  closed: emptyStatus()
})

const emptyCounts = () => ({
  open: { added: 0, adjusted: 0 },
  closed: { added: 0, adjusted: 0 }
})

/**
 * Replaces empty buckets with null based on record counts.
 * A bucket is present (even with tonnageDelta: 0) when at least one
 * record was classified into it.
 */
const nullifyEmptyBuckets = (result, counts) => {
  const nullifyPeriod = (period, periodCounts) => {
    if (periodCounts.added === 0 && periodCounts.adjusted === 0) return null
    return {
      added: periodCounts.added > 0 ? period.added : null,
      adjusted: periodCounts.adjusted > 0 ? period.adjusted : null
    }
  }
  return /** @type {LoadsByPeriodStatus} */ ({
    open: nullifyPeriod(result.open, counts.open),
    closed: nullifyPeriod(result.closed, counts.closed)
  })
}

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

/** @param {ValidatedWasteRecord['record']} record */
const recordKey = (record) => `${record.type}:${record.rowId}`

/**
 * Applies the closed-wins rule: iterates reportingDateFields, and if
 * ANY date maps to a closed period the record is classified as closed.
 *
 * Returns null if no date fields have a value (record should be skipped).
 *
 * @param {Record<string, any>} data
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
 * @typedef {{ oldAmount: number, newAmount: number }} TransactionAmounts
 */

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
 * @param {{ open: { added: number, adjusted: number }, closed: { added: number, adjusted: number } }} params.counts
 */
const classifyRecord = ({
  wasteRecord,
  summaryLogId,
  closedPeriods,
  cadence,
  tableSchemas,
  transactionAmounts,
  existingRecordsMap,
  result,
  counts
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
  const { reportingDateFields } = schema
  const classify = (/** @type {Record<string, any>} */ data) =>
    classifyPeriodStatus(data, reportingDateFields, closedPeriods, cadence)

  if (status === 'added') {
    const period = classify(record.data)
    if (period) {
      result[period].added.tonnageDelta += amounts?.newAmount ?? 0
      counts[period].added++
    }
    return
  }

  classifyAdjustedRecord({
    key,
    amounts,
    classify,
    record,
    existingRecordsMap,
    result,
    counts
  })
}

/**
 * Classifies an adjusted record by its old and new period independently.
 *
 * @param {Object} params
 * @param {string} params.key
 * @param {TransactionAmounts} [params.amounts]
 * @param {(data: Record<string, any>) => 'open' | 'closed' | null} params.classify
 * @param {ValidatedWasteRecord['record']} params.record
 * @param {Map<string, WasteRecord>} params.existingRecordsMap
 * @param {LoadsByPeriodStatus} params.result
 * @param {{ open: { added: number, adjusted: number }, closed: { added: number, adjusted: number } }} params.counts
 */
const classifyAdjustedRecord = ({
  key,
  amounts,
  classify,
  record,
  existingRecordsMap,
  result,
  counts
}) => {
  const newPeriod = classify(record.data)

  const existing = existingRecordsMap.get(key)
  const oldPeriod = existing ? classify(existing.data) : null

  if (oldPeriod) {
    result[oldPeriod].adjusted.tonnageDelta -= amounts?.oldAmount ?? 0
    counts[oldPeriod].adjusted++
  }
  if (newPeriod) {
    result[newPeriod].adjusted.tonnageDelta += amounts?.newAmount ?? 0
    counts[newPeriod].adjusted++
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
  const counts = emptyCounts()

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
      result,
      counts
    })
  }

  return nullifyEmptyBuckets(result, counts)
}

/**
 * Computes the transaction amount for a record via classifyForWasteBalance.
 * Returns 0 if the result is not INCLUDED.
 *
 * @param {{ classifyForWasteBalance?: ((data: Record<string, any>, ...args: any[]) => WasteBalanceClassificationResult) | null } | null} schema
 * @param {Record<string, any>} data
 * @returns {number}
 */
const getTransactionAmount = (schema, data) => {
  const result = schema?.classifyForWasteBalance?.(data)
  return result?.outcome === ROW_OUTCOME.INCLUDED ? result.transactionAmount : 0
}

/**
 * Builds a map of "type:rowId" => tonnage impact for included waste-balance records.
 *
 * For added records, the impact is the full transaction amount.
 * For adjusted records, the impact is the delta: new amount minus old amount.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteBalanceRecords
 * @param {string} params.summaryLogId
 * @param {Map<string, WasteRecord>} params.existingRecordsMap
 * @param {(wasteRecordType: string) => import('#domain/summary-logs/table-schemas/index.js').TableSchema | null} params.findSchema
 * @returns {Map<string, TransactionAmounts>}
 */
export const buildTransactionAmounts = ({
  wasteBalanceRecords,
  summaryLogId,
  existingRecordsMap,
  findSchema
}) => {
  /** @type {Map<string, TransactionAmounts>} */
  const amounts = new Map()

  for (const { record, outcome } of wasteBalanceRecords) {
    const entry = computeRecordAmounts(
      record,
      outcome,
      summaryLogId,
      existingRecordsMap,
      findSchema
    )
    if (entry) {
      amounts.set(recordKey(record), entry)
    }
  }

  return amounts
}

/**
 * @param {ValidatedWasteRecord['record']} record
 * @param {string} outcome
 * @param {string} summaryLogId
 * @param {Map<string, WasteRecord>} existingRecordsMap
 * @param {(wasteRecordType: string) => import('#domain/summary-logs/table-schemas/index.js').TableSchema | null} findSchema
 * @returns {TransactionAmounts | null}
 */
const computeRecordAmounts = (
  record,
  outcome,
  summaryLogId,
  existingRecordsMap,
  findSchema
) => {
  const schema = findSchema(record.type)
  const isIncluded = outcome === ROW_OUTCOME.INCLUDED
  const newAmount = isIncluded ? getTransactionAmount(schema, record.data) : 0

  const lastVersion = /** @type {WasteRecordVersion} */ (record.versions.at(-1))
  const isAdjusted =
    lastVersion.summaryLog?.id === summaryLogId &&
    lastVersion.status === VERSION_STATUS.UPDATED

  if (!isAdjusted) {
    return newAmount !== 0 ? { oldAmount: 0, newAmount } : null
  }

  const existing = existingRecordsMap.get(recordKey(record))
  const oldAmount = existing ? getTransactionAmount(schema, existing.data) : 0

  return newAmount !== 0 || oldAmount !== 0 ? { oldAmount, newAmount } : null
}

/**
 * Computes loadsByPeriodStatus for a validated summary log.
 * Returns null if preconditions are not met (non-validated status, missing
 * registration/processingType/existingRecordsMap) or if the reports lookup fails.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[] | null} params.wasteRecords
 * @param {ValidatedWasteRecord[]} params.wasteBalanceRecords
 * @param {string} params.summaryLogId
 * @param {string} params.status
 * @param {Registration} [params.registration]
 * @param {string} [params.processingType]
 * @param {Map<string, WasteRecord>} [params.existingRecordsMap]
 * @param {ReportsRepository} params.reportsRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {string} params.loggingContext
 * @param {TypedLogger} params.logger
 * @param {typeof import('#domain/summary-logs/table-schemas/index.js').PROCESSING_TYPE_TABLES} params.processingTypeTables
 * @returns {Promise<LoadsByPeriodStatus | null>}
 */
export const computeLoadsByPeriodStatus = async ({
  wasteRecords,
  wasteBalanceRecords,
  summaryLogId,
  status,
  registration,
  processingType,
  existingRecordsMap,
  reportsRepository,
  organisationId,
  registrationId,
  loggingContext,
  logger,
  processingTypeTables
}) => {
  if (
    status !== SUMMARY_LOG_STATUS.VALIDATED ||
    !wasteRecords ||
    !registration ||
    !processingType ||
    !existingRecordsMap
  ) {
    return null
  }

  try {
    const submittedReports = await reportsRepository.findPeriodicReports({
      organisationId,
      registrationId
    })

    const transactionAmounts = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId,
      existingRecordsMap,
      findSchema: (wasteRecordType) => {
        const tables = processingTypeTables[processingType]
        return tables
          ? (Object.values(tables).find(
              (s) => s.wasteRecordType === wasteRecordType
            ) ?? null)
          : null
      }
    })

    return classifyByPeriodStatus({
      wasteRecords,
      summaryLogId,
      registration,
      submittedReports,
      tableSchemas: processingTypeTables[processingType],
      transactionAmounts,
      existingRecordsMap
    })
  } catch (err) {
    logger.warn({
      message: `Failed to classify loads by period status: ${loggingContext}`,
      err,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
    return null
  }
}
