import { logger } from '#common/helpers/logging/logger.js'
import { describeUnmappedLedgers } from '#common/helpers/numbers-backfill-by-ledger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { backfillLedgerEventNumbers } from '#ledger-event-numbers-backfill/application/backfill.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */

const LOCK_NAME = 'ledger-event-numbers-backfill'

/** @param {StartedServer} server */
const runBackfill = async (server) => {
  const isDryRun = !config.get('featureFlags.ledgerEventNumbersBackfill')

  const { mapped, unmapped, unmappedReasons, missing, failed, auditFailed } =
    await backfillLedgerEventNumbers(
      {
        ledgerRepository: (await createMongoLedgerRepository(server.db))(),
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
    message: `Ledger event numbers backfill (${mode}): missing=${missing} mapped=${mapped} unmapped=${unmapped} failedLedgers=${failed} auditFailedLedgers=${auditFailed} unmappedReasons="${describeUnmappedLedgers(unmappedReasons)}"`
  })
}

/**
 * Startup backfill of the organisation, registration and accreditation numbers
 * on waste balance ledger events stored before they were written beside the
 * ids. A registered-only ledger's events get a null accreditation number. Flag
 * off (the default) only reports what it would add; on writes them through the
 * ledger repository, auditing each ledger it changes. Both modes log one
 * summary line, which names each ledger whose events cannot be mapped, and
 * why. Idempotent, so safe to leave enabled across restarts.
 *
 * @param {StartedServer} server
 */
export const runLedgerEventNumbersBackfill = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping ledger event numbers backfill'
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
      message: 'Failed to run ledger event numbers backfill'
    })
  }
}
