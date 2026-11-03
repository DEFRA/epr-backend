import { isNil } from '#common/helpers/is-nil.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import {
  findSchemaForProcessingType,
  PROCESSING_TYPE_TABLES
} from '#domain/summary-logs/table-schemas/index.js'
import { isRegistrationAccredited } from '#domain/organisations/registration-utils.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { getOperatorCategory } from '#reports/domain/operator-category.js'
import { requireStoredNumbers } from '#domain/organisations/numbers.js'
import {
  neverAccredited,
  readModelAccreditedPeriod,
  readModelOverseasSitesContext
} from '#waste-balances/domain/classification-context.js'
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
/** @import {AccreditedPeriod, OverseasSitesContext} from '#waste-balances/domain/classification-context.js' */
/** @import {OrganisationReadRepository} from '#organisation-read-model/repository/port.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */
/** @import {Loads} from '#domain/summary-logs/loads-schema.js' */
/** @import {LoadsByReportingPeriod} from '#domain/summary-logs/loads-by-period-status-schema.js' */
/** @typedef {string} ProcessingType */
/** @typedef {import('#reports/application/report-service.js').ReportsService} ReportsService */

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
 * @param {ProcessingType} params.processingType
 * @param {import('#reports/repository/port.js').PeriodicReport[]} params.periodicReports
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} params.overseasSites
 * @param {Registration} [params.registration]
 * @param {AccreditedPeriod | null} params.accreditedPeriod - The registration's accreditation, converted once by the caller
 * @param {Map<string, WasteRecordState>} [params.submittedRowStatesByKey]
 * @returns {{ loads: Loads | null, loadsByReportingPeriod: LoadsByReportingPeriod | null }}
 */
export const classifyLoads = ({
  processingType,
  status,
  wasteBalanceRecords,
  wasteRecords,
  periodicReports,
  overseasSites,
  registration,
  accreditedPeriod,
  submittedRowStatesByKey
}) => {
  if (
    status !== SUMMARY_LOG_STATUS.VALIDATED ||
    !wasteRecords ||
    !submittedRowStatesByKey
  ) {
    return {
      loads: null,
      loadsByReportingPeriod: null
    }
  }

  const recordChanges = classifyRecordChanges({
    wasteRecords,
    submittedRowStatesByKey,
    accreditation: accreditedPeriod,
    overseasSites
  })

  const loads = mergeLoads(
    countByValidity({ wasteRecords, recordChanges }),
    countByWasteBalanceInclusion({
      wasteRecords: wasteBalanceRecords,
      recordChanges
    })
  )

  const tableSchemas = PROCESSING_TYPE_TABLES[processingType]

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
          classificationContext: {
            accreditation: accreditedPeriod,
            overseasSites
          }
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
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId
    })
  }
  return []
}

/**
 * What a summary log's rows classify against: the accreditation it names and,
 * for an exporter, that accreditation's overseas sites, read from the
 * organisation read model by the summary log's numbers.
 *
 * - An accreditation the read model serves: its accredited period and, for an
 *   exporter, its approved sites.
 * - An accreditation the read model does not serve: never accredited, so every
 *   row is outside the accreditation period and none reaches the overseas-site
 *   checks.
 * - Registered-only (accreditation number `null`): no accreditation and no
 *   sites. The read model holds site approval only per accreditation, and none
 *   is needed: a registration without an accreditation validates only against
 *   a registered-only template, whose tables have no waste-balance classifier.
 *
 * Only exporters carry overseas sites, so other processing types disable the
 * overseas-site checks. Without an exporter's sites, loads requiring site
 * approval would be misclassified in the predicted waste-balance delta shown
 * on the check page.
 *
 * @param {Object} params
 * @param {ProcessingType} params.processingType
 * @param {SubmittedSummaryLog} params.summaryLog
 * @param {OrganisationReadRepository} params.organisationReadRepository
 * @returns {Promise<{ accreditation: AccreditedPeriod | null, overseasSites: OverseasSitesContext }>}
 */
export const resolveClassificationContext = async ({
  processingType,
  summaryLog,
  organisationReadRepository
}) => {
  const isExporter = processingType === PROCESSING_TYPES.EXPORTER
  const { organisationNumber, registrationNumber, accreditationNumber } =
    requireStoredNumbers(
      summaryLog,
      `summary log for registration ${summaryLog.registrationId}`
    )

  const found =
    accreditationNumber === null
      ? null
      : await organisationReadRepository.findAccreditationByNumber(
          organisationNumber,
          registrationNumber,
          accreditationNumber
        )

  if (!found) {
    return {
      accreditation: accreditationNumber === null ? null : neverAccredited(),
      overseasSites: isExporter ? {} : ORS_VALIDATION_DISABLED
    }
  }

  return {
    accreditation: readModelAccreditedPeriod(found.accreditation, found.year),
    overseasSites: isExporter
      ? readModelOverseasSitesContext(found.registration, found.accreditation)
      : ORS_VALIDATION_DISABLED
  }
}
