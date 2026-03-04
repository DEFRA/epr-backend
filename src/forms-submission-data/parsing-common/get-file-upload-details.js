import { config } from '../../config.js'
import { logger } from '#common/helpers/logging/logger.js'

const copyFilesUploadedFromDate = new Date(
  config.get('formsSubmissionApi.copyFilesUploadedFromDate')
)

function extractFilesFromSubmissions(submissions) {
  return submissions.flatMap((submission) => {
    const filesByField = submission.rawSubmissionData.data.files
    const formName = submission.rawSubmissionData.meta.definition.name
    const id = submission.id
    const orgId = submission.orgId

    if (!filesByField) {
      return []
    }

    return Object.values(filesByField).flatMap((fileArray) =>
      fileArray.map((file) => ({
        formName,
        fileId: file.fileId,
        id,
        orgId
      }))
    )
  })
}

/**
 * Get file upload details from registrations and accreditations
 * @param {Object} formSubmissionsRepository - Form submissions repository instance
 * @returns {Promise<Array<Object>>} Array of file upload details with fileId and formName
 */
export async function getUploadedFileInfo(formSubmissionsRepository) {
  logger.info({
    message: `Getting file upload details from cutoff date ${copyFilesUploadedFromDate}`
  })
  const registrations =
    await formSubmissionsRepository.findRegistrationsCreatedAfter(
      copyFilesUploadedFromDate
    )
  const registrationFiles = extractFilesFromSubmissions(registrations)
  logger.info({
    message: `Found ${registrationFiles.length} files uploaded from registrations`
  })

  const accreditations =
    await formSubmissionsRepository.findAccreditationsCreatedAfter(
      copyFilesUploadedFromDate
    )
  const accreditationFiles = extractFilesFromSubmissions(accreditations)
  logger.info({
    message: `Found ${accreditationFiles.length} files uploaded from accreditations`
  })
  return [...registrationFiles, ...accreditationFiles]
}
