import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { isNil } from '#common/helpers/is-nil.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import {
  findSchemaForProcessingType,
  PROCESSING_TYPE_TABLES
} from '#domain/summary-logs/table-schemas/index.js'
import { isRegistrationAccredited } from '#domain/organisations/registration-utils.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { classifyByPeriodStatus } from './period-status.js'
import {
  countByValidity,
  countByWasteBalanceInclusion,
  countByWasteRecordType,
  mergeLoads
} from './load-counts.js'

/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */
/** @typedef {import('./load-counts.js').Loads} Loads */
/** @typedef {import('./period-status.js').LoadsByReportingPeriod} LoadsByReportingPeriod */
/** @typedef {string} ProcessingType */
/** @typedef {import('#reports/repository/port.js').ReportsRepository} ReportsRepository */

/**
 * Filters waste records to only those from tables that participate in waste balance.
 *
 * @param {ValidatedWasteRecord[] | null} wasteRecords
 * @param {string} processingType
 * @returns {ValidatedWasteRecord[]}
 */
export const filterWasteBalanceRecords = (wasteRecords, processingType) =>
  wasteRecords?.filter((wr) => {
    const schema = findSchemaForProcessingType(processingType, wr.record.type)
    return !isNil(schema?.classifyForWasteBalance)
  }) ?? []

/**
 * Computes all load classifications for validated summary logs.
 *
 * @param {Object} params
 * @param {string} params.status - Summary log status after validation
 * @param {ValidatedWasteRecord[] | null} params.wasteRecords - All waste records
 * @param {ValidatedWasteRecord[]} params.wasteBalanceRecords - Waste-balance-eligible records
 * @param {string} params.summaryLogId
 * @param {ProcessingType} params.processingType
 * @param {import('#reports/repository/port.js').PeriodicReport[]} params.periodicReports
 * @param {Registration} [params.registration]
 * @param {Map<string, WasteRecord>} [params.existingRecordsMap]
 * @returns {{ loads: Loads | null, loadsByWasteRecordType: import('./load-counts.js').LoadsByWasteRecordType | null, loadsByReportingPeriod: LoadsByReportingPeriod | null }}
 */
export const classifyLoads = ({
  processingType,
  status,
  summaryLogId,
  wasteBalanceRecords,
  wasteRecords,
  periodicReports,
  registration,
  existingRecordsMap
}) => {
  if (status !== SUMMARY_LOG_STATUS.VALIDATED || !wasteRecords) {
    return {
      loads: null,
      loadsByWasteRecordType: null,
      loadsByReportingPeriod: null
    }
  }

  const loads = mergeLoads(
    countByValidity({ wasteRecords, summaryLogId }),
    countByWasteBalanceInclusion({
      wasteRecords: wasteBalanceRecords,
      summaryLogId
    })
  )

  const tableSchemas = PROCESSING_TYPE_TABLES[processingType]

  const loadsByWasteRecordType = countByWasteRecordType({
    wasteRecords,
    wasteBalanceRecords,
    summaryLogId,
    tableSchemas
  })

  /* v8 ignore start -- defensive guard: all three are always set when status is VALIDATED */
  const loadsByReportingPeriod =
    registration && existingRecordsMap && tableSchemas
      ? classifyByPeriodStatus({
          wasteRecords,
          existingRecordsMap,
          periodicReports,
          cadence: isRegistrationAccredited(registration)
            ? CADENCE.monthly
            : CADENCE.quarterly,
          summaryLogId,
          tableSchemas,
          classificationContext: {
            accreditation: registration.accreditation ?? null,
            overseasSites: ORS_VALIDATION_DISABLED
          }
        })
      : null
  /* v8 ignore stop */

  return { loads, loadsByWasteRecordType, loadsByReportingPeriod }
}

/**
 * Fetches periodic reports for the validated summary log, swallowing errors.
 *
 * @param {Object} params
 * @param {Registration} [params.registration]
 * @param {string} params.status
 * @param {SubmittedSummaryLog} params.summaryLog
 * @param {ReportsRepository} params.reportsRepository
 * @param {string} params.loggingContext
 * @param {TypedLogger} params.logger
 * @returns {Promise<import('#reports/repository/port.js').PeriodicReport[]>}
 */
export const fetchPeriodicReportsSafe = async ({
  registration,
  status,
  summaryLog,
  reportsRepository,
  loggingContext,
  logger
}) => {
  try {
    if (registration && status === SUMMARY_LOG_STATUS.VALIDATED) {
      return await reportsRepository.findPeriodicReports({
        organisationId: summaryLog.organisationId,
        registrationId: summaryLog.registrationId
      })
    }
  } catch (err) {
    logger.warn({
      message: `Failed to fetch periodic reports: ${loggingContext}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      },
      err
    })
  }
  return []
}
