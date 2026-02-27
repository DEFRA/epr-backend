import { logger } from '#common/helpers/logging/logger.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { copyAllFormFilesToS3 } from '#formsubmission/file-uploads/copy-files-to-s3.js'
import { createFormsFileUploadsRepository } from '#adapters/repositories/forms-submissions/forms-file-uploads.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { config } from '../config.js'

/**
 * Copy all form files to S3 (migration task)
 *
 * @param {Object} server - Hapi server instance
 * @param {Object} [options] - Optional configuration
 * @param {Object} [options.featureFlags] - Feature flags instance (for testing)
 * @returns {Promise<void>}
 */
export const copyFormFilesToS3 = async (server, options = {}) => {
  try {
    const featureFlagsInstance = options.featureFlags || server.featureFlags

    logger.info({
      message: `Starting copy of form files to S3. Feature flag enabled: ${featureFlagsInstance.isCopyFormFilesToS3Enabled()}`
    })

    if (!featureFlagsInstance.isCopyFormFilesToS3Enabled()) {
      logger.info({
        message: 'Feature flag disabled, skipping copy of form files to S3'
      })
      return
    }

    const lock = await server.locker.lock('copy-form-files-to-s3')
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping copy of form files to S3'
      })
      return
    }

    try {
      const s3Client = createS3Client({
        region: config.get('awsRegion'),
        endpoint: config.get('s3Endpoint'),
        forcePathStyle: config.get('isDevelopment')
      })

      const formSubmissionsRepository = (
        await createFormSubmissionsRepository(server.db, logger)
      )()

      const formsFileUploadsRepository = createFormsFileUploadsRepository({
        s3Client
      })

      await copyAllFormFilesToS3(
        formSubmissionsRepository,
        formsFileUploadsRepository
      )

      logger.info({
        message: 'Copy of form files to S3 completed successfully'
      })
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to copy form files to S3'
    })
  }
}
