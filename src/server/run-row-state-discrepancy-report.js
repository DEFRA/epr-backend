import { logger } from '#common/helpers/logging/logger.js'
import { runReconciliation } from '#waste-records/monitoring/run-reconciliation.js'
import { formatReport } from '#waste-records/monitoring/format-report.js'

const LOCK_NAME = 'row-state-discrepancy-report'

/**
 * Reconcile the committed row-state collection (ADR-0037) against the legacy
 * waste-records committed state across the estate and log the outcome. A clean
 * estate logs at info; any discrepancy logs at error so the standard OpenSearch
 * `log.level:error` alert surfaces it. The structured census travels alongside
 * the human-readable report. Read-only — every input comes from the production
 * repositories already built at startup, and reconciliation only reads.
 *
 * @param {Object} server - Hapi server instance
 */
const runReport = async (server) => {
  const result = await runReconciliation({
    organisationsRepository: server.app.organisationsRepository,
    streamRepository: server.app.streamRepository,
    rowStateRepository: server.app.wasteRecordStatesRepository,
    wasteRecordsRepository: server.app.wasteRecordsRepository,
    overseasSitesRepository: server.app.overseasSitesRepository
  })

  const entry = {
    message: result.census.isEstateClean
      ? 'Committed row-states reconcile with the waste-records committed state'
      : 'Committed row-state discrepancies found against the waste-records committed state',
    census: result.census,
    report: formatReport(result)
  }

  if (result.census.isEstateClean) {
    logger.info(entry)
  } else {
    logger.error(entry)
  }
}

/**
 * Startup diagnostic that proves the committed row-state collection is whole and
 * consistent against the legacy waste-records committed state. A clean run — no
 * error-level alert — over the backfilled estate is the green light for the
 * irreversible write-flag flip. Runs under a cross-instance lock so a single pod
 * per deploy executes and logs it, keeping the discrepancy alert from firing
 * once per pod. Read-only, safe under live traffic.
 *
 * @param {Object} server - Hapi server instance
 */
export const runRowStateDiscrepancyReport = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping row-state discrepancy report'
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
      message: 'Failed to run row-state discrepancy report'
    })
  }
}
