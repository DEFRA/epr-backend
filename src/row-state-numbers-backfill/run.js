import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { createMongoSummaryLogRowStatesRepository } from '#waste-records/repository/mongodb.js'
import { backfillRowStateNumbers } from '#row-state-numbers-backfill/application/backfill.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */

const LOCK_NAME = 'row-state-numbers-backfill'

/**
 * Every ledger under each reason, with its row state count. There are far
 * fewer ledgers than row states, so none is left out.
 *
 * @param {Record<string, string[]>} unmappedReasons
 */
const describeUnmapped = (unmappedReasons) =>
  Object.entries(unmappedReasons)
    .map(
      ([reason, ledgers]) =>
        `${reason}: ${ledgers.length} (${ledgers.join(', ')})`
    )
    .join('; ')

/** @param {StartedServer} server */
const runBackfill = async (server) => {
  const isDryRun = !config.get('featureFlags.rowStateNumbersBackfill')

  const { mapped, unmapped, unmappedReasons, missing, failed, auditFailed } =
    await backfillRowStateNumbers(
      {
        summaryLogRowStatesRepository: (
          await createMongoSummaryLogRowStatesRepository(server.db)
        )(),
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
    message: `Row state numbers backfill (${mode}): missing=${missing} mapped=${mapped} unmapped=${unmapped} failedLedgers=${failed} auditFailedLedgers=${auditFailed} unmappedReasons="${describeUnmapped(unmappedReasons)}"`
  })
}

/**
 * Startup backfill of the organisation, registration and accreditation numbers
 * on summary-log row states stored before they were written beside the ids. A
 * registered-only row state gets a null accreditation number. Flag off (the
 * default) only reports what it would add; on writes them through the row
 * states repository, auditing each ledger it changes. Both modes log one
 * summary line, which names each ledger whose row states cannot be mapped,
 * and why. Idempotent, so safe to leave enabled across restarts.
 *
 * @param {StartedServer} server
 */
export const runRowStateNumbersBackfill = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping row state numbers backfill'
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
      message: 'Failed to run row state numbers backfill'
    })
  }
}
