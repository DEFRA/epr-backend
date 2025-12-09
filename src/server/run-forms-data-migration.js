import { logger } from '#common/helpers/logging/logger.js'
import { createFormDataMigrator } from '#formsubmission/migration/migration-orchestrator.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'

export const runFormsDataMigration = async (server, options = {}) => {
  try {
    const featureFlagsInstance = options.featureFlags || server.featureFlags
    logger.info({
      message: `Starting form data migration. Feature flag enabled: ${featureFlagsInstance.isFormsDataMigrationEnabled()}`
    })

    if (featureFlagsInstance.isFormsDataMigrationEnabled()) {
      const lock = await server.locker.lock('forms-data-migration')
      if (!lock) {
        logger.info({
          message: 'Unable to obtain lock, skipping running form data migration'
        })
        return
      }
      try {
        const formSubmissionsRepository = createFormSubmissionsRepository(
          server.db
        )()
        const organisationsRepository = createOrganisationsRepository(
          server.db
        )()

        const formsDataMigration = createFormDataMigrator(
          formSubmissionsRepository,
          organisationsRepository
        )

        await formsDataMigration.migrate()

        logger.info({ message: `Form data migration completed successfully` })
      } finally {
        await lock.free()
      }
    }
  } catch (error) {
    logger.error(error, 'Failed to run form data migration')
  }
}
