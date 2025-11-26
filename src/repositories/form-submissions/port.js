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
 * @property {(id: string) => Promise<AccreditationFormSubmission | null>} findAccreditationById
 * @property {(id: string) => Promise<AccreditationFormSubmission[]>} findAccreditationsBySystemReference
 * @property {() => Promise<RegistrationFormSubmission[]>} findAllRegistrations
 * @property {(id: string) => Promise<RegistrationFormSubmission | null>} findRegistrationById
 * @property {(id: string) => Promise<RegistrationFormSubmission[]>} findRegistrationsBySystemReference
 * @property {() => Promise<OrganisationFormSubmission[]>} findAllOrganisations - Find all organisations
 * @property {(id: string) => Promise<OrganisationFormSubmission | null>} findOrganisationById
 */

/**
 * @typedef {() => FormSubmissionsRepository} FormSubmissionsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
