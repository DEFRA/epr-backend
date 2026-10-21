import { logger } from '#common/helpers/logging/logger.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { backfillSummaryLogNumbers } from '#summary-log-numbers-backfill/application/backfill.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */

const LOCK_NAME = 'summary-log-numbers-backfill'
// Required by the repository factory; the backfill never generates download URLs.
const PRE_SIGNED_URL_EXPIRY_SECONDS = 60

/** @param {StartedServer} server */
const runBackfill = async (server) => {
  const isDryRun = !config.get('featureFlags.summaryLogNumbersBackfill')

  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()
  const summaryLogsRepository = (
    await createSummaryLogsRepository(
      server.db,
      {
        s3Client: createS3Client({
          region: config.get('awsRegion'),
          endpoint: config.get('s3Endpoint'),
          forcePathStyle: config.get('isDevelopment')
        }),
        preSignedUrlExpiry: PRE_SIGNED_URL_EXPIRY_SECONDS
      },
      organisationsRepository
    )
  )(logger)
  const systemLogsRepository = (await createSystemLogsRepository(server.db))(
    logger
  )

  const { missing, mapped, unmapped, failed, auditFailed } =
    await backfillSummaryLogNumbers(
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
    message: `Summary log numbers backfill (${mode}): missing=${missing} mapped=${mapped} unmapped=${unmapped} failed=${failed} auditFailed=${auditFailed}`
  })
}

/**
 * Startup backfill of the organisation, registration and accreditation
 * numbers on summary logs stored before they were written beside the ids.
 * Flag off (the default) only reports what it would add; on writes them
 * through the summary logs repository, auditing each change. Both modes log
 * each summary log it cannot map. Idempotent, so safe to leave enabled
 * across restarts.
 *
 * @param {StartedServer} server
 */
export const runSummaryLogNumbersBackfill = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping summary log numbers backfill'
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
      message: 'Failed to run summary log numbers backfill'
    })
  }
}
