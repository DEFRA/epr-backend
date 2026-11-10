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
