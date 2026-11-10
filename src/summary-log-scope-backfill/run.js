import { logger } from '#common/helpers/logging/logger.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { backfillSummaryLogScope } from '#summary-log-scope-backfill/application/backfill.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */

const LOCK_NAME = 'summary-log-scope-backfill'
// Required by the repository factory; the backfill never generates download URLs.
const PRE_SIGNED_URL_EXPIRY_SECONDS = 60

/** @param {StartedServer} server */
const runBackfill = async (server) => {
  const isDryRun = !config.get('featureFlags.summaryLogScopeBackfill')

  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()
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

  const {
    missing,
    inFlight,
    mapped,
    unmapped,
    yearSet,
    linkDiffers,
    failed,
    auditFailed
  } = await backfillSummaryLogScope(
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
    message: `Summary log scope backfill (${mode}): missing=${missing} inFlight=${inFlight} mapped=${mapped} unmapped=${unmapped} yearSet=${yearSet} linkDiffers=${linkDiffers} failed=${failed} auditFailed=${auditFailed}`
  })
}

/**
 * Startup backfill of the accreditation and year on summary logs stored
 * before summary logs were scoped by them. Flag off (the default) only
 * reports what it would add; on writes them
 * through the summary logs repository, auditing each change. Both modes log
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
