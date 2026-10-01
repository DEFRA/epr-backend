import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import { getOrsDetailsMap } from '#overseas-sites/application/get-ors-details-map.js'
import { aggregateReportDetail } from '#reports/domain/aggregation/aggregate-report-detail.js'
import { getOperatorCategory } from '#reports/domain/operator-category.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { diffReports } from '#reports/domain/resubmission/reported-data-equivalence.js'
import { projectSummaryLogRowState } from '#waste-records/application/project-summary-log-row-state.js'
import { wasteRecordStatesForHead } from '#waste-records/application/read-summary-log-row-states.js'
import { ledgerIdFor } from './ledger-id.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {PeriodicReport} from '#reports/repository/port.js' */
/** @import {PeriodRef} from '#reports/domain/period-key.js' */
/** @import {ReportsService} from '#reports/application/report-service.js' */
/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */
/** @import {ReportableWasteRecordState} from '#reports/domain/aggregation/aggregate-report-detail.js' */
/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {Cadence} from '#reports/domain/cadence.js' */
/** @import {OperatorCategory} from '#reports/domain/operator-category.js' */
/** @import {OrsDetails} from '#overseas-sites/application/get-ors-details-map.js' */
/** @import {WasteRecordType} from '#domain/waste-records/model.js' */
/** @import {ReportSource} from '#reports/repository/port.js' */
/** @import {SummaryLogRowStatesRepository} from '#waste-records/repository/port.js' */
/** @import {WasteBalanceLedgerId} from '#waste-balances/repository/ledger-schema.js' */
/** @import {LoadsByReportingPeriod} from '#domain/summary-logs/loads-by-period-status-schema.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */

/**
 * The per-period-invariant context the comparison needs, computed once for the
 * whole upload.
 *
 * @typedef {Object} FiguresContext
 * @property {ReportableWasteRecordState[]} newHeadRowStates
 * @property {OperatorCategory} operatorCategory
 * @property {Map<string, OrsDetails>} orsDetailsMap
 * @property {WasteBalanceLedgerId} ledgerId
 * @property {SummaryLogRowStatesRepository} summaryLogRowStatesRepository
 */

// Both sides are aggregated only to compare them, never persisted, so neither
// carries submission provenance. diffReports excludes source, so the nulls
// never reach the diff.
const NO_SOURCE = { summaryLogId: null, lastUploadedAt: null }

/**
 * Maps this upload's validated waste records to the row-state shape the report
 * aggregation reads. Each summary log is a full snapshot, so this upload IS the
 * new head. Every record is kept, whatever its waste-balance outcome, because
 * the submit path persists every record and the report aggregates by date
 * alone: a row outside the accreditation window (IGNORED) still counts in its
 * period's report. Rows are projected through the same seam the submit path
 * persists them with, so the data (coerced tonnages, normalised shape) matches
 * the persisted row states the report's source head is read from.
 *
 * @param {ValidatedWasteRecord[]} wasteRecords
 * @param {Accreditation | null} accreditation
 * @param {OverseasSitesContext} overseasSites
 * @returns {ReportableWasteRecordState[]}
 */
const toNewHeadRowStates = (wasteRecords, accreditation, overseasSites) =>
  wasteRecords.map((wasteRecord) => ({
    wasteRecordType: /** @type {WasteRecordType} */ (
      wasteRecord.wasteRecordType
    ),
    data: projectSummaryLogRowState(
      wasteRecord.record,
      accreditation,
      overseasSites
    ).data
  }))

/**
 * The id of the latest submitted report for a closed period: what the regulator
 * holds, and what submit flags. The current report can be a resubmission draft,
 * so submitted ones are searched newest first. A closed period always has a
 * submitted report, so this resolves in practice; the optional-chaining is a
 * defensive lookup the invariant makes unreachable.
 *
 * @param {PeriodicReport[]} periodicReports
 * @param {PeriodRef} period
 * @returns {string | undefined}
 */
/* v8 ignore start -- defensive lookup; the closed-period invariant guarantees a submitted report */
const latestSubmittedReportIdForPeriod = (
  periodicReports,
  { year, cadence, period }
) => {
  const slot = periodicReports.find((pr) => pr.year === year)?.reports?.[
    cadence
  ]?.[period]
  return [slot?.current, ...(slot?.previousSubmissions ?? [])].find(
    (submission) => submission?.status === REPORT_STATUS.SUBMITTED
  )?.id
}
/* v8 ignore stop */

/**
 * Aggregates the figures a period's report presents from a head's row states,
 * using today's aggregation code and ORS registry. Both sides of the comparison
 * are built here, so anything that has changed since the report was submitted
 * (the registry no longer resolving a site, an aggregation fix) affects both sides
 * alike and cannot read as a change this upload caused. PRN issued tonnage is
 * excluded from the comparison (see reported-data-equivalence), so it is not
 * aggregated.
 *
 * @param {ReportableWasteRecordState[]} rowStates
 * @param {Pick<FiguresContext, 'operatorCategory' | 'orsDetailsMap'> & { period: PeriodRef }} params
 */
const aggregatePeriodFigures = (
  rowStates,
  { period: { year, cadence, period }, operatorCategory, orsDetailsMap }
) =>
  aggregateReportDetail(rowStates, {
    operatorCategory,
    cadence: /** @type {Cadence} */ (cadence),
    year,
    period,
    source: NO_SOURCE,
    orsDetailsMap
  })

/**
 * The reported fields this upload changes in what a closed period's report
 * would present (empty when it changes none), or null when the report's source
 * submission has no row states to rebuild it from, as for a report generated
 * before row states were recorded. An empty before-state would read as every
 * figure changed, so it is reported as not comparable instead.
 *
 * The before-state is the report rebuilt from the submission it was generated
 * from (its source summary log), not the report as stored. Row-state history is
 * retained (ADR-0037), so the source head can be re-read and re-aggregated
 * alongside the new head, isolating the effect of this upload from drift since
 * submission. The stored report is read only for its provenance.
 *
 * @param {object} params
 * @param {PeriodRef} params.period
 * @param {PeriodicReport[]} params.periodicReports
 * @param {ReportsService} params.reportsService
 * @param {FiguresContext} params.context
 * @returns {Promise<string[] | null>}
 */
const changedFieldsForPeriod = async ({
  period,
  periodicReports,
  reportsService,
  context
}) => {
  const reportId = latestSubmittedReportIdForPeriod(periodicReports, period)
  /* v8 ignore next 3 -- a closed period always has a submitted report; treat none as wholly changed */
  if (!reportId) {
    return ['report']
  }

  const report = await reportsService.findReportById(reportId)
  // The create schema requires source, so every stored report carries it.
  const { summaryLogId } = /** @type {ReportSource} */ (report.source)
  const sourceRowStates = await wasteRecordStatesForHead(
    context.summaryLogRowStatesRepository,
    context.ledgerId,
    summaryLogId
  )
  if (sourceRowStates.length === 0) {
    return null
  }

  const before = aggregatePeriodFigures(sourceRowStates, { period, ...context })
  const after = aggregatePeriodFigures(context.newHeadRowStates, {
    period,
    ...context
  })

  return diffReports(before, after)
}

/**
 * Whether a period's comparison outcome requires resubmission. A period that
 * cannot be compared is flagged, as it was before the gate existed.
 *
 * @param {string[] | null} changedFields
 */
const requiresResubmission = (changedFields) =>
  changedFields === null || changedFields.length > 0

/**
 * @param {string[] | null} changedFields
 */
const describeOutcome = (changedFields) => {
  if (changedFields === null) {
    return 'requires resubmission: cannot compare, its source submission has no row states'
  }
  return changedFields.length > 0
    ? `requires resubmission: reported data changed in ${changedFields.join(', ')}`
    : 'does not require resubmission: reported data unchanged'
}

/**
 * Records whether a closed period this upload restated requires resubmission,
 * and which reported fields changed. Logs field paths only, never their values,
 * which can identify suppliers and destinations.
 *
 * @param {WasteBalanceLedgerId & { summaryLogId: string }} subject
 * @param {PeriodRef} period
 * @param {string[] | null} changedFields
 */
const logPeriodOutcome = (
  { organisationId, registrationId, summaryLogId },
  { year, cadence, period },
  changedFields
) => {
  logger.info({
    message: `Closed period ${year} ${cadence} ${period} for ${organisationId}/${registrationId} (summary log ${summaryLogId}) ${describeOutcome(changedFields)}`
  })
}

/**
 * Narrows the closed periods this upload touched to those whose reported figures
 * actually changed, so resubmission is required only when it carries new
 * information. For each period it rebuilds the report from the submission the
 * report was generated from and compares it against what this upload would now
 * produce, both aggregated the same way.
 *
 * @param {object} params
 * @param {PeriodRef[]} params.closedPeriods
 * @param {PeriodicReport[]} params.periodicReports
 * @param {ValidatedWasteRecord[]} params.wasteRecords
 * @param {Registration | undefined} params.registration
 * @param {OverseasSitesContext} params.overseasSites
 * @param {ReportsService} params.reportsService
 * @param {OverseasSitesRepository} params.overseasSitesRepository
 * @param {SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {WasteBalanceLedgerId} params.ledgerId - the ledger the report's
 *   source submission was written to
 * @param {string} params.summaryLogId - this upload, for the outcome logs
 * @returns {Promise<PeriodRef[]>}
 */
const computePeriodsRequiringResubmission = async ({
  summaryLogId,
  closedPeriods,
  periodicReports,
  wasteRecords,
  registration,
  overseasSites,
  reportsService,
  overseasSitesRepository,
  summaryLogRowStatesRepository,
  ledgerId
}) => {
  if (closedPeriods.length === 0) {
    return []
  }
  /* v8 ignore next 3 -- closed periods only arise for a classified registration */
  if (!registration) {
    return []
  }

  const operatorCategory = getOperatorCategory(registration)
  const orsDetailsMap = await getOrsDetailsMap(
    overseasSitesRepository,
    registration.overseasSites
  )
  const newHeadRowStates = toNewHeadRowStates(
    wasteRecords,
    registration.accreditation ?? null,
    overseasSites
  )

  const context = {
    newHeadRowStates,
    operatorCategory,
    orsDetailsMap,
    ledgerId,
    summaryLogRowStatesRepository
  }

  const outcomes = await Promise.all(
    closedPeriods.map(async (period) => ({
      period,
      changedFields: await changedFieldsForPeriod({
        period,
        periodicReports,
        reportsService,
        context
      })
    }))
  )

  for (const { period, changedFields } of outcomes) {
    logPeriodOutcome({ ...ledgerId, summaryLogId }, period, changedFields)
  }

  return outcomes
    .filter(({ changedFields }) => requiresResubmission(changedFields))
    .map(({ period }) => period)
}

/**
 * Adds the closed periods whose reported figures this upload changes to its
 * loads-by-reporting-period summary. Shadow mode: stored and logged, but submit
 * still flags every closed period. A failure is logged and falls back to every
 * closed period, as before the gate existed, rather than failing the operator's
 * upload.
 *
 * @param {Omit<Parameters<typeof computePeriodsRequiringResubmission>[0], 'closedPeriods' | 'wasteRecords' | 'ledgerId'> & {
 *   loadsByReportingPeriod: LoadsByReportingPeriod | null,
 *   wasteRecords: ValidatedWasteRecord[] | null,
 *   summaryLog: SubmittedSummaryLog
 * }} params
 * @returns {Promise<LoadsByReportingPeriod | null>}
 */
export const withPeriodsRequiringResubmission = async ({
  loadsByReportingPeriod,
  wasteRecords,
  summaryLog,
  ...params
}) => {
  if (!loadsByReportingPeriod) {
    return null
  }

  try {
    const periodsRequiringResubmission =
      await computePeriodsRequiringResubmission({
        ...params,
        closedPeriods: loadsByReportingPeriod.closedPeriods,
        // classifyLoads yields a loadsByReportingPeriod only for present records.
        wasteRecords: /** @type {ValidatedWasteRecord[]} */ (wasteRecords),
        ledgerId: ledgerIdFor(summaryLog, params.registration)
      })

    return { ...loadsByReportingPeriod, periodsRequiringResubmission }
  } catch (error) {
    logger.error({
      err: error,
      message: `Failed to compute periods requiring resubmission for summary log ${params.summaryLogId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
    return {
      ...loadsByReportingPeriod,
      periodsRequiringResubmission: loadsByReportingPeriod.closedPeriods
    }
  }
}
