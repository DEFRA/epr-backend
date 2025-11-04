import { logger } from '#common/helpers/logging/logger.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { getUploadedFileInfo } from '../forms-submission-data/get-file-upload-details.js'

const logFileDetails = async (server) => {
  const formSubmissionsRepository = createFormSubmissionsRepository(server.db)()

  const uploadedFiles = await getUploadedFileInfo(formSubmissionsRepository)
  logger.info(
    `Total files uploaded from registration and accreditation forms ${uploadedFiles.length}`
  )
  for (const file of uploadedFiles) {
    logger.info(`${file.formName},${file.id},${file.fileId}`)
  }
}

export const logFilesUploadedFromForms = async (server, options = {}) => {
  const featureFlagsInstance = options.featureFlags || server.featureFlags

  try {
    logger.info(
      `Starting logging of files uploaded from defra forms : ${featureFlagsInstance.isLogFileUploadsFromFormsEnabled()}`
    )

    if (!featureFlagsInstance.isLogFileUploadsFromFormsEnabled()) {
      logger.info(
        'Feature flag disabled, skipping logging of files uploaded from defra forms'
      )
      return
    }
    await logFileDetails(server)
  } catch (error) {
    logger.error(
      error,
      'Failed to run logging of files uploaded from defra forms'
    )
  }
}
