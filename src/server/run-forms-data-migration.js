import { logger } from '#common/helpers/logging/logger.js'
import { createFormDataMigrator } from '#formsubmission/migration/migration-orchestrator.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createFormsFileUploadsRepository } from '#adapters/repositories/forms-submissions/forms-file-uploads.js'
import { config } from '../config.js'

export const runFormsDataMigration = async (server) => {
  try {
    logger.info({
      message: 'Starting form data migration'
    })

    const lock = await server.locker.lock('forms-data-migration')
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping running form data migration'
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

      const s3Client = createS3Client({
        region: config.get('awsRegion'),
        endpoint: config.get('s3Endpoint'),
        forcePathStyle: config.get('isDevelopment')
      })
      const formsFileUploadsRepository = createFormsFileUploadsRepository({
        s3Client
      })

      const formsDataMigration = createFormDataMigrator(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository,
        formsFileUploadsRepository
      )

      await formsDataMigration.migrate()

      logger.info({ message: 'Form data migration completed successfully' })
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({ message: 'Failed to run form data migration', err: error })
  }
}
