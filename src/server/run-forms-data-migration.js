import { logger } from '#common/helpers/logging/logger.js'
import { migrateFormsData } from '../forms-submission-data/migrate-forms-data.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'

export const runFormsDataMigration = async (server, options = {}) => {
  try {
    const featureFlagsInstance = options.featureFlags || server.featureFlags
    logger.info(
      `Starting form data migration. Feature flag enabled: ${featureFlagsInstance.isFormsDataMigrationEnabled()}`
    )

    if (featureFlagsInstance.isFormsDataMigrationEnabled()) {
      const formSubmissionsRepository = createFormSubmissionsRepository(
        server.db
      )(logger)
      const organisationsRepository = createOrganisationsRepository(server.db)(
        logger
      )

      const stats = await migrateFormsData(
        formSubmissionsRepository,
        organisationsRepository
      )

      logger.info('Form data migration completed successfully', stats)
    }
  } catch (error) {
    logger.error(error, 'Failed to run form data migration')
  }
}
