import { latestSubmitted } from '#reports/domain/build-calendar-periods.js'
import { latestSubmittedSummaryLog } from '#waste-balances/application/latest-submitted-summary-log.js'
import { wasteRecordStatesForHead } from '#waste-records/application/read-summary-log-row-states.js'
import { ledgerIdFor } from './ledger-id.js'
import {
  buildFiguresContext,
  compareSubmittedReport
} from './periods-requiring-resubmission.js'

/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */
/** @import {Comparison} from './periods-requiring-resubmission.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */
/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */
/** @import {PeriodicReport, PeriodicReportSlots, Report, ReportSummary, ReportsRepository, ResubmissionClosedPeriodRestated} from '#reports/repository/port.js' */
/** @import {PeriodRef} from '#reports/domain/period-key.js' */
/** @import {SummaryLogRowStatesRepository} from '#waste-records/repository/port.js' */
/** @import {WasteBalanceLedgerRepository} from '#waste-balances/repository/ledger-port.js' */

/**
 * @typedef {Object} ReevaluateResubmissionFlagsDependencies
 * @property {ReportsRepository} reportsRepository
 * @property {OrganisationsRepository} organisationsRepository
 * @property {SummaryLogsRepository} summaryLogsRepository
 * @property {WasteBalanceLedgerRepository} ledgerRepository
 * @property {SummaryLogRowStatesRepository} summaryLogRowStatesRepository
 * @property {OverseasSitesRepository} overseasSitesRepository
 */

/**
 * @typedef {{ verdict: 'would-clear' }
 *   | { verdict: 'kept', reason: 'operator-requested' | 'resubmission-in-progress' }
 *   | { verdict: 'kept', reason: 'figures-changed', changedFields: string[] }
 *   | { verdict: 'kept', reason: 'cannot-compare', detail: string }} Verdict
 *
 * @typedef {{
 *   organisationId: string,
 *   registrationId: string,
 *   reportId: string,
 *   submissionNumber: number,
 *   period: PeriodRef,
 *   flaggedAt: string,
 *   flaggedBy: string
 * } & Verdict} FlagOutcome
 *
 * @typedef {{ reportId: string, error: string }} FlagFailure
 *
 * @typedef {{ reportId: string, resubmissionInProgress: boolean }} FlaggedReport
 */

/**
 * @param {PeriodicReport[]} periodicReports
 * @returns {FlaggedReport[]}
 */
const findFlaggedReports = (periodicReports) =>
  periodicReports
    .flatMap(({ reports }) => Object.values(reports))
    .flatMap((slots) =>
      Object.values(/** @type {PeriodicReportSlots} */ (slots))
    )
    .flatMap((slot) => {
      const flagged = latestSubmitted(slot.current, slot.previousSubmissions)
      if (!flagged?.resubmissionRequired?.closedPeriodRestated) {
        return []
      }
      // current is the period's highest submission, so never null here.
      const current = /** @type {ReportSummary} */ (slot.current)
      return [
        {
          reportId: flagged.id,
          resubmissionInProgress:
            current.submissionNumber > flagged.submissionNumber
        }
      ]
    })

/**
 * The registration's current figures, on the ledger the gate read for the
 * upload that set the flag, against the report's own source submission.
 *
 * @param {ReevaluateResubmissionFlagsDependencies} deps
 * @param {{ report: Report, period: PeriodRef, flaggedBy: string }} params
 * @returns {Promise<Comparison | { cannotCompare: string }>}
 */
const compareWithCurrent = async (deps, { report, period, flaggedBy }) => {
  const flaggingLog = await deps.summaryLogsRepository.findById(flaggedBy)
  if (!flaggingLog) {
    return {
      cannotCompare: 'the summary log that set the flag no longer exists'
    }
  }
  const registration = await deps.organisationsRepository.findRegistrationById(
    report.organisationId,
    report.registrationId
  )
  const ledgerId = ledgerIdFor(
    /** @type {SubmittedSummaryLog} */ (flaggingLog.summaryLog),
    registration
  )
  // An empty after-side would read as every field changed.
  const head = await latestSubmittedSummaryLog(deps.ledgerRepository, ledgerId)
  if (!head) {
    return { cannotCompare: 'the registration has no submitted summary log' }
  }

  const context = await buildFiguresContext({
    registration,
    newHeadRowStates: await wasteRecordStatesForHead(
      deps.summaryLogRowStatesRepository,
      ledgerId,
      head.summaryLogId
    ),
    overseasSitesRepository: deps.overseasSitesRepository,
    summaryLogRowStatesRepository: deps.summaryLogRowStatesRepository,
    ledgerId
  })

  return compareSubmittedReport({ period, report, context })
}

/**
 * @param {ReevaluateResubmissionFlagsDependencies} deps
 * @param {{ report: Report, period: PeriodRef, flaggedBy: string, resubmissionInProgress: boolean }} params
 * @returns {Promise<Verdict>}
 */
const verdictFor = async (deps, { resubmissionInProgress, ...params }) => {
  // Clearing ours would leave the operator's request standing.
  if (params.report.resubmissionRequired?.operatorRequested) {
    return { verdict: 'kept', reason: 'operator-requested' }
  }
  // The flag may be all that permits the draft.
  if (resubmissionInProgress) {
    return { verdict: 'kept', reason: 'resubmission-in-progress' }
  }

  const comparison = await compareWithCurrent(deps, params)
  if ('cannotCompare' in comparison) {
    return {
      verdict: 'kept',
      reason: 'cannot-compare',
      detail: comparison.cannotCompare
    }
  }
  if (comparison.changedFields.length > 0) {
    return {
      verdict: 'kept',
      reason: 'figures-changed',
      changedFields: comparison.changedFields
    }
  }
  return { verdict: 'would-clear' }
}

/**
 * @param {ReevaluateResubmissionFlagsDependencies} deps
 * @param {FlaggedReport} flagged
 * @returns {Promise<FlagOutcome>}
 */
const reevaluate = async (deps, { reportId, resubmissionInProgress }) => {
  const report = await deps.reportsRepository.findReportById(reportId)
  // Selected for carrying this flag.
  const { uploadedAt, summaryLogId } =
    /** @type {ResubmissionClosedPeriodRestated} */ (
      report.resubmissionRequired?.closedPeriodRestated
    )
  const period = {
    year: report.year,
    cadence: report.cadence,
    period: report.period
  }

  return {
    organisationId: report.organisationId,
    registrationId: report.registrationId,
    reportId: report.id,
    submissionNumber: report.submissionNumber,
    period,
    flaggedAt: uploadedAt,
    flaggedBy: summaryLogId,
    ...(await verdictFor(deps, {
      report,
      period,
      flaggedBy: summaryLogId,
      resubmissionInProgress
    }))
  }
}

/**
 * Read-only: produces the review list of closed-period flags, writes nothing.
 *
 * @param {ReevaluateResubmissionFlagsDependencies} deps
 * @returns {Promise<{ outcomes: FlagOutcome[], failures: FlagFailure[] }>}
 */
export const reevaluateResubmissionFlags = async (deps) => {
  const flaggedReports = findFlaggedReports(
    await deps.reportsRepository.findAllPeriodicReports()
  )

  /** @type {FlagOutcome[]} */
  const outcomes = []
  for (const flagged of flaggedReports) {
    outcomes.push(await reevaluate(deps, flagged)) // NOSONAR: javascript:S9382 - sequential so the sweep never fans out reads across every flagged report
  }

  return { outcomes, failures: [] }
}
