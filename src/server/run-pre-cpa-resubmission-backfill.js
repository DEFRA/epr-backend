import { logger } from '#common/helpers/logging/logger.js'
import { isClosedPeriodAdjustmentsEnabled } from '#root/config.js'
import {
  findPreCpaResubmissionReports,
  backfillPreCpaResubmissionReports,
  formatPreCpaResubmissionFinding,
  summarisePreCpaResubmissionFindings
} from '#reports/monitoring/pre-cpa-resubmission-backfill.js'

const LOCK_NAME = 'pre-cpa-resubmission'

/**
 * Logs the invariant probe result. `ignoredInClosedPeriods` is expected empty:
 * a report period should never overlap unaccredited time, so an IGNORED
 * (outside-accreditation) restatement folding into a reported closed period
 * signals an invariant breach or a CPA blind spot -- surfaced with its report
 * ids for investigation rather than silently counted.
 *
 * @param {import('#reports/monitoring/pre-cpa-resubmission-backfill.js').PreCpaResubmissionFinding[]} ignored
 */
const logInvariantProbe = (ignored) => {
  if (ignored.length === 0) {
    logger.info({
      message:
        'Invariant check: 0 IGNORED restatements fell in a closed reported period (expected 0)'
    })
    return
  }
  logger.warn({
    message:
      `Invariant check: ${ignored.length} IGNORED restatements fell in a ` +
      `closed reported period (expected 0) -- reports ` +
      `${ignored.map((finding) => finding.reportId).join(', ')}`
  })
}

/**
 * Warns when a submitted report carried no submittedAt and so was excluded from
 * the sizing scan. Expected empty; a non-empty result is a data-integrity
 * anomaly surfaced with its report ids for investigation.
 *
 * @param {import('#reports/monitoring/pre-cpa-resubmission-backfill.js').ReportIdentity[]} missing
 */
const logMissingSubmittedAt = (missing) => {
  if (missing.length === 0) {
    return
  }
  logger.warn({
    message:
      `Data integrity: ${missing.length} submitted reports missing a ` +
      `submittedAt were skipped from sizing -- reports ` +
      `${missing.map((report) => report.reportId).join(', ')}`
  })
}

/**
 * Scans the estate for submitted reports a later summary-log upload restated in
 * an already-closed period, then logs each affected report, a sizing summary,
 * and the invariant probe result. Read-only.
 *
 * @param {Object} server - Hapi server instance
 */
const runReport = async (server) => {
  const {
    scanned,
    findings,
    ignoredInClosedPeriods,
    reportsMissingSubmittedAt
  } = await findPreCpaResubmissionReports({
    reportsRepository: server.app.reportsRepository,
    summaryLogsRepository: server.app.summaryLogsRepository,
    summaryLogRowStateRepository: server.app.summaryLogRowStatesRepository,
    organisationsRepository: server.app.organisationsRepository
  })

  for (const finding of findings) {
    logger.info({ message: formatPreCpaResubmissionFinding(finding) })
  }

  const { affectedOrganisations, affectedRegistrations } =
    summarisePreCpaResubmissionFindings(findings)

  logger.info({
    message:
      `Pre-CPA resubmission sizing: scanned ${scanned} submitted reports, ` +
      `${findings.length} would require resubmission, across ` +
      `${affectedOrganisations} organisations / ${affectedRegistrations} registrations. ` +
      `Retrospective -- not a prediction of the next upload.`
  })

  logInvariantProbe(ignoredInClosedPeriods)
  logMissingSubmittedAt(reportsMissingSubmittedAt)
}

/**
 * Warns when a group's write flagged a report the scan did not attribute
 * that period to -- the period was most likely resubmitted between the scan
 * and this write, so the flagged report has since diverged from the one the
 * finding (and its log line) describe. Expected empty.
 *
 * @param {string[]} reportIds
 */
const logUnexpectedlyFlagged = (reportIds) => {
  if (reportIds.length === 0) {
    return
  }
  logger.warn({
    message:
      `Pre-CPA resubmission backfill: ${reportIds.length} reports were ` +
      `flagged that the scan did not attribute their period to -- likely ` +
      `resubmitted between the scan and the write -- reports ` +
      `${reportIds.join(', ')}`
  })
}

/**
 * Warns for each org/registration/summaryLogId group whose write or audit
 * threw, so the run's log makes clear which groups still need a retry rather
 * than only a generic top-level failure message. Expected empty.
 *
 * @param {Array<{ organisationId: string, registrationId: string, summaryLogId: string, error: Error }>} failed
 */
const logFailedGroups = (failed) => {
  for (const group of failed) {
    logger.error({
      err: group.error,
      message:
        `Pre-CPA resubmission backfill: failed to flag org ${group.organisationId} / ` +
        `registration ${group.registrationId}, summary log ${group.summaryLogId} -- ` +
        `will retry on the next run`
    })
  }
}

/**
 * Backfills `resubmissionRequired.closedPeriodRestated` onto every report
 * `findPreCpaResubmissionReports` finds, logging each report actually
 * flagged (with the same org/registration/period/summary-log detail as the
 * diagnostic's finding line) and a summary count. A finding not returned by
 * the write is a no-op, not an error -- it was already flagged, most likely
 * by an earlier run (the shared lock rules out another pod flagging it in
 * this same run). Runs its own scan (independent of the diagnostic step), so
 * also logs its own invariant probe and missing-submittedAt anomalies, and
 * any group whose write failed.
 *
 * @param {Object} server - Hapi server instance
 */
const runBackfill = async (server) => {
  const {
    findings,
    ignoredInClosedPeriods,
    reportsMissingSubmittedAt,
    flagged,
    unexpectedlyFlaggedReportIds,
    failed
  } = await backfillPreCpaResubmissionReports({
    reportsRepository: server.app.reportsRepository,
    summaryLogsRepository: server.app.summaryLogsRepository,
    summaryLogRowStateRepository: server.app.summaryLogRowStatesRepository,
    organisationsRepository: server.app.organisationsRepository,
    systemLogsRepository: server.app.systemLogsRepository
  })

  const flaggedReportIds = new Set(flagged.map((report) => report.reportId))
  for (const finding of findings.filter((f) =>
    flaggedReportIds.has(f.reportId)
  )) {
    logger.info({
      message: `Pre-CPA resubmission backfill: flagged -- ${formatPreCpaResubmissionFinding(finding)}`
    })
  }

  logger.info({
    message:
      `Pre-CPA resubmission backfill: ${findings.length} reports found, ` +
      `${flagged.length} newly flagged as requiring resubmission ` +
      `(${findings.length - flagged.length} already flagged by an earlier run).`
  })

  logInvariantProbe(ignoredInClosedPeriods)
  logMissingSubmittedAt(reportsMissingSubmittedAt)
  logUnexpectedlyFlagged(unexpectedlyFlaggedReportIds)
  logFailedGroups(failed)
}

/**
 * Startup diagnostic (PAE-1747) and backfill (PAE-1768) for reports a later
 * summary-log upload restated in an already-closed period before CPA
 * (closed-period adjustments) went live. Both steps run under one
 * cross-instance lock so a single pod per deploy executes them and they never
 * race each other.
 *
 * The two steps are gated independently: the diagnostic (read-only sizing/
 * logging) runs when `preCpaResubmissionReport` is enabled; the backfill
 * (writes `resubmissionRequired.closedPeriodRestated`) runs when
 * `preCpaResubmissionBackfill` is enabled AND closed-period adjustments
 * itself is enabled -- CPA must already be live before its history is
 * backfilled. Either can run without the other. With both flags off, this
 * returns before touching the locker or any repository.
 *
 * @param {Object} server - Hapi server instance
 */
export const runPreCpaResubmissionBackfill = async (server) => {
  const reportEnabled = server.featureFlags.isPreCpaResubmissionReportEnabled()
  const backfillEnabled =
    server.featureFlags.isPreCpaResubmissionBackfillEnabled() &&
    isClosedPeriodAdjustmentsEnabled()

  if (!reportEnabled && !backfillEnabled) {
    return
  }

  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping pre-CPA resubmission'
      })
      return
    }
    try {
      if (reportEnabled) {
        await runReport(server)
      }
      if (backfillEnabled) {
        await runBackfill(server)
      }
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run pre-CPA resubmission'
    })
  }
}
