import { logger } from '#common/helpers/logging/logger.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { backfillPrnNumbers } from '#prn-numbers-backfill/application/backfill.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */

const LOCK_NAME = 'prn-numbers-backfill'
const UNMAPPED_SAMPLE_SIZE = 10

/**
 * Each reason with its count and the first few PRN ids, so one line says what
 * to act on however many PRNs cannot be mapped.
 *
 * @param {Record<string, string[]>} unmappedReasons
 */
const describeUnmapped = (unmappedReasons) =>
  Object.entries(unmappedReasons)
    .map(
      ([reason, ids]) =>
        `${reason}: ${ids.length} (${ids.slice(0, UNMAPPED_SAMPLE_SIZE).join(', ')})`
    )
    .join('; ')

/** @param {StartedServer} server */
const runBackfill = async (server) => {
  const isDryRun = !config.get('featureFlags.prnNumbersBackfill')

  const { mapped, unmapped, unmappedReasons, missing, failed, auditFailed } =
    await backfillPrnNumbers(
      {
        prnRepository: (
          await createPackagingRecyclingNotesRepository(server.db, [])
        )(logger),
        systemLogsRepository: (await createSystemLogsRepository(server.db))(
          logger
        ),
        organisationsRepository: (
          await createOrganisationsRepository(server.db)
        )(),
        logger
      },
      { isDryRun }
    )

  const mode = isDryRun ? 'dry-run' : 'backfill'
  logger.info({
    message: `PRN numbers backfill (${mode}): missing=${missing} mapped=${mapped} unmapped=${unmapped} failed=${failed} auditFailed=${auditFailed} unmappedReasons="${describeUnmapped(unmappedReasons)}"`
  })
}

/**
 * Startup backfill of the organisation and registration numbers on PRNs stored
 * before they were written beside the ids. Flag off (the default) only reports
 * what it would add; on writes them through the PRN repository, auditing each
 * change. Both modes log one summary line, which says why PRNs cannot be
 * mapped. Idempotent, so safe to leave enabled across restarts.
 *
 * @param {StartedServer} server
 */
export const runPrnNumbersBackfill = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping PRN numbers backfill'
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
      message: 'Failed to run PRN numbers backfill'
    })
  }
}
