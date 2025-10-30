/**
 * @typedef {Object} AccreditationData
 * @property {number} orgId
 * @property {string} referenceNumber
 * @property {Object} answers
 * @property {Object} rawSubmissionData
 */

/**
 * @typedef {Object} RegistrationData
 * @property {number} orgId
 * @property {string} referenceNumber
 * @property {Object} answers
 * @property {Object} rawSubmissionData
 */

/**
 * @typedef {Object} OrganisationData
 * @property {number} orgId
 * @property {string} orgName
 * @property {string} email
 * @property {string[]|null} nations
 * @property {Object} answers
 * @property {Object} rawSubmissionData
 */

/**
 * @typedef {Object} OrganisationInsertResult
 * @property {number} orgId
 * @property {string} referenceNumber - The MongoDB insertedId as a string
 */

/**
 * @typedef {Object} ApplicationsRepository
 * @property {(data: AccreditationData) => Promise<void>} insertAccreditation
 * @property {(data: RegistrationData) => Promise<void>} insertRegistration
 * @property {(data: OrganisationData) => Promise<OrganisationInsertResult>} insertOrganisation
 */

/**
 * @typedef {(logger: import('#common/helpers/logging/logger.js').TypedLogger) => ApplicationsRepository} ApplicationsRepositoryFactory
 */
