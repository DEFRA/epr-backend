import { isNil } from '#common/helpers/is-nil.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { isRegistrationAccredited } from '#domain/organisations/registration-utils.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { getOperatorCategory } from '#reports/domain/operator-category.js'
import { classifyByPeriodStatus } from './period-status.js'
import { classifyRecordChanges } from './classify-record-changes.js'
import {
  countByValidity,
  countByWasteBalanceInclusion,
  mergeLoads
} from './load-counts.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {WasteRecordState} from '#waste-records/application/read-summary-log-row-states.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */
/** @import {Loads} from '#domain/summary-logs/loads-schema.js' */
/** @import {LoadsByReportingPeriod} from '#domain/summary-logs/loads-by-period-status-schema.js' */
/** @import {TableSchema} from '#domain/summary-logs/table-schemas/index.js' */
/** @import {ClassificationContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @typedef {import('#reports/application/report-service.js').ReportsService} ReportsService */

/**
 * Filters waste records to only those from tables that participate in waste balance.
 *
 * @param {ValidatedWasteRecord[] | null} wasteRecords
 * @param {Record<string, TableSchema> | undefined} tableSchemas - The template's table schemas, absent when validation stopped before choosing it
 * @returns {ValidatedWasteRecord[]}
 */
export const filterWasteBalanceRecords = (wasteRecords, tableSchemas) =>
  wasteRecords?.filter(
    (wr) => !isNil(tableSchemas?.[wr.tableName]?.classifyForWasteBalance)
  ) ?? []

/**
 * Computes all load classifications for validated summary logs.
 *
 * @param {Object} params
 * @param {string} params.status - Summary log status after validation
 * @param {ValidatedWasteRecord[] | null} params.wasteRecords - All waste records
 * @param {ValidatedWasteRecord[]} params.wasteBalanceRecords - Waste-balance-eligible records
 * @param {Record<string, TableSchema> | undefined} params.tableSchemas - The template's table schemas
 * @param {import('#reports/repository/port.js').PeriodicReport[]} params.periodicReports
 * @param {ClassificationContext} [params.classificationContext]
 * @param {Registration} [params.registration]
 * @param {Map<string, WasteRecordState>} [params.submittedRowStatesByKey]
 * @returns {{ loads: Loads | null, loadsByReportingPeriod: LoadsByReportingPeriod | null }}
 */
export const classifyLoads = ({
  tableSchemas,
  status,
  wasteBalanceRecords,
  wasteRecords,
  periodicReports,
  classificationContext,
  registration,
  submittedRowStatesByKey
}) => {
  if (
    status !== SUMMARY_LOG_STATUS.VALIDATED ||
    !wasteRecords ||
    !submittedRowStatesByKey ||
    !classificationContext
  ) {
    return {
      loads: null,
      loadsByReportingPeriod: null
    }
  }

  const recordChanges = classifyRecordChanges({
    wasteRecords,
    submittedRowStatesByKey,
    ...classificationContext
  })

  const loads = mergeLoads(
    countByValidity({ wasteRecords, recordChanges }),
    countByWasteBalanceInclusion({
      wasteRecords: wasteBalanceRecords,
      recordChanges
    })
  )

  /* v8 ignore start -- defensive guard: registration and tableSchemas are always set when status is VALIDATED */
  const loadsByReportingPeriod =
    registration && tableSchemas
      ? classifyByPeriodStatus({
          wasteRecords,
          submittedRowStatesByKey,
          recordChanges,
          periodicReports,
          cadence: isRegistrationAccredited(registration)
            ? CADENCE.monthly
            : CADENCE.quarterly,
          tableSchemas,
          operatorCategory: getOperatorCategory(registration),
          classificationContext
        })
      : null
  /* v8 ignore stop */

  return { loads, loadsByReportingPeriod }
}

/**
 * Fetches periodic reports for the validated summary log.
 *
 * The period-status split is core flow once the feature is live, so a failure
 * here must propagate: the queue consumer's onFailure marks the log
 * validation_failed rather than persisting a result with every load
 * misclassified as open.
 *
 * @param {Object} params
 * @param {Registration} [params.registration]
 * @param {string} params.status
 * @param {SubmittedSummaryLog} params.summaryLog
 * @param {ReportsService} params.reportsService
 * @returns {Promise<import('#reports/repository/port.js').PeriodicReport[]>}
 */
export const fetchPeriodicReports = async ({
  registration,
  status,
  summaryLog,
  reportsService
}) => {
  if (registration && status === SUMMARY_LOG_STATUS.VALIDATED) {
    return reportsService.findPeriodicReports({
      organisationNumber: summaryLog.organisationNumber,
      registrationNumber: summaryLog.registrationNumber
    })
  }
  return []
}
