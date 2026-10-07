import { logger } from '#common/helpers/logging/logger.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { backfillSummaryLogYear } from '#summary-log-year-backfill/application/backfill.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */

const LOCK_NAME = 'summary-log-year-backfill'
// Required by the repository factory; the backfill never generates download URLs.
const PRE_SIGNED_URL_EXPIRY_SECONDS = 60

/** @param {StartedServer} server */
const runBackfill = async (server) => {
  const isDryRun = !config.get('featureFlags.summaryLogYearBackfill')

  const summaryLogsRepository = (
    await createSummaryLogsRepository(server.db, {
      s3Client: createS3Client({
        region: config.get('awsRegion'),
        endpoint: config.get('s3Endpoint'),
        forcePathStyle: config.get('isDevelopment')
      }),
      preSignedUrlExpiry: PRE_SIGNED_URL_EXPIRY_SECONDS
    })
  )(logger)
  const systemLogsRepository = (await createSystemLogsRepository(server.db))(
    logger
  )

  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()

  const { legacy, updated, failed, auditFailed, years } =
    await backfillSummaryLogYear(
      {
        summaryLogsRepository,
        systemLogsRepository,
        organisationsRepository,
        logger
      },
      { isDryRun }
    )

  const mode = isDryRun ? 'dry-run' : 'backfill'
  logger.info({
    message: `Summary log year backfill (${mode}): legacy=${legacy} updated=${updated} failed=${failed} auditFailed=${auditFailed} years=${JSON.stringify(years)}`
  })
}

/**
 * Startup backfill of `year` on summary logs created before year-scoped
 * routes (PAE-2027). Flag off (the default) only reports the years it would
 * assign; on writes each summary log's registration start year through the
 * summary logs repository, auditing each change.
 * Idempotent, so safe to leave enabled across restarts. `accreditationId`
 * is not touched.
 *
 * @param {StartedServer} server
 */
export const runSummaryLogYearBackfill = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping summary log year backfill'
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
      message: 'Failed to run summary log year backfill'
    })
  }
}
