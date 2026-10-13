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
/** @import {PeriodicReport, PeriodicReportSlots, Report, ReportsRepository, ResubmissionClosedPeriodRestated} from '#reports/repository/port.js' */
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
 * @typedef {'cleared' | 'would-clear' | 'kept' | 'skipped'} FlagAction
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
 * The latest submission of every period carrying a closed-period flag.
 * Superseded submissions are skipped: a later submission answers them.
 *
 * @param {PeriodicReport[]} periodicReports
 * @returns {string[]} report ids
 */
const findFlaggedReportIds = (periodicReports) =>
  periodicReports
    .flatMap(({ reports }) => Object.values(reports))
    // A cadence key exists only for cadences that hold reports.
    .flatMap((slots) =>
      Object.values(/** @type {PeriodicReportSlots} */ (slots))
    )
    .map((slot) => latestSubmitted(slot.current, slot.previousSubmissions))
    .filter((report) => report?.resubmissionRequired?.closedPeriodRestated)
    .map((report) => /** @type {NonNullable<typeof report>} */ (report).id)

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
 * @param {{ report: Report, flaggedBy: string, isDryRun: boolean }} params
 * @returns {Promise<FlagAction>}
 */
const clearFlag = async (deps, { report, flaggedBy, isDryRun }) => {
  if (isDryRun) {
    return 'would-clear'
  }

  const cleared = await deps.reportsRepository.clearClosedPeriodRestated({
    reportId: report.id,
    summaryLogId: flaggedBy
  })
  // Re-flagged or resubmitted since it was read: the newer state stands.
  if (!cleared) {
    return 'skipped'
  }

  await auditClearReportRequiringResubmission({
    systemLogsRepository: deps.systemLogsRepository,
    organisationId: report.organisationId,
    registrationId: report.registrationId,
    cleared
  })
  return 'cleared'
}

/**
 * @param {ClearUnwarrantedResubmissionFlagsDependencies} deps
 * @param {string} reportId
 * @param {boolean} isDryRun
 * @returns {Promise<FlagOutcome | null>} null when the flag has gone since the scan
 */
const reevaluate = async (deps, reportId, isDryRun) => {
  const report = await deps.reportsRepository.findReportById(reportId)
  const closedPeriodRestated = report.resubmissionRequired?.closedPeriodRestated
  if (!closedPeriodRestated) {
    return null
  }

  const flaggedBy = closedPeriodRestated.summaryLogId
  const period = {
    year: report.year,
    cadence: report.cadence,
    period: report.period
  }
  const { headSummaryLogId, comparison } = await compareWithHead(deps, {
    report,
    period,
    flaggedBy
  })
  const action = requiresResubmission(comparison)
    ? 'kept'
    : await clearFlag(deps, { report, flaggedBy, isDryRun })

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
  const reportIds = findFlaggedReportIds(
    await deps.reportsRepository.findAllPeriodicReports()
  )

  /** @type {FlagOutcome[]} */
  const outcomes = []
  /** @type {FlagFailure[]} */
  const failures = []

  // Sequential, so the sweep never fans out reads across every flagged report.
  for (const reportId of reportIds) {
    try {
      const outcome = await reevaluate(deps, reportId, isDryRun)
      if (outcome) {
        outcomes.push(outcome)
      }
    } catch (error) {
      failures.push({ reportId, error: /** @type {Error} */ (error).message })
    }
  }

  return { outcomes, failures }
}
