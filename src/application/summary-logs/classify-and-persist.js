import { isClosedPeriodAdjustmentsEnabled } from '#root/config.js'
import { isNil } from '#common/helpers/is-nil.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import {
  findSchemaForProcessingType,
  PROCESSING_TYPE_TABLES
} from '#domain/summary-logs/table-schemas/index.js'
import { isRegistrationAccredited } from '#domain/organisations/registration-utils.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { resolveOverseasSites } from '#application/waste-records/resolve-overseas-sites.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { classifyByPeriodStatus } from './period-status.js'
import {
  countByValidity,
  countByWasteBalanceInclusion,
  countByWasteRecordType,
  mergeLoads
} from './load-counts.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */
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
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} params.overseasSites
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
  overseasSites,
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
            overseasSites
          }
        })
      : null
  /* v8 ignore stop */

  return { loads, loadsByWasteRecordType, loadsByReportingPeriod }
}

/**
 * Gates the closed-period refs behind the closed-period-adjustments feature.
 * When the feature is off, returns the loads with closedPeriods emptied so
 * nothing is persisted (or surfaced on the summary-log response) while it is
 * disabled; the open/closed load breakdown is untouched.
 *
 * @param {LoadsByReportingPeriod | null} loadsByReportingPeriod
 * @returns {LoadsByReportingPeriod | null}
 */
export const gateClosedPeriods = (loadsByReportingPeriod) =>
  loadsByReportingPeriod && !isClosedPeriodAdjustmentsEnabled()
    ? { ...loadsByReportingPeriod, closedPeriods: [] }
    : loadsByReportingPeriod

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
 * @param {ReportsRepository} params.reportsRepository
 * @returns {Promise<import('#reports/repository/port.js').PeriodicReport[]>}
 */
export const fetchPeriodicReports = async ({
  registration,
  status,
  summaryLog,
  reportsRepository
}) => {
  if (registration && status === SUMMARY_LOG_STATUS.VALIDATED) {
    return reportsRepository.findPeriodicReports({
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId
    })
  }
  return []
}

/**
 * Resolves the overseas-sites context for ORS validation (VAL014). Only
 * exporters carry overseas sites, so other processing types skip the lookup
 * and disable the check, mirroring the submit-time path in
 * sync-from-summary-log.js. Without this, loads requiring ORS approval would
 * be misclassified in the predicted waste-balance delta shown on the check
 * page.
 *
 * @param {Object} params
 * @param {ProcessingType} params.processingType
 * @param {SubmittedSummaryLog} params.summaryLog
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {OverseasSitesRepository} params.overseasSitesRepository
 * @returns {Promise<import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext>}
 */
export const resolveOverseasSitesContext = async ({
  processingType,
  summaryLog,
  organisationsRepository,
  overseasSitesRepository
}) =>
  processingType === PROCESSING_TYPES.EXPORTER
    ? resolveOverseasSites(
        organisationsRepository,
        overseasSitesRepository,
        summaryLog.organisationId,
        summaryLog.registrationId
      )
    : ORS_VALIDATION_DISABLED
