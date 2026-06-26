import { logger } from '#common/helpers/logging/logger.js'
import { runReconciliation } from '#waste-records/monitoring/run-reconciliation.js'
import {
  formatCensusSummary,
  formatPartitionDiagnostic,
  hasReviewableFindings
} from '#waste-records/monitoring/format-report.js'

const LOCK_NAME = 'waste-record-state-discrepancy-report'

/**
 * Reconcile the waste record state collection (ADR-0037) against the legacy
 * waste-records committed baseline across the estate and log the result for
 * review. Each partition carrying a discrepancy or a classification divergence
 * is logged on its own line; a census summary follows. All at info — under
 * current-factors backfill, divergences (an overseas site approved since a
 * submission, for instance) are expected findings to read and confirm before
 * the write-flag flip, not failures to alarm on. Read-only — every input comes
 * from the production repositories already built at startup.
 *
 * @param {Object} server - Hapi server instance
 */
const runReport = async (server) => {
  const { reconciliations, census } = await runReconciliation({
    organisationsRepository: server.app.organisationsRepository,
    streamRepository: server.app.streamRepository,
    wasteRecordStateRepository: server.app.wasteRecordStatesRepository,
    wasteRecordsRepository: server.app.wasteRecordsRepository,
    overseasSitesRepository: server.app.overseasSitesRepository
  })

  for (const reconciliation of reconciliations) {
    if (hasReviewableFindings(reconciliation)) {
      logger.info({ message: formatPartitionDiagnostic(reconciliation) })
    }
  }

  logger.info({ message: formatCensusSummary(census) })
}

/**
 * Startup diagnostic that reconciles the waste record state collection against
 * the legacy waste-records committed baseline and logs the discrepancies for
 * human review. Mirrors the waste-balance ledger migration diagnostic: the
 * logged discrepancies are read and confirmed against expectations before the
 * irreversible write-flag flip — there is no pass/fail gate. Runs under a
 * cross-instance lock so a single pod per deploy executes and logs it.
 * Read-only, safe under live traffic.
 *
 * @param {Object} server - Hapi server instance
 */
export const runWasteRecordStateDiscrepancyReport = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping waste record state discrepancy report'
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
      message: 'Failed to run waste record state discrepancy report'
    })
  }
}
