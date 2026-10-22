import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { createReportsRepository } from '#reports/repository/mongodb.js'
import { backfillReportNumbers } from '#report-numbers-backfill/application/backfill.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */

const LOCK_NAME = 'report-numbers-backfill'

/** @param {StartedServer} server */
const runBackfill = async (server) => {
  const isDryRun = !config.get('featureFlags.reportNumbersBackfill')

  const { mapped, unmapped, missing, failed, auditFailed } =
    await backfillReportNumbers(
      {
        reportsRepository: (await createReportsRepository(server.db))(),
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
    message: `Report numbers backfill (${mode}): missing=${missing} mapped=${mapped} unmapped=${unmapped} failed=${failed} auditFailed=${auditFailed}`
  })
}

/**
 * Startup backfill of the organisation and registration numbers on reports
 * stored before they were written beside the ids. Flag off (the default) only
 * reports what it would add; on writes them through the reports repository,
 * auditing each change. Both modes log each report it cannot map. Idempotent,
 * so safe to leave enabled across restarts.
 *
 * @param {StartedServer} server
 */
export const runReportNumbersBackfill = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping report numbers backfill'
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
      message: 'Failed to run report numbers backfill'
    })
  }
}
