import { logger } from '#common/helpers/logging/logger.js'
import { backfillEstateRowStates } from '#waste-records/backfill/backfill-estate-rowstates.js'

const LOCK_NAME = 'waste-record-state-backfill'

/**
 * @param {import('#waste-records/backfill/backfill-estate-rowstates.js').OrphanedAccreditation} orphan
 */
const formatOrphan = ({ organisationId, registrationId, accreditationId }) =>
  `Waste record state backfill: orphaned accreditation organisationId=${organisationId} registrationId=${registrationId} accreditationId=${accreditationId}`

/**
 * @param {import('#waste-records/backfill/backfill-estate-rowstates.js').EstateBackfillSummary} summary
 */
const formatSummary = (summary) =>
  `Waste record state backfill: organisationsScanned=${summary.organisationsScanned} streamsBackfilled=${summary.streamsBackfilled} submissionsBackfilled=${summary.submissionsBackfilled} rowStateWrites=${summary.rowStateWrites} orphanedAccreditations=${summary.orphanedAccreditations.length}`

/**
 * @param {Object} server - Hapi server instance
 */
const runBackfill = async (server) => {
  const summary = await backfillEstateRowStates({
    organisationsRepository: server.app.organisationsRepository,
    wasteRecordsRepository: server.app.wasteRecordsRepository,
    summaryLogsRepository: server.app.summaryLogsRepository,
    overseasSitesRepository: server.app.overseasSitesRepository,
    rowStateRepository: server.app.wasteRecordStatesRepository
  })

  for (const orphan of summary.orphanedAccreditations) {
    logger.info({ message: formatOrphan(orphan) })
  }

  logger.info({ message: formatSummary(summary) })
}

/**
 * One-shot startup migration that backfills the waste record state collection
 * for the whole historical estate from sparse version history, so the read
 * model carries every legacy submission's row states before forward writes go
 * live. Reconstructs and upserts through the same guarded path the live
 * submission flow uses; idempotent, so safe to re-run on every deploy.
 *
 * Runs under a cross-instance lock so a single pod per deploy executes the
 * sweep. Orphaned accreditation references are logged at info and skipped — a
 * data anomaly to review, not a service error, so it stays clear of the
 * error-log alerts. Reads the repositories registered on `server.app`, the
 * background-job surface the queue consumer and other workers use.
 *
 * @param {Object} server - Hapi server instance
 */
export const runWasteRecordStateBackfill = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping waste record state backfill'
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
      message: 'Failed to run waste record state backfill'
    })
  }
}
