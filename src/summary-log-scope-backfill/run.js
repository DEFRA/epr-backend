import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { backfillSummaryLogScope } from '#summary-log-scope-backfill/application/backfill.js'
import { createUnscopedSummaryLogs } from '#summary-log-scope-backfill/mongodb.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */

const LOCK_NAME = 'summary-log-scope-backfill'

/** @param {StartedServer} server */
const runBackfill = async (server) => {
  const isDryRun = !config.get('featureFlags.summaryLogScopeBackfill')

  const organisationAdministrationRepository = (
    await createOrganisationsRepository(server.db)
  )()
  const systemLogsRepository = (await createSystemLogsRepository(server.db))(
    logger
  )

  const { missing, mapped, unmapped, yearSet, failed, auditFailed } =
    await backfillSummaryLogScope(
      {
        summaryLogs: createUnscopedSummaryLogs(server.db),
        systemLogsRepository,
        organisationAdministrationRepository,
        logger
      },
      { isDryRun }
    )

  const mode = isDryRun ? 'dry-run' : 'backfill'
  logger.info({
    message: `Summary log scope backfill (${mode}): missing=${missing} mapped=${mapped} unmapped=${unmapped} yearSet=${yearSet} failed=${failed} auditFailed=${auditFailed}`
  })
}

/**
 * Startup backfill of the accreditation and year on summary logs stored
 * before summary logs were scoped by them. Flag off (the default) only
 * reports what it would add; on writes them, auditing each change. Both modes log
 * each summary log it cannot map. Idempotent, so safe to leave enabled
 * across restarts.
 *
 * @param {StartedServer} server
 */
export const runSummaryLogScopeBackfill = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping summary log scope backfill'
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
      message: 'Failed to run summary log scope backfill'
    })
  }
}
