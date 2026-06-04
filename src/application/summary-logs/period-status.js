import { VERSION_STATUS } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import {
  PROCESSING_TYPE_TABLES,
  findSchemaForProcessingType
} from '#domain/summary-logs/table-schemas/index.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { isRegistrationAccredited } from '#domain/organisations/registration-utils.js'
import { MONTHS_PER_PERIOD } from '#reports/domain/cadence.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {PeriodicReport, ReportsRepository} from '#reports/repository/port.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */

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
  const lastVersion = record.versions.at(-1)
  if (lastVersion?.summaryLog?.id !== summaryLogId) {
    return 'unchanged'
  }
  return lastVersion.status === VERSION_STATUS.CREATED ? 'added' : 'adjusted'
}

/** Position of the year portion in an ISO date string (YYYY-MM-DD) */
const YEAR_END = 4
/** Position of the month portion in an ISO date string */
const MONTH_START = 5
const MONTH_END = 7

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
 *
 * @param {string | Date} dateValue
 * @returns {number}
 */
const extractMonth = (dateValue) => {
  const str = toIsoDate(dateValue)
  return Number(str.slice(MONTH_START, MONTH_END))
}

/**
 * Extracts the year from a date value.
 *
 * @param {string | Date} dateValue
 * @returns {number}
 */
const extractYear = (dateValue) =>
  Number(toIsoDate(dateValue).slice(0, YEAR_END))

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

/** @param {ValidatedWasteRecord['record']} record */
const recordKey = (record) => `${record.type}:${record.rowId}`

/**
 * Classifies a single waste record into the appropriate period status bucket.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord} params.wasteRecord
 * @param {string} params.summaryLogId
 * @param {Set<string>} params.closedPeriods
 * @param {Set<string>} params.wasteBalanceRowKeys
 * @param {string} params.cadence
 * @param {Object<string, { reportingDateField: string }>} params.tableSchemas
 * @param {Map<string, number>} params.transactionAmounts
 * @param {LoadsByPeriodStatus} params.result
 */
const classifyRecord = ({
  wasteRecord,
  summaryLogId,
  closedPeriods,
  wasteBalanceRowKeys,
  cadence,
  tableSchemas,
  transactionAmounts,
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

  const dateValue = record.data[schema.reportingDateField]
  if (!dateValue) {
    return
  }

  const period = monthToPeriod(extractMonth(dateValue), cadence)
  const periodKey = `${extractYear(dateValue)}:${period}`
  const periodStatus = closedPeriods.has(periodKey) ? 'closed' : 'open'

  const key = recordKey(record)
  const isIncluded =
    outcome === ROW_OUTCOME.INCLUDED && wasteBalanceRowKeys.has(key)

  const bucket = result[periodStatus][status]

  if (isIncluded) {
    bucket.included.count += 1
    bucket.included.tonnes += transactionAmounts.get(key) ?? 0
  } else {
    bucket.excluded.count += 1
  }
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
 * @param {Map<string, number>} params.transactionAmounts - "type:rowId" => waste balance impact
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

  const wasteBalanceRowKeys = new Set(
    wasteBalanceRecords.map((wr) => recordKey(wr.record))
  )

  for (const wasteRecord of wasteRecords) {
    classifyRecord({
      wasteRecord,
      summaryLogId,
      closedPeriods,
      wasteBalanceRowKeys,
      cadence,
      tableSchemas,
      transactionAmounts,
      result
    })
  }

  return result
}

/**
 * Computes the transaction amount for a record's data via classifyForWasteBalance.
 * Returns 0 if the record is not INCLUDED.
 *
 * @param {import('#domain/summary-logs/table-schemas/index.js').TableSchema | null} schema
 * @param {Record<string, any>} data
 * @param {Registration} registration
 * @returns {number}
 */
const getTransactionAmount = (schema, data, registration) => {
  const result = schema?.classifyForWasteBalance?.(data, {
    accreditation: registration.accreditation,
    overseasSites: ORS_VALIDATION_DISABLED
  })
  return result?.outcome === ROW_OUTCOME.INCLUDED ? result.transactionAmount : 0
}

/**
 * Builds a map of "type:rowId" => waste balance impact for included waste-balance records.
 *
 * For added records, the impact is the full transaction amount.
 * For adjusted records, the impact is the delta: new amount minus old amount.
 *
 * @param {ValidatedWasteRecord[]} wasteBalanceRecords
 * @param {Registration} registration
 * @param {string} processingType
 * @param {string} summaryLogId
 * @param {Map<string, WasteRecord>} existingRecordsMap
 * @returns {Map<string, number>}
 */
export const buildTransactionAmounts = (
  wasteBalanceRecords,
  registration,
  processingType,
  summaryLogId,
  existingRecordsMap
) => {
  const amounts = new Map()
  const included = wasteBalanceRecords.filter(
    ({ outcome }) => outcome === ROW_OUTCOME.INCLUDED
  )
  for (const { record } of included) {
    const schema = findSchemaForProcessingType(processingType, record.type)
    const newAmount = getTransactionAmount(schema, record.data, registration)
    if (newAmount === 0) {
      continue
    }

    const key = `${record.type}:${record.rowId}`
    const lastVersion = record.versions.at(-1)
    const isAdjusted =
      lastVersion.summaryLog?.id === summaryLogId &&
      lastVersion.status === VERSION_STATUS.UPDATED

    if (isAdjusted) {
      const existing = existingRecordsMap.get(key)
      const oldAmount = existing
        ? getTransactionAmount(schema, existing.data, registration)
        : 0
      amounts.set(key, newAmount - oldAmount)
    } else {
      amounts.set(key, newAmount)
    }
  }
  return amounts
}

/**
 * Computes loadsByPeriodStatus for a validated summary log.
 * Returns null if the reports lookup fails.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords
 * @param {ValidatedWasteRecord[]} params.wasteBalanceRecords
 * @param {string} params.summaryLogId
 * @param {Registration} params.registration
 * @param {string} params.processingType
 * @param {Map<string, WasteRecord>} params.existingRecordsMap
 * @param {ReportsRepository} params.reportsRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {string} params.loggingContext
 * @param {TypedLogger} params.logger
 * @returns {Promise<LoadsByPeriodStatus | null>}
 */
export const computeLoadsByPeriodStatus = async ({
  wasteRecords,
  wasteBalanceRecords,
  summaryLogId,
  registration,
  processingType,
  existingRecordsMap,
  reportsRepository,
  organisationId,
  registrationId,
  loggingContext,
  logger
}) => {
  try {
    const submittedReports = await reportsRepository.findPeriodicReports({
      organisationId,
      registrationId
    })

    const transactionAmounts = buildTransactionAmounts(
      wasteBalanceRecords,
      registration,
      processingType,
      summaryLogId,
      existingRecordsMap
    )

    return classifyByPeriodStatus({
      wasteRecords,
      wasteBalanceRecords,
      summaryLogId,
      registration,
      submittedReports,
      tableSchemas: PROCESSING_TYPE_TABLES[processingType],
      transactionAmounts
    })
  } catch (err) {
    logger.warn({
      message: `Failed to classify loads by period status: ${loggingContext}`,
      err,
      event: {
        category: 'server',
        action: 'process_failure'
      }
    })
    return null
  }
}
