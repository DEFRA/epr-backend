import { logger } from '#common/helpers/logging/logger.js'
import { RegistrationContactsMigrationOrchestrator } from '#formsubmission/registration-contacts-migration/registration-contacts-migration-orchestrator.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'

export const runRegistrationContactsMigration = async (server) => {
  try {
    logger.info({ message: 'Starting registration contacts migration' })

    const lock = await server.locker.lock('fix-registration-contacts')
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping registration contacts migration'
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

      const orchestrator = new RegistrationContactsMigrationOrchestrator(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      await orchestrator.migrate(
        server.featureFlags.isRegistrationContactsMigrationEnabled()
      )

      logger.info({
        message: 'Registration contacts migration completed successfully'
      })
    } finally {
      await lock?.free()
    }
  } catch (error) {
    logger.error({
      message: 'Failed to run registration contacts migration',
      err: error
    })
  }
}
