import { isNil } from '#common/helpers/is-nil.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { classifyByPeriodStatus } from './period-status.js'
import { reportOperatorCategory } from '#reports/domain/operator-category.js'
import { reportingCadenceOf } from './registration-for-summary-log.js'
import { classifyRecordChanges } from './classify-record-changes.js'
import {
  countByValidity,
  countByWasteBalanceInclusion,
  mergeLoads
} from './load-counts.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {WasteRecordState} from '#waste-records/application/read-summary-log-row-states.js' */
/** @import {SummaryLogRegistration} from './registration-for-summary-log.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */
/** @import {Loads} from '#domain/summary-logs/loads-schema.js' */
/** @import {LoadsByReportingPeriod} from '#domain/summary-logs/loads-by-period-status-schema.js' */
/** @import {TableSchemas} from '#domain/summary-logs/table-schemas/index.js' */
/** @import {RowClassificationContext} from '#waste-balances/domain/waste-balance-classification.js' */
/** @import {RecordChange} from './record-change.js' */
/** @typedef {import('#reports/application/report-service.js').ReportsService} ReportsService */

/**
 * Filters waste records to only those from tables that participate in waste balance.
 *
 * @param {ValidatedWasteRecord[] | null} wasteRecords
 * @param {TableSchemas | undefined} tableSchemas - absent when validation stopped before choosing the template
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
 * @param {import('#reports/repository/port.js').PeriodicReport[]} params.periodicReports
 * @param {RowClassificationContext} [params.classificationContext] - absent when validation stopped before reading the registration
 * @param {SummaryLogRegistration} [params.registration]
 * @param {Map<string, WasteRecordState>} [params.submittedRowStatesByKey]
 * @returns {{ loads: Loads | null, loadsByReportingPeriod: LoadsByReportingPeriod | null, recordChanges: Map<string, RecordChange> | null }}
 */
export const classifyLoads = ({
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
      loadsByReportingPeriod: null,
      recordChanges: null
    }
  }

  const recordChanges = classifyRecordChanges({
    wasteRecords,
    submittedRowStatesByKey,
    classificationContext
  })

  const loads = mergeLoads(
    countByValidity({ wasteRecords, recordChanges }),
    countByWasteBalanceInclusion({
      wasteRecords: wasteBalanceRecords,
      recordChanges
    })
  )

  /* v8 ignore start -- defensive guard: registration is always set when status is VALIDATED */
  const loadsByReportingPeriod = registration
    ? classifyByPeriodStatus({
        wasteRecords,
        submittedRowStatesByKey,
        recordChanges,
        periodicReports,
        cadence: reportingCadenceOf(registration),
        operatorCategory: reportOperatorCategory(registration),
        classificationContext
      })
    : null
  /* v8 ignore stop */

  return { loads, loadsByReportingPeriod, recordChanges }
}

/**
 * Fetches the periodic reports of the validated summary log's year. A log can
 * carry earlier-year dates, but it cannot change an earlier year's reports.
 *
 * The period-status split is core flow once the feature is live, so a failure
 * here must propagate: the queue consumer's onFailure marks the log
 * validation_failed rather than persisting a result with every load
 * misclassified as open.
 *
 * @param {Object} params
 * @param {SummaryLogRegistration} [params.registration]
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
    const periodicReports = await reportsService.findPeriodicReports({
      organisationNumber: summaryLog.organisationNumber,
      registrationNumber: summaryLog.registrationNumber
    })
    return periodicReports.filter(({ year }) => year === summaryLog.year)
  }
  return []
}
