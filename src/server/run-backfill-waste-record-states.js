import { logger } from '#common/helpers/logging/logger.js'
import { backfillEstateRowStates } from '#waste-records/backfill/backfill-estate-rowstates.js'

/** @import { OrphanedAccreditation } from '#waste-records/backfill/backfill-estate-rowstates.js' */

const LOCK_NAME = 'waste-record-states-backfill'

/**
 * @param {OrphanedAccreditation} orphan
 */
const formatOrphan = (orphan) =>
  `Waste-record-state backfill orphaned accreditation: organisationId=${orphan.organisationId} registrationId=${orphan.registrationId} accreditationId=${orphan.accreditationId}`

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
    logger.warn({ message: formatOrphan(orphan) })
  }

  logger.info({
    message: `Waste-record-state backfill complete: organisationsScanned=${summary.organisationsScanned} ledgersBackfilled=${summary.ledgersBackfilled} submissionsBackfilled=${summary.submissionsBackfilled} rowStateWrites=${summary.rowStateWrites} orphanedAccreditations=${summary.orphanedAccreditations.length}`
  })
}

/**
 * Reconstructs the historical waste-record-state estate by replaying every
 * registration's submitted summary logs through the guarded, content-addressed
 * upsert. The whole mechanism is gated by the waste-record-states-backfill
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
export const runBackfillWasteRecordStates = async (server) => {
  if (!server.featureFlags.isWasteRecordStatesBackfillEnabled()) {
    return
  }

  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping waste-record-state backfill'
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
      message: 'Failed to run waste-record-state backfill'
    })
  }
}
