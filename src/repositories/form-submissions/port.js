/**
 * @typedef {Object} AccreditationFormSubmission
 * @property {string} id - Document ID
 * @property {number} orgId - Organisation ID
 * @property {string} referenceNumber - Reference number
 * @property {Object} rawSubmissionData - Raw form submission data
 */

/**
 * @typedef {Object} RegistrationFormSubmission
 * @property {string} id - Document ID
 * @property {number} orgId - Organisation ID
 * @property {string} referenceNumber - Reference number
 * @property {Object} rawSubmissionData - Raw form submission data
 */

/**
 * @typedef {Object} OrganisationFormSubmission
 * @property {string} id - Document ID
 * @property {number} orgId - Organisation ID
 * @property {Object} rawSubmissionData - Raw form submission data
 */

/**
 * @typedef {Object} FormSubmissionsRepository
 * @property {() => Promise<AccreditationFormSubmission[]>} findAllAccreditations
 * @property {() => Promise<RegistrationFormSubmission[]>} findAllRegistrations
 * @property {() => Promise<OrganisationFormSubmission[]>} findAllOrganisations - Find all organisations
 */

/**
 * @typedef {() => FormSubmissionsRepository} FormSubmissionsRepositoryFactory
 */
