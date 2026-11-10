/**
 * @param {{ organisationId: string, registrationId: string }} ids
 * @returns {string}
 */
export const summaryLogUploadPath = ({ organisationId, registrationId }) =>
  `/organisations/${organisationId}/registrations/${registrationId}`

/**
 * @param {string} importId
 * @returns {string}
 */
export const orsImportUploadPath = (importId) =>
  `/overseas-sites/imports/${importId}`

/**
 * @param {{ s3Bucket?: string, s3Key?: string }} file
 * @param {{ bucket: string, path: string }} location
 * @returns {boolean}
 */
export const isUploadedTo = ({ s3Bucket, s3Key }, { bucket, path }) =>
  s3Bucket === bucket && Boolean(s3Key?.startsWith(`${path}/`))
