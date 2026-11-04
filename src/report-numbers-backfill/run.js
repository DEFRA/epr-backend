import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationReadRepository } from '#organisation-read-model/repository/adapter.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { createReportsRepository } from '#reports/repository/mongodb.js'
import { backfillReportNumbers } from '#report-numbers-backfill/application/backfill.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { RegistrationWithSeveralAccreditations } from '#report-numbers-backfill/application/backfill.js' */

const LOCK_NAME = 'report-numbers-backfill'

/**
 * Each reason with its count and every report id it applies to.
 *
 * @param {Record<string, string[]>} unmappedReasons
 */
const describeUnmapped = (unmappedReasons) =>
  Object.entries(unmappedReasons)
    .map(([reason, ids]) => `${reason}: ${ids.length} (${ids.join(', ')})`)
    .join('; ')

/** @param {RegistrationWithSeveralAccreditations[]} registrations */
const describeSeveralAccreditations = (registrations) =>
  registrations
    .map(
      ({ organisationNumber, registrationId, accreditations }) =>
        `${organisationNumber} ${registrationId}: ${accreditations
          .map(
            ({ id, accreditationNumber, status, validFrom }) =>
              `${id} (${accreditationNumber}) ${status} from ${validFrom}`
          )
          .join(', ')}`
    )
    .join('; ')

/** @param {StartedServer} server */
const runBackfill = async (server) => {
  const isDryRun = !config.get('featureFlags.reportNumbersBackfill')
  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()

  const {
    mapped,
    unmapped,
    unmappedReasons,
    missing,
    failed,
    auditFailed,
    registrationsWithSeveralAccreditations
  } = await backfillReportNumbers(
    {
      reportsRepository: (await createReportsRepository(server.db))(),
      systemLogsRepository: (await createSystemLogsRepository(server.db))(
        logger
      ),
      organisationsRepository,
      organisationReadRepository: createOrganisationReadRepository({
        organisationsRepository,
        overseasSitesRepository: (
          await createOverseasSitesRepository(server.db)
        )(),
        logger
      }),
      logger
    },
    { isDryRun }
  )

  const mode = isDryRun ? 'dry-run' : 'backfill'
  logger.info({
    message: `Report numbers backfill (${mode}): missing=${missing} mapped=${mapped} unmapped=${unmapped} failed=${failed} auditFailed=${auditFailed} unmappedReasons="${describeUnmapped(unmappedReasons)}" severalAccreditations=${registrationsWithSeveralAccreditations.length} registrations="${describeSeveralAccreditations(registrationsWithSeveralAccreditations)}"`
  })
}

/**
 * Startup backfill of the organisation, registration and accreditation numbers
 * on reports stored before they were written beside the ids. Flag off (the
 * default) only reports what it would add; on writes them, auditing each
 * change. Both modes log one summary line: why reports cannot be mapped, and
 * the registrations matched by more than one granted accreditation.
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
