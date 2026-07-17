import { logger } from '#common/helpers/logging/logger.js'
import {
  findPreCpaResubmissionReports,
  formatPreCpaResubmissionFinding,
  summarisePreCpaResubmissionFindings
} from '#reports/monitoring/pre-cpa-resubmission.js'

const LOCK_NAME = 'pre-cpa-resubmission-report'

/**
 * Logs the invariant probe result. `ignoredInClosedPeriods` is expected empty:
 * a report period should never overlap unaccredited time, so an IGNORED
 * (outside-accreditation) restatement folding into a reported closed period
 * signals an invariant breach or a CPA blind spot — surfaced with its report
 * ids for investigation rather than silently counted.
 *
 * @param {import('#reports/monitoring/pre-cpa-resubmission.js').PreCpaResubmissionFinding[]} ignored
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
      `closed reported period (expected 0) — reports ` +
      `${ignored.map((finding) => finding.reportId).join(', ')}`
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
  const { scanned, findings, ignoredInClosedPeriods } =
    await findPreCpaResubmissionReports({
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
      `Retrospective — not a prediction of the next upload.`
  })

  logInvariantProbe(ignoredInClosedPeriods)
}

/**
 * Startup diagnostic (PAE-1747) that retrospectively sizes the pre-CPA
 * population of submitted reports live closed-period adjustments would now
 * surface as needing resubmission, logging the affected report ids for human
 * review. Runs under a cross-instance lock so a single pod per deploy executes
 * and logs it. Read-only — it writes nothing and backfills no flags.
 *
 * Gated by the pre-cpa-resubmission-report feature flag: with it off this
 * returns before touching the locker or any repository.
 *
 * @param {Object} server - Hapi server instance
 */
export const runPreCpaResubmissionReport = async (server) => {
  if (!server.featureFlags.isPreCpaResubmissionReportEnabled()) {
    return
  }

  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping pre-CPA resubmission report'
      })
      return
    }
    try {
      await runReport(server)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run pre-CPA resubmission report'
    })
  }
}
