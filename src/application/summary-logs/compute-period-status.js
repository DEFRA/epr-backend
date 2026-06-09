import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { PROCESSING_TYPE_TABLES } from '#domain/summary-logs/table-schemas/index.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import {
  buildTransactionAmounts,
  classifyByPeriodStatus
} from './period-status.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */
/** @import {ReportsRepository} from '#reports/repository/port.js' */
/** @import {LoadsByPeriodStatus} from './period-status.js' */

/**
 * Computes loadsByPeriodStatus with graceful degradation.
 * Returns null if preconditions aren't met or the reports lookup fails.
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
 * @returns {Promise<LoadsByPeriodStatus | null>}
 */
export const computePeriodStatus = async ({
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
  logger
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

  const tableSchemas = PROCESSING_TYPE_TABLES[processingType]
  if (!tableSchemas) {
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
      findSchema: (wasteRecordType) =>
        Object.values(tableSchemas).find(
          (s) => s.wasteRecordType === wasteRecordType
        ) ?? null,
      context: {
        accreditation: registration.accreditation ?? null,
        overseasSites: ORS_VALIDATION_DISABLED
      }
    })

    return classifyByPeriodStatus({
      wasteRecords,
      summaryLogId,
      registration,
      submittedReports,
      tableSchemas,
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
