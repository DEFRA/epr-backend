import { logger } from '#common/helpers/logging/logger.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { getUploadedFileInfo } from '#formsubmission/parsing-common/get-file-upload-details.js'

const logFileDetails = async (server) => {
  const formSubmissionsRepository = (
    await createFormSubmissionsRepository(server.db, logger)
  )()

  const uploadedFiles = await getUploadedFileInfo(formSubmissionsRepository)
  logger.info({
    message: `Total files uploaded from registration and accreditation forms: ${uploadedFiles.length}`
  })
}

export const logFilesUploadedFromForms = async (server, options = {}) => {
  const featureFlagsInstance = options.featureFlags || server.featureFlags

  try {
    logger.info({
      message: `Starting logging of files uploaded from defra forms : ${featureFlagsInstance.isLogFileUploadsFromFormsEnabled()}`
    })

    if (!featureFlagsInstance.isLogFileUploadsFromFormsEnabled()) {
      logger.info({
        message:
          'Feature flag disabled, skipping logging of files uploaded from defra forms'
      })
      return
    }
    await logFileDetails(server)
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run logging of files uploaded from defra forms'
    })
  }
}
