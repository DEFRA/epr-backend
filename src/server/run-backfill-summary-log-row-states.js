import { logger } from '#common/helpers/logging/logger.js'
import { backfillEstateSummaryLogRowStates } from '#waste-records/backfill/backfill-estate-summary-log-row-states.js'

/** @import { OrphanedAccreditation, EstateBackfillProgress } from '#waste-records/backfill/backfill-estate-summary-log-row-states.js' */

const LOCK_NAME = 'summary-log-row-states-backfill'

export const PROGRESS_LOG_INTERVAL = 100

/**
 * @param {OrphanedAccreditation} orphan
 */
const formatOrphan = (orphan) =>
  `Waste-record-state backfill orphaned accreditation: organisationId=${orphan.organisationId} registrationId=${orphan.registrationId} accreditationId=${orphan.accreditationId}`

/**
 * @param {EstateBackfillProgress} progress
 */
const formatProgress = (progress) =>
  `Waste-record-state backfill progress: registrationsProcessed=${progress.registrationsProcessed} organisationId=${progress.organisationId} registrationId=${progress.registrationId} ledgersBackfilled=${progress.ledgersBackfilled} ledgersSkippedComplete=${progress.ledgersSkippedComplete} submissionsBackfilled=${progress.submissionsBackfilled} summaryLogRowStateWrites=${progress.summaryLogRowStateWrites} orphanedAccreditations=${progress.orphanedAccreditations}`

/**
 * Log a running progress line at every interval boundary, so a long estate sweep
 * is observable without one line per registration.
 *
 * @param {EstateBackfillProgress} progress
 */
const logProgress = (progress) => {
  if (progress.registrationsProcessed % PROGRESS_LOG_INTERVAL === 0) {
    logger.info({ message: formatProgress(progress) })
  }
}

/**
 * @param {Object} server - Hapi server instance
 */
const runBackfill = async (server) => {
  const summary = await backfillEstateSummaryLogRowStates({
    organisationsRepository: server.app.organisationsRepository,
    wasteRecordsRepository: server.app.wasteRecordsRepository,
    summaryLogsRepository: server.app.summaryLogsRepository,
    overseasSitesRepository: server.app.overseasSitesRepository,
    summaryLogRowStateRepository: server.app.summaryLogRowStatesRepository,
    summaryLogRowStatesBackfillWatermarkRepository:
      server.app.summaryLogRowStatesBackfillWatermarkRepository,
    onProgress: logProgress
  })

  for (const orphan of summary.orphanedAccreditations) {
    logger.warn({ message: formatOrphan(orphan) })
  }

  logger.info({
    message: `Waste-record-state backfill complete: organisationsScanned=${summary.organisationsScanned} ledgersBackfilled=${summary.ledgersBackfilled} ledgersSkippedComplete=${summary.ledgersSkippedComplete} submissionsBackfilled=${summary.submissionsBackfilled} summaryLogRowStateWrites=${summary.summaryLogRowStateWrites} orphanedAccreditations=${summary.orphanedAccreditations.length}`
  })
}

/**
 * Reconstructs the historical summary-log-row-state estate by replaying every
 * registration's submitted summary logs through the guarded, content-addressed
 * upsert. The whole mechanism is gated by the summary-log-row-states-backfill
 * feature flag: with it off this returns before touching the locker or any
 * repository, so the mongodb row-state adapter is never invoked at rest and the
 * write-gate invariant holds. The deliberate run is authorised by flipping the
 * flag at rollout time, after the dry-run diagnostic has been reviewed.
 *
 * Runs under a cross-instance lock so a single pod per deploy executes the
 * sweep. Idempotent: the upsert dedups through the unique row-state identity
 * index, so a re-run writes nothing new. This is the sanctioned prod route —
 * there is no ad-hoc production command.
 *
 * @param {Object} server - Hapi server instance
 */
export const runBackfillSummaryLogRowStates = async (server) => {
  if (!server.featureFlags.isSummaryLogRowStatesBackfillEnabled()) {
    return
  }

  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping summary-log-row-state backfill'
      })
      return
    }
    try {
      await runBackfill(server)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run summary-log-row-state backfill'
    })
  }
}
