import { logger } from '#common/helpers/logging/logger.js'
import { backfillRegistrationLedger } from '#waste-records/backfill/backfill-estate-summary-log-row-states.js'
import { createInMemorySummaryLogRowStatesBackfillWatermarkRepository } from '#waste-records/backfill/watermark/inmemory.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/in-memory-store.js'
import { runReconciliation } from '#waste-records/monitoring/run-reconciliation.js'
import {
  formatCensusSummary,
  formatLedgerDiagnostic,
  hasReviewableFindings
} from '#waste-records/monitoring/format-report.js'

const LOCK_NAME = 'waste-record-state-discrepancy-report'

/**
 * Build the per-ledger summary-log row state source the reconciliation walk
 * resolves for each registration, following the backfill flag.
 *
 * With the flag on, the persisted mongodb collection is the live source — the
 * backfill has populated it and forward writes may be extending it — so every
 * ledger reconciles against that one persisted repository (mongodb's unique
 * index and per-ledger reads keep it cheap). With the flag off, nothing has
 * been written to mongodb yet (the write-gate invariant), so each ledger is
 * reconstructed on its own into a fresh in-memory store that is reconciled and
 * then discarded before the next — the dry run's peak footprint is one
 * registration, never the whole estate, and mongodb is never touched. Both
 * modes feed the identical reconciliation, so one diagnostic serves every phase
 * of the rollout: pre-flip authorisation, in-window verification of the
 * backfilled estate, and the post-write-flip monitor.
 *
 * @param {Object} server - Hapi server instance
 * @returns {(context: { organisation: import('#domain/organisations/model.js').Organisation, registration: import('#domain/organisations/registration.js').Registration }) => Promise<import('#waste-records/repository/port.js').SummaryLogRowStateRepository>}
 */
export const summaryLogRowStateSource = (server) => {
  if (server.featureFlags.isSummaryLogRowStatesBackfillEnabled()) {
    return async () => server.app.summaryLogRowStatesRepository
  }

  return async ({ organisation, registration }) => {
    const summaryLogRowStateRepository =
      createInMemorySummaryLogRowStateRepository()()
    await backfillRegistrationLedger({
      organisation,
      registration,
      organisationsRepository: server.app.organisationsRepository,
      wasteRecordsRepository: server.app.wasteRecordsRepository,
      summaryLogsRepository: server.app.summaryLogsRepository,
      overseasSitesRepository: server.app.overseasSitesRepository,
      summaryLogRowStateRepository,
      summaryLogRowStatesBackfillWatermarkRepository:
        createInMemorySummaryLogRowStatesBackfillWatermarkRepository()()
    })
    return summaryLogRowStateRepository
  }
}

/**
 * Reconcile the waste record state view (ADR-0037) against the legacy
 * waste-records committed baseline across the estate and log the result for
 * review. The view follows the backfill flag — the persisted collection when on,
 * a reconstructed in-memory dry run when off. Each ledger carrying a
 * discrepancy or a classification divergence is logged on its own line; a census
 * summary follows. All at info — under current-factors backfill, divergences (an
 * overseas site approved since a submission, for instance) are expected findings
 * to read and confirm before the write-flag flip, not failures to alarm on.
 * Read-only — every input comes from the production repositories already built
 * at startup.
 *
 * @param {Object} server - Hapi server instance
 */
const runReport = async (server) => {
  const { reconciliations, census } = await runReconciliation({
    organisationsRepository: server.app.organisationsRepository,
    ledgerRepository: server.app.ledgerRepository,
    summaryLogRowStateSource: summaryLogRowStateSource(server),
    wasteRecordsRepository: server.app.wasteRecordsRepository,
    overseasSitesRepository: server.app.overseasSitesRepository
  })

  for (const reconciliation of reconciliations) {
    if (hasReviewableFindings(reconciliation)) {
      logger.info({ message: formatLedgerDiagnostic(reconciliation) })
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
