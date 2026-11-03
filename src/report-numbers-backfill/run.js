import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { createReportsRepository } from '#reports/repository/mongodb.js'
import {
  backfillReportNumbers,
  removeReportAccreditationNumbers
} from '#report-numbers-backfill/application/backfill.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */

const LOCK_NAME = 'report-numbers-backfill'
const UNMAPPED_SAMPLE_SIZE = 10

/**
 * Each reason with its count and the first few report ids, so one line says
 * what to act on however many reports cannot be mapped.
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
  const isDryRun = !config.get('featureFlags.reportNumbersBackfill')

  const deps = {
    reportsRepository: (await createReportsRepository(server.db))(),
    systemLogsRepository: (await createSystemLogsRepository(server.db))(logger),
    organisationsRepository: (await createOrganisationsRepository(server.db))(),
    logger
  }
  const { mapped, unmapped, unmappedReasons, missing, failed, auditFailed } =
    await backfillReportNumbers(deps, { isDryRun })
  const removal = await removeReportAccreditationNumbers(deps, { isDryRun })

  const mode = isDryRun ? 'dry-run' : 'backfill'
  logger.info({
    message: `Report numbers backfill (${mode}): missing=${missing} mapped=${mapped} unmapped=${unmapped} failed=${failed} auditFailed=${auditFailed} unmappedReasons="${describeUnmapped(unmappedReasons)}" accreditationNumbers="held=${removal.held} removed=${removal.removed} failed=${removal.failed} auditFailed=${removal.auditFailed}"`
  })
}

/**
 * Startup backfill of the organisation and registration numbers on reports
 * stored before they were written beside the ids, which also removes any
 * accreditation number a report was stored with. Flag off (the default) only
 * reports what it would change; on writes the changes through the reports
 * repository, auditing each change. Both modes log one summary line, which says
 * why reports cannot be mapped and how many accreditation numbers it removes.
 * Idempotent, so safe to leave enabled across restarts.
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
