import { logger } from '#common/helpers/logging/logger.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { backfillLedgerYear } from '#ledger-year-backfill/application/backfill.js'
import { createYearlessLedgers } from '#ledger-year-backfill/mongodb.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */

const LOCK_NAME = 'ledger-year-backfill'

/** @param {StartedServer} server */
const runBackfill = async (server) => {
  const isDryRun = !config.get('featureFlags.ledgerYearBackfill')

  const systemLogsRepository = (await createSystemLogsRepository(server.db))(
    logger
  )

  const { ledgers, events, rowStates, unplaced, failed, auditFailed } =
    await backfillLedgerYear(
      {
        ledgers: createYearlessLedgers(server.db),
        systemLogsRepository,
        logger
      },
      { isDryRun }
    )

  const mode = isDryRun ? 'dry-run' : 'backfill'
  logger.info({
    message: `Ledger year backfill (${mode}): ledgers=${ledgers} events=${events} rowStates=${rowStates} unplaced=${unplaced} failed=${failed} auditFailed=${auditFailed}`
  })
}

/**
 * Startup backfill of the year on ledger events and row states stored
 * before ledgers were kept apart by year. Flag off (the default) only
 * reports what it would change; on writes it, auditing each ledger. Both
 * modes log each ledger it cannot place. Idempotent, so safe to leave
 * enabled across restarts.
 *
 * @param {StartedServer} server
 */
export const runLedgerYearBackfill = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping ledger year backfill'
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
      message: 'Failed to run ledger year backfill'
    })
  }
}
