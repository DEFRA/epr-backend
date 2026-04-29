import { logger } from '#common/helpers/logging/logger.js'
import { migrateFormSubmissionLineage } from '#formsubmission/migration/migrate-form-submission-lineage.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'

/**
 * Run the formSubmission lineage backfill migration on startup.
 *
 * @param {Object} server - Hapi server instance
 * @param {Object} [options] - Optional configuration
 * @param {Object} [options.featureFlags] - Feature flags instance (for testing)
 * @returns {Promise<void>}
 */
export const runFormSubmissionLineageMigration = async (
  server,
  options = {}
) => {
  try {
    const featureFlagsInstance = options.featureFlags || server.featureFlags

    const lock = await server.locker.lock('migrate-form-submission-lineage')
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping form submission lineage migration'
      })
      return
    }

    try {
      const formSubmissionsRepository = (
        await createFormSubmissionsRepository(server.db, logger)
      )()
      const organisationsRepository = (
        await createOrganisationsRepository(server.db)
      )()
      const systemLogsRepository = (
        await createSystemLogsRepository(server.db)
      )(logger)

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository,
        featureFlagsInstance.isMigrateFormSubmissionLineageEnabled()
      )

      logger.info({
        message: 'Form submission lineage migration completed successfully'
      })
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run form submission lineage migration'
    })
  }
}
