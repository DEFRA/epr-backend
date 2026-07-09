import { logger } from '#common/helpers/logging/logger.js'
import {
  findStaleIssuedTonnageReports,
  formatStaleIssuedTonnageFinding
} from '#reports/monitoring/stale-issued-tonnage.js'

const LOCK_NAME = 'stale-issued-tonnage-report'

/**
 * Recalculates issuedTonnage for every submitted or in-progress monthly
 * report and logs any report whose stored value no longer matches — the
 * PAE-1665 rule change (excluding PRNs cancelled after issuance) stales any
 * report computed before the fix. Read-only, safe under live traffic.
 *
 * @param {Object} server - Hapi server instance
 */
const runReport = async (server) => {
  const { scanned, findings } = await findStaleIssuedTonnageReports({
    reportsRepository: server.app.reportsRepository,
    organisationsRepository: server.app.organisationsRepository,
    packagingRecyclingNotesRepository:
      server.app.packagingRecyclingNotesRepository
  })

  for (const finding of findings) {
    logger.info({ message: formatStaleIssuedTonnageFinding(finding) })
  }

  const affectedOrganisations = new Set(
    findings.map((finding) => finding.organisationId)
  ).size

  logger.info({
    message: `Stale issued tonnage report: scanned ${scanned}, discrepancies ${findings.length}, affected organisations ${affectedOrganisations}`
  })
}

/**
 * Startup diagnostic that recalculates issuedTonnage for every submitted or
 * in-progress monthly report and logs discrepancies against the stored
 * value for human review. Runs under a cross-instance lock so a single pod
 * per deploy executes and logs it. Read-only.
 *
 * Gated by the stale-issued-tonnage-report feature flag: with it off this
 * returns before touching the locker or any repository.
 *
 * @param {Object} server - Hapi server instance
 */
export const runStaleIssuedTonnageReport = async (server) => {
  if (!server.featureFlags.isStaleIssuedTonnageReportEnabled()) {
    return
  }

  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping stale issued tonnage report'
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
      message: 'Failed to run stale issued tonnage report'
    })
  }
}
