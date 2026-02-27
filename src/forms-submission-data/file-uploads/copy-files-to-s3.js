import { getUploadedFileInfo } from '#formsubmission/parsing-common/get-file-upload-details.js'
import { extractAgencyCodeFromName } from '#formsubmission/parsing-common/parse-forms-data.js'
import { mapRegulator } from '#formsubmission/parsing-common/form-data-mapper.js'
import { logger } from '#common/helpers/logging/logger.js'

/**
 * Extract regulator from form name using extractAgencyCodeFromName
 *
 * @param {string} formName - Form name (e.g., "Registration Form (EA)")
 * @returns {import('#domain/organisations/model.js').RegulatorValue} Regulator enum value
 */
function extractRegulatorFromFormName(formName) {
  const agencyCode = extractAgencyCodeFromName(formName)

  if (!agencyCode) {
    throw new Error(`Cannot extract regulator from form name: ${formName}`)
  }

  return mapRegulator(agencyCode)
}

/**
 * Copy all form files to S3
 *
 * @param {Object} formSubmissionsRepository - Form submissions repository
 * @param {Object} formsFileUploadsRepository - Forms file uploads repository
 */
export async function copyAllFormFilesToS3(
  formSubmissionsRepository,
  formsFileUploadsRepository
) {
  logger.info({ message: 'Starting to copy form files to S3' })

  const uploadedFiles = await getUploadedFileInfo(formSubmissionsRepository)

  logger.info({
    message: `Found ${uploadedFiles.length} files to copy`,
    totalFiles: uploadedFiles.length
  })

  let failedCount = 0

  for (const file of uploadedFiles) {
    try {
      const regulator = extractRegulatorFromFormName(file.formName)
      await formsFileUploadsRepository.copyFormFileToS3({
        fileId: file.fileId,
        regulator
      })
    } catch (error) {
      failedCount++
      logger.error({
        err: error,
        message: `Failed to copy file - formName: ${file.formName}, submissionId: ${file.id}, fileId: ${file.fileId}, orgId: ${file.orgId}`
      })
    }
  }

  logger.info({
    message: `Finished copying form files to S3, total: ${uploadedFiles.length}, failed: ${failedCount}`
  })
}
