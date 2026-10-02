import { getOrsDetailsMap } from '#overseas-sites/application/get-ors-details-map.js'
import { aggregateReportDetail } from '#reports/domain/aggregation/aggregate-report-detail.js'
import { getOperatorCategory } from '#reports/domain/operator-category.js'
import { latestSubmitted } from '#reports/domain/build-calendar-periods.js'
import { diffReports } from '#reports/domain/resubmission/reported-data-equivalence.js'
import { projectSummaryLogRowState } from '#waste-records/application/project-summary-log-row-state.js'
import { wasteRecordStatesForHead } from '#waste-records/application/read-summary-log-row-states.js'
import { ledgerIdFor } from './ledger-id.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {PeriodicReport, PeriodicReportSlots} from '#reports/repository/port.js' */
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
/** @import {SummaryLogRowStatesRepository} from '#waste-records/repository/port.js' */
/** @import {WasteBalanceLedgerId} from '#waste-balances/repository/ledger-schema.js' */
/** @import {LoadsByReportingPeriod} from '#domain/summary-logs/loads-by-period-status-schema.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */
/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */

/**
 * @typedef {Object} FiguresContext
 * @property {ReportableWasteRecordState[]} newHeadRowStates
 * @property {OperatorCategory} operatorCategory
 * @property {Map<string, OrsDetails>} orsDetailsMap
 * @property {WasteBalanceLedgerId} ledgerId
 * @property {SummaryLogRowStatesRepository} summaryLogRowStatesRepository
 */

// Neither side is persisted, and diffReports ignores source.
const NO_SOURCE = { summaryLogId: null, lastUploadedAt: null }

/**
 * Projected as the submit path persists rows, so both sides of the comparison
 * share one shape.
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
 * @param {PeriodicReport[]} periodicReports
 * @param {PeriodRef} period
 * @returns {string}
 */
const latestSubmittedReportIdForPeriod = (
  periodicReports,
  { year, cadence, period }
) => {
  // Closed periods are derived from these periodic reports, so the slot exists.
  const periodicReport = /** @type {PeriodicReport} */ (
    periodicReports.find((pr) => pr.year === year)
  )
  const slot = /** @type {PeriodicReportSlots} */ (
    periodicReport.reports[/** @type {Cadence} */ (cadence)]
  )[period]
  const report = latestSubmitted(slot.current, slot.previousSubmissions)
  /* v8 ignore next 5 -- a closed period always has a submitted report */
  if (!report) {
    throw new Error(
      `No submitted report for closed period ${year} ${cadence} ${period}`
    )
  }
  return report.id
}

/**
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
 * sourceSummaryLogId is undefined when the report records no source at all.
 *
 * @typedef {{ reportId: string, submissionNumber: number, sourceSummaryLogId?: string | null }} Baseline
 * @typedef {{ baseline: Baseline, changedFields: string[] } | { baseline: Baseline, cannotCompare: string }} Comparison
 */

/**
 * The before-state is rebuilt from the report's source submission, not read
 * from the stored report, so drift since submission affects both sides alike.
 *
 * @param {object} params
 * @param {PeriodRef} params.period
 * @param {PeriodicReport[]} params.periodicReports
 * @param {ReportsService} params.reportsService
 * @param {FiguresContext} params.context
 * @returns {Promise<Comparison>}
 */
const compareWithLatestSubmittedReport = async ({
  period,
  periodicReports,
  reportsService,
  context
}) => {
  const report = await reportsService.findReportById(
    latestSubmittedReportIdForPeriod(periodicReports, period)
  )
  const baseline = {
    reportId: report.id,
    submissionNumber: report.submissionNumber
  }
  // Reports stored before source was required carry none.
  if (!report.source) {
    return { baseline, cannotCompare: 'its report records no source' }
  }

  const { summaryLogId } = report.source
  const sourcedBaseline = { ...baseline, sourceSummaryLogId: summaryLogId }
  const sourceRowStates = await wasteRecordStatesForHead(
    context.summaryLogRowStatesRepository,
    context.ledgerId,
    summaryLogId
  )
  if (summaryLogId !== null && sourceRowStates.length === 0) {
    return {
      baseline: sourcedBaseline,
      cannotCompare: 'its source submission has no row states'
    }
  }

  const before = aggregatePeriodFigures(sourceRowStates, { period, ...context })
  const after = aggregatePeriodFigures(context.newHeadRowStates, {
    period,
    ...context
  })

  return {
    baseline: sourcedBaseline,
    changedFields: diffReports(before, after)
  }
}

/**
 * @typedef {{ period: PeriodRef } & Comparison} PeriodOutcome
 */

// A period that cannot be compared is flagged: no retry would change that.
const requiresResubmission = (/** @type {PeriodOutcome} */ outcome) =>
  'cannotCompare' in outcome || outcome.changedFields.length > 0

/**
 * @param {Comparison} comparison
 */
const describeChange = (comparison) => {
  if ('cannotCompare' in comparison) {
    return `requires resubmission: cannot compare, ${comparison.cannotCompare}`
  }
  return comparison.changedFields.length > 0
    ? `requires resubmission: reported data changed in ${comparison.changedFields.join(', ')}`
    : 'does not require resubmission: reported data unchanged'
}

/**
 * @param {Baseline['sourceSummaryLogId']} sourceSummaryLogId
 */
const describeSource = (sourceSummaryLogId) => {
  if (sourceSummaryLogId === undefined) {
    return 'no recorded source'
  }
  return sourceSummaryLogId === null
    ? 'no submission'
    : `file ${sourceSummaryLogId}`
}

/**
 * A report's source summaryLogId is the submission's file id, as the ledger and
 * row states are keyed, so it is labelled as a file.
 *
 * @param {Baseline} baseline
 */
const describeBaseline = ({ reportId, submissionNumber, sourceSummaryLogId }) =>
  `compared with report ${reportId} submission ${submissionNumber} from ${describeSource(sourceSummaryLogId)}`

/**
 * Field paths only: values can identify suppliers and destinations.
 *
 * @param {TypedLogger} logger
 * @param {WasteBalanceLedgerId & { summaryLogId: string }} subject
 * @param {PeriodOutcome} outcome
 */
const logPeriodOutcome = (
  logger,
  { organisationId, registrationId, summaryLogId },
  outcome
) => {
  const { year, cadence, period } = outcome.period
  logger.info({
    message: `Closed period ${year} ${cadence} ${period} for ${organisationId}/${registrationId} (summary log ${summaryLogId}, ${describeBaseline(outcome.baseline)}) ${describeChange(outcome)}`
  })
}

/**
 * @param {object} params
 * @param {PeriodRef[]} params.closedPeriods
 * @param {PeriodicReport[]} params.periodicReports
 * @param {ValidatedWasteRecord[]} params.wasteRecords
 * @param {Registration | undefined} params.registration
 * @param {OverseasSitesContext} params.overseasSites
 * @param {ReportsService} params.reportsService
 * @param {OverseasSitesRepository} params.overseasSitesRepository
 * @param {SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {WasteBalanceLedgerId} params.ledgerId
 * @param {string} params.summaryLogId
 * @param {TypedLogger} params.logger
 * @returns {Promise<PeriodRef[]>}
 */
const computePeriodsRequiringResubmission = async ({
  logger,
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
    throw new Error('Closed periods without a registration')
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
      ...(await compareWithLatestSubmittedReport({
        period,
        periodicReports,
        reportsService,
        context
      }))
    }))
  )

  for (const outcome of outcomes) {
    logPeriodOutcome(logger, { ...ledgerId, summaryLogId }, outcome)
  }

  return outcomes.filter(requiresResubmission).map(({ period }) => period)
}

/**
 * A failure propagates so the queue retries the validation rather than
 * guessing a verdict.
 *
 * @param {Omit<Parameters<typeof computePeriodsRequiringResubmission>[0], 'closedPeriods' | 'wasteRecords' | 'ledgerId' | 'logger'> & {
 *   loadsByReportingPeriod: LoadsByReportingPeriod | null,
 *   wasteRecords: ValidatedWasteRecord[] | null,
 *   summaryLog: SubmittedSummaryLog,
 *   gate: { enabled: boolean, logger: TypedLogger }
 * }} params
 * @returns {Promise<LoadsByReportingPeriod | null>}
 */
export const withPeriodsRequiringResubmission = async ({
  loadsByReportingPeriod,
  wasteRecords,
  summaryLog,
  gate,
  ...params
}) => {
  if (!loadsByReportingPeriod) {
    return null
  }
  // Stored rather than omitted so submit and the frontend act on the same set.
  if (!gate.enabled) {
    return {
      ...loadsByReportingPeriod,
      periodsRequiringResubmission: loadsByReportingPeriod.closedPeriods
    }
  }

  const periodsRequiringResubmission =
    await computePeriodsRequiringResubmission({
      ...params,
      logger: gate.logger,
      closedPeriods: loadsByReportingPeriod.closedPeriods,
      // classifyLoads yields a loadsByReportingPeriod only for present records.
      wasteRecords: /** @type {ValidatedWasteRecord[]} */ (wasteRecords),
      ledgerId: ledgerIdFor(summaryLog, params.registration)
    })

  return { ...loadsByReportingPeriod, periodsRequiringResubmission }
}
