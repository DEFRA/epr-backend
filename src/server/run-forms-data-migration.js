import { logger } from '#common/helpers/logging/logger.js'
import { createFormDataMigrator } from '#formsubmission/plugin.js'

/** @import { StartedServer } from '#common/hapi-types.js' */

/**
 * @param {StartedServer} server
 */
export const runFormsDataMigration = async (server) => {
  try {
    logger.info({
      message: 'Starting form data migration'
    })

    const {
      formSubmissionsRepository,
      formsFileUploadsRepository,
      organisationAdministrationRepository,
      systemLogsRepository
    } = server.app
    const missing = Object.entries({
      formSubmissionsRepository,
      formsFileUploadsRepository,
      organisationAdministrationRepository,
      systemLogsRepository
    })
      .filter(([, repository]) => !repository)
      .map(([name]) => name)
    if (missing.length > 0) {
      throw new Error(`The server has not registered ${missing.join(', ')}`)
    }

    const lock = await server.locker.lock('forms-data-migration')
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping running form data migration'
      })
      return
    }
    try {
      const formsDataMigration = createFormDataMigrator(
        formSubmissionsRepository,
        organisationAdministrationRepository,
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
