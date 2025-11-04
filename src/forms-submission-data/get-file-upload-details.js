function extractFilesFromSubmissions(submissions) {
  return submissions.flatMap((submission) => {
    const filesByField = submission?.rawSubmissionData?.data?.files
    const formName = submission?.rawSubmissionData?.meta?.definition?.name
    const id = submission?.id

    if (!filesByField) {
      return []
    }

    return Object.values(filesByField).flatMap((fileArray) =>
      fileArray.map((file) => ({
        formName,
        fileId: file.fileId,
        id
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
  const registrations = await formSubmissionsRepository.findAllRegistrations()
  const registrationFiles = extractFilesFromSubmissions(registrations)

  const accreditations = await formSubmissionsRepository.findAllAccreditations()
  const accreditationFiles = extractFilesFromSubmissions(accreditations)

  return [...registrationFiles, ...accreditationFiles]
}
