import { logger } from '#common/helpers/logging/logger.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { backfillLedgerYear } from '#ledger-year-backfill/application/backfill.js'
import { createYearlessLedgers } from '#ledger-year-backfill/mongodb.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { LedgerRecordCounts } from '#ledger-year-backfill/mongodb.js' */

const LOCK_NAME = 'ledger-year-backfill'

/** @param {LedgerRecordCounts} counts */
const describeCounts = ({ events, rowStates }) =>
  `events=${events} rowStates=${rowStates}`

/** @param {StartedServer} server */
const runBackfill = async (server) => {
  const isDryRun = !config.get('featureFlags.ledgerYearBackfill')

  const systemLogsRepository = (await createSystemLogsRepository(server.db))(
    logger
  )

  const { ledgers, years, skipped, failed, auditFailed } =
    await backfillLedgerYear(
      {
        ledgers: createYearlessLedgers(server.db),
        systemLogsRepository,
        logger
      },
      { isDryRun }
    )

  const mode = isDryRun ? 'dry-run' : 'backfill'
  const byYear = [...years]
    .sort(([a], [b]) => a - b)
    .map(([year, counts]) => `; ${year}: ${describeCounts(counts)}`)
    .join('')
  logger.info({
    message: `Ledger year backfill (${mode}): ledgers=${ledgers} failed=${failed} auditFailed=${auditFailed}${byYear}; skipped: ${describeCounts(skipped)}`
  })
}

/**
 * Startup backfill of the year on ledger events and row states stored
 * before ledgers were kept apart by year. Flag off (the default) only
 * reports what it would change; on writes it, auditing each ledger. Both
 * modes log one summary line, and an error for each ledger that fails.
 * Idempotent, so safe to leave enabled across restarts.
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
