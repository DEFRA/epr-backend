import { logger } from '#common/helpers/logging/logger.js'

function extractFilesFromSubmission(submission) {
  const regulator = submission.submittedToRegulator
  return [
    ...(submission.samplingInspectionPlanPart1FileUploads ?? []),
    ...(submission.samplingInspectionPlanPart2FileUploads ?? []),
    ...(submission.orsFileUploads ?? [])
  ].map((f) => ({ fileId: f.defraFormUploadedFileId, regulator }))
}

/**
 * Copy uploaded files for newly migrated reg/acc submissions.
 * Errors are logged but do not abort processing.
 *
 * @param {Array} registrations - Transformed registration objects
 * @param {Array} accreditations - Transformed accreditation objects
 * @param {object} formsFileUploadsRepository
 */
export async function copyOperatorUploadedFiles(
  registrations,
  accreditations,
  formsFileUploadsRepository
) {
  const filesToCopy = [...registrations, ...accreditations].flatMap(
    extractFilesFromSubmission
  )

  logger.info({
    message: `Copying ${filesToCopy.length} operator uploaded files for ${registrations.length} registrations and ${accreditations.length} accreditations`
  })

  let failedCount = 0
  for (const { fileId, regulator } of filesToCopy) {
    try {
      await formsFileUploadsRepository.copyFormFileToS3({ fileId, regulator })
    } catch (error) {
      failedCount++
      logger.error({
        err: error,
        message: `Failed to copy operator uploaded file — fileId: ${fileId}`
      })
    }
  }

  logger.info({
    message: `Finished copying operator uploaded files, total: ${filesToCopy.length}, failed: ${failedCount}`
  })
}
