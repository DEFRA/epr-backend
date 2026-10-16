import { auditClearReportRequiringResubmission } from '#reports/application/audit.js'
import { isLatestSubmission } from '#reports/application/resubmission-service.js'
import { latestSubmitted } from '#reports/domain/build-calendar-periods.js'
import { latestSubmittedSummaryLogRowStates } from '#waste-records/application/read-summary-log-row-states.js'
import { ledgerIdFor } from './ledger-id.js'
import {
  buildFiguresContext,
  compareSubmittedReport
} from './periods-requiring-resubmission.js'

/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */
/** @import {Comparison} from './periods-requiring-resubmission.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */
/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */
/** @import {PeriodicReport, PeriodicReportSlots, Report, ReportResubmissionRequired, ReportSummary, ReportsRepository, ResubmissionClosedPeriodRestated} from '#reports/repository/port.js' */
/** @import {PeriodRef} from '#reports/domain/period-key.js' */
/** @import {SummaryLogRowStatesRepository} from '#waste-records/repository/port.js' */
/** @import {SystemLogsRepository} from '#repositories/system-logs/port.js' */
/** @import {Cadence} from '#reports/domain/cadence.js' */
/** @import {WasteBalanceLedgerRepository} from '#waste-balances/repository/ledger-port.js' */

/**
 * @typedef {Object} ReevaluateResubmissionFlagsDependencies
 * @property {ReportsRepository} reportsRepository
 * @property {OrganisationsRepository} organisationsRepository
 * @property {SummaryLogsRepository} summaryLogsRepository
 * @property {WasteBalanceLedgerRepository} ledgerRepository
 * @property {SummaryLogRowStatesRepository} summaryLogRowStatesRepository
 * @property {OverseasSitesRepository} overseasSitesRepository
 * @property {SystemLogsRepository} systemLogsRepository
 */

/**
 * @typedef {{ verdict: 'would-clear' }
 *   | { verdict: 'kept', reason: 'operator-requested' | 'resubmission-in-progress' }
 *   | { verdict: 'kept', reason: 'figures-changed', changedFields: string[] }
 *   | { verdict: 'kept', reason: 'cannot-compare', detail: string }} Verdict
 *
 * @typedef {{ verdict: 'cleared' }
 *   | { verdict: 'skipped', reason: 'changed-since-compared' | 'resubmission-started' }} ClearOutcome
 *
 * @typedef {{
 *   organisationId: string,
 *   registrationNumber: string | null,
 *   accreditationNumber: string | null,
 *   reportId: string,
 *   submissionNumber: number,
 *   period: PeriodRef,
 *   flaggedAt: string,
 *   flaggedBy: string
 * } & (Verdict | ClearOutcome)} FlagOutcome
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
 * @param {ReevaluateResubmissionFlagsDependencies} deps
 * @param {{ report: Report, registration: Registration, period: PeriodRef, flaggedBy: string }} params
 * @returns {Promise<Comparison | { cannotCompare: string }>}
 */
const compareWithCurrent = async (
  deps,
  { report, registration, period, flaggedBy }
) => {
  const flaggingLog = await deps.summaryLogsRepository.findById(flaggedBy)
  if (!flaggingLog) {
    return {
      cannotCompare: 'the summary log that set the flag no longer exists'
    }
  }
  const ledgerId = ledgerIdFor(
    /** @type {SubmittedSummaryLog} */ (flaggingLog.summaryLog),
    registration
  )
  // Submit appends to this ledger before it sets the flag.
  const latest = await latestSubmittedSummaryLogRowStates({
    ledgerRepository: deps.ledgerRepository,
    summaryLogRowStatesRepository: deps.summaryLogRowStatesRepository,
    ...ledgerId
  })
  if (!latest) {
    throw new Error(
      `No submission on the ledger of summary log ${flaggedBy}, which set the flag`
    )
  }

  const context = await buildFiguresContext({
    registration,
    newHeadRowStates: latest.wasteRecordStates,
    overseasSitesRepository: deps.overseasSitesRepository,
    summaryLogRowStatesRepository: deps.summaryLogRowStatesRepository,
    ledgerId
  })

  return compareSubmittedReport({ period, report, context })
}

/**
 * @param {ReevaluateResubmissionFlagsDependencies} deps
 * @param {{ report: Report, registration: Registration, period: PeriodRef, flaggedBy: string, resubmissionInProgress: boolean }} params
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
 * @param {Report} report
 * @returns {Promise<ClearOutcome>}
 */
const clearFlag = async (deps, report) => {
  // Starting a draft never writes to this report, so its version can't catch one.
  const isLatest = await isLatestSubmission(
    deps.reportsRepository,
    report.organisationId,
    report.registrationId,
    report.year,
    /** @type {Cadence} */ (report.cadence),
    report.period,
    report.submissionNumber
  )
  if (!isLatest) {
    return { verdict: 'skipped', reason: 'resubmission-started' }
  }

  const cleared = await deps.reportsRepository.clearResubmissionRequired({
    reportId: report.id,
    version: report.version
  })
  if (!cleared) {
    return { verdict: 'skipped', reason: 'changed-since-compared' }
  }

  await auditClearReportRequiringResubmission({
    systemLogsRepository: deps.systemLogsRepository,
    report
  })
  return { verdict: 'cleared' }
}

/**
 * @param {ReevaluateResubmissionFlagsDependencies} deps
 * @param {FlaggedReport} flagged
 * @param {boolean} clearFlags
 * @returns {Promise<FlagOutcome>}
 */
const reevaluate = async (
  deps,
  { reportId, resubmissionInProgress },
  clearFlags
) => {
  const report = await deps.reportsRepository.findReportById(reportId)
  // Selected for carrying this flag.
  const { closedPeriodRestated } = /** @type {ReportResubmissionRequired} */ (
    report.resubmissionRequired
  )
  const { uploadedAt, summaryLogId } =
    /** @type {ResubmissionClosedPeriodRestated} */ (closedPeriodRestated)
  const period = {
    year: report.year,
    cadence: report.cadence,
    period: report.period
  }
  const registration = await deps.organisationsRepository.findRegistrationById(
    report.organisationId,
    report.registrationId
  )

  const verdict = await verdictFor(deps, {
    report,
    registration,
    period,
    flaggedBy: summaryLogId,
    resubmissionInProgress
  })

  return {
    organisationId: report.organisationId,
    registrationNumber: registration.registrationNumber ?? null,
    accreditationNumber:
      registration.accreditation?.accreditationNumber ?? null,
    reportId: report.id,
    submissionNumber: report.submissionNumber,
    period,
    flaggedAt: uploadedAt,
    flaggedBy: summaryLogId,
    ...(clearFlags && verdict.verdict === 'would-clear'
      ? await clearFlag(deps, report)
      : verdict)
  }
}

/**
 * @param {ReevaluateResubmissionFlagsDependencies} deps
 * @param {{ clearFlags?: boolean }} [options]
 * @returns {Promise<{ outcomes: FlagOutcome[], failures: FlagFailure[] }>}
 */
export const reevaluateResubmissionFlags = async (
  deps,
  { clearFlags = false } = {}
) => {
  const flaggedReports = findFlaggedReports(
    await deps.reportsRepository.findAllPeriodicReports()
  )

  /** @type {FlagOutcome[]} */
  const outcomes = []
  /** @type {FlagFailure[]} */
  const failures = []
  for (const flagged of flaggedReports) {
    try {
      outcomes.push(await reevaluate(deps, flagged, clearFlags)) // NOSONAR: javascript:S9382 - sequential so the sweep never fans out reads across every flagged report
    } catch (error) {
      failures.push({
        reportId: flagged.reportId,
        error: /** @type {Error} */ (error).message
      })
    }
  }

  return { outcomes, failures }
}
