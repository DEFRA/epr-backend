import { latestSubmitted } from '#reports/domain/build-calendar-periods.js'
import { latestSubmittedSummaryLog } from '#waste-balances/application/latest-submitted-summary-log.js'
import { wasteRecordStatesForHead } from '#waste-records/application/read-summary-log-row-states.js'
import { ledgerIdFor } from './ledger-id.js'
import {
  buildFiguresContext,
  compareSubmittedReport,
  requiresResubmission
} from './periods-requiring-resubmission.js'

/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */
/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */
/** @import {PeriodicReport, PeriodicReportSlots, Report, ReportSummary, ReportsRepository, ResubmissionClosedPeriodRestated} from '#reports/repository/port.js' */
/** @import {PeriodRef} from '#reports/domain/period-key.js' */
/** @import {SummaryLogRowStatesRepository} from '#waste-records/repository/port.js' */
/** @import {WasteBalanceLedgerRepository} from '#waste-balances/repository/ledger-port.js' */
/** @import {Comparison} from './periods-requiring-resubmission.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */

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
 * @typedef {'would-clear' | 'kept' | 'resubmission-in-progress'} FlagVerdict
 *
 * @typedef {Object} FlagOutcome
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} reportId
 * @property {number} submissionNumber
 * @property {PeriodRef} period
 * @property {ResubmissionClosedPeriodRestated} closedPeriodRestated
 * @property {string | null} headSummaryLogId - the file the figures were rebuilt from
 * @property {Comparison} comparison
 * @property {FlagVerdict} verdict
 *
 * @typedef {{ reportId: string, error: string }} FlagFailure
 */

/**
 * @typedef {{ reportId: string, resubmissionInProgress: boolean }} FlaggedReport
 */

/**
 * The latest submission of every period carrying a closed-period flag.
 * Superseded submissions are skipped: a later submission answers them.
 *
 * @param {PeriodicReport[]} periodicReports
 * @returns {FlaggedReport[]}
 */
const findFlaggedReports = (periodicReports) =>
  periodicReports
    .flatMap(({ reports }) => Object.values(reports))
    // A cadence key exists only for cadences that hold reports.
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
 * Rebuilds the period's figures from the registration's current head, on the
 * ledger the gate read for the upload that set the flag.
 *
 * @param {ReevaluateResubmissionFlagsDependencies} deps
 * @param {{ report: Report, period: PeriodRef, flaggedBy: string }} params
 * @returns {Promise<{ headSummaryLogId: string | null, comparison: Comparison }>}
 */
const compareWithHead = async (deps, { report, period, flaggedBy }) => {
  const flaggingLog = await deps.summaryLogsRepository.findById(flaggedBy)
  if (!flaggingLog) {
    return {
      headSummaryLogId: null,
      comparison: {
        baseline: {
          reportId: report.id,
          submissionNumber: report.submissionNumber
        },
        cannotCompare: 'the summary log that flagged it no longer exists'
      }
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
  const head = await latestSubmittedSummaryLog(deps.ledgerRepository, ledgerId)
  const headSummaryLogId = head?.summaryLogId ?? null

  const context = await buildFiguresContext({
    registration,
    newHeadRowStates: await wasteRecordStatesForHead(
      deps.summaryLogRowStatesRepository,
      ledgerId,
      headSummaryLogId
    ),
    overseasSitesRepository: deps.overseasSitesRepository,
    summaryLogRowStatesRepository: deps.summaryLogRowStatesRepository,
    ledgerId
  })

  return {
    headSummaryLogId,
    comparison: await compareSubmittedReport({ period, report, context })
  }
}

/**
 * @param {Comparison} comparison
 * @param {boolean} resubmissionInProgress
 * @returns {FlagVerdict}
 */
const decide = (comparison, resubmissionInProgress) => {
  if (requiresResubmission(comparison)) {
    return 'kept'
  }
  // The flag is what permitted the draft, so clearing it would strand it.
  if (resubmissionInProgress) {
    return 'resubmission-in-progress'
  }
  return 'would-clear'
}

/**
 * @param {ReevaluateResubmissionFlagsDependencies} deps
 * @param {FlaggedReport} flagged
 * @returns {Promise<FlagOutcome | null>} null when the flag has gone since the scan
 */
const reevaluate = async (deps, { reportId, resubmissionInProgress }) => {
  const report = await deps.reportsRepository.findReportById(reportId)
  const closedPeriodRestated = report.resubmissionRequired?.closedPeriodRestated
  if (!closedPeriodRestated) {
    return null
  }

  const period = {
    year: report.year,
    cadence: report.cadence,
    period: report.period
  }
  const { headSummaryLogId, comparison } = await compareWithHead(deps, {
    report,
    period,
    flaggedBy: closedPeriodRestated.summaryLogId
  })

  return {
    organisationId: report.organisationId,
    registrationId: report.registrationId,
    reportId: report.id,
    submissionNumber: report.submissionNumber,
    period,
    closedPeriodRestated,
    headSummaryLogId,
    comparison,
    verdict: decide(comparison, resubmissionInProgress)
  }
}

/**
 * Re-evaluates every report flagged because a summary log restated its closed
 * period, with the validation-time gate's comparison. Read-only: the verdict
 * says whether the flag would be cleared, nothing is written.
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
  /** @type {FlagFailure[]} */
  const failures = []

  for (const flagged of flaggedReports) {
    try {
      const outcome = await reevaluate(deps, flagged) // NOSONAR: javascript:S9382 - sequential so the sweep never fans out reads across every flagged report
      if (outcome) {
        outcomes.push(outcome)
      }
    } catch (error) {
      failures.push({
        reportId: flagged.reportId,
        error: /** @type {Error} */ (error).message
      })
    }
  }

  return { outcomes, failures }
}
