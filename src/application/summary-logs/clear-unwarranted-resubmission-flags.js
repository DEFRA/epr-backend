import { auditClearReportRequiringResubmission } from '#reports/application/audit.js'
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
/** @import {SystemLogsRepository} from '#repositories/system-logs/port.js' */
/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */
/** @import {PeriodicReport, PeriodicReportSlots, Report, ReportResubmissionRequired, ReportSummary, ReportsRepository, ResubmissionClosedPeriodRestated} from '#reports/repository/port.js' */
/** @import {PeriodRef} from '#reports/domain/period-key.js' */
/** @import {SummaryLogRowStatesRepository} from '#waste-records/repository/port.js' */
/** @import {WasteBalanceLedgerRepository} from '#waste-balances/repository/ledger-port.js' */
/** @import {Comparison} from './periods-requiring-resubmission.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */

/**
 * @typedef {Object} ClearUnwarrantedResubmissionFlagsDependencies
 * @property {ReportsRepository} reportsRepository
 * @property {OrganisationsRepository} organisationsRepository
 * @property {SummaryLogsRepository} summaryLogsRepository
 * @property {WasteBalanceLedgerRepository} ledgerRepository
 * @property {SummaryLogRowStatesRepository} summaryLogRowStatesRepository
 * @property {OverseasSitesRepository} overseasSitesRepository
 * @property {SystemLogsRepository} systemLogsRepository
 */

/**
 * @typedef {'cleared' | 'would-clear' | 'kept' | 'resubmission-in-progress' | 'skipped'} FlagAction
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
 * @property {FlagAction} action
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
 * @param {ClearUnwarrantedResubmissionFlagsDependencies} deps
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
 * @param {ClearUnwarrantedResubmissionFlagsDependencies} deps
 * @param {{ report: Report, isDryRun: boolean }} params
 * @returns {Promise<FlagAction>}
 */
const clearFlag = async (deps, { report, isDryRun }) => {
  if (isDryRun) {
    return 'would-clear'
  }

  const cleared = await deps.reportsRepository.clearClosedPeriodRestated({
    reportId: report.id,
    version: report.version
  })
  if (!cleared) {
    return 'skipped'
  }

  const { closedPeriodRestated: _cleared, ...remaining } =
    /** @type {ReportResubmissionRequired} */ (report.resubmissionRequired)
  await auditClearReportRequiringResubmission({
    systemLogsRepository: deps.systemLogsRepository,
    report,
    remaining: Object.keys(remaining).length > 0 ? remaining : null
  })
  return 'cleared'
}

/**
 * @param {ClearUnwarrantedResubmissionFlagsDependencies} deps
 * @param {Report} report
 * @param {{ comparison: Comparison, resubmissionInProgress: boolean, isDryRun: boolean }} params
 * @returns {Promise<FlagAction>}
 */
const decide = async (
  deps,
  report,
  { comparison, resubmissionInProgress, isDryRun }
) => {
  if (requiresResubmission(comparison)) {
    return 'kept'
  }
  // The flag is what permitted the draft, so clearing it would strand it.
  if (resubmissionInProgress) {
    return 'resubmission-in-progress'
  }
  return clearFlag(deps, { report, isDryRun })
}

/**
 * @param {ClearUnwarrantedResubmissionFlagsDependencies} deps
 * @param {FlaggedReport} flagged
 * @param {boolean} isDryRun
 * @returns {Promise<FlagOutcome | null>} null when the flag has gone since the scan
 */
const reevaluate = async (
  deps,
  { reportId, resubmissionInProgress },
  isDryRun
) => {
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
  const action = await decide(deps, report, {
    comparison,
    resubmissionInProgress,
    isDryRun
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
    action
  }
}

/**
 * Re-evaluates every report flagged because a summary log restated its closed
 * period, with the validation-time gate's comparison, and clears the flag
 * where the reported figures are unchanged.
 *
 * @param {ClearUnwarrantedResubmissionFlagsDependencies} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<{ outcomes: FlagOutcome[], failures: FlagFailure[] }>}
 */
export const clearUnwarrantedResubmissionFlags = async (deps, { isDryRun }) => {
  const flaggedReports = findFlaggedReports(
    await deps.reportsRepository.findAllPeriodicReports()
  )

  /** @type {FlagOutcome[]} */
  const outcomes = []
  /** @type {FlagFailure[]} */
  const failures = []

  // Sequential, so the sweep never fans out reads across every flagged report.
  for (const flagged of flaggedReports) {
    try {
      const outcome = await reevaluate(deps, flagged, isDryRun)
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
