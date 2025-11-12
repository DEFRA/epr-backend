/**
 * @typedef {Object} AccreditationBase
 * @property {string} id
 * @property {string} material
 * @property {string} wasteProcessingType
 * @property {Date} formSubmissionTime
 * @property {string} submittedToRegulator
 */

/**
 * @typedef {AccreditationBase & {status: 'approved', accreditationNumber: string}} ApprovedAccreditation
 */

/**
 * @typedef {AccreditationBase & {status: 'created'|'rejected'|'suspended'|'archived', accreditationNumber?: string}} NonApprovedAccreditation
 */

/**
 * @typedef {ApprovedAccreditation | NonApprovedAccreditation} Accreditation
 */

/**
 * @typedef {Object} RegistrationBase
 * @property {string} id
 * @property {string} orgName
 * @property {string} material
 * @property {string} wasteProcessingType
 * @property {string} [wasteRegistrationNumber]
 * @property {Date} formSubmissionTime
 * @property {string} submittedToRegulator
 * @property {string} [accreditationId]
 * @property {Accreditation} [accreditation] - Hydrated accreditation object when accreditationId exists
 */

/**
 * @typedef {RegistrationBase & {status: 'approved', registrationNumber: string}} ApprovedRegistration
 */

/**
 * @typedef {RegistrationBase & {status: 'created'|'rejected'|'suspended'|'archived', registrationNumber?: string}} NonApprovedRegistration
 */

/**
 * @typedef {ApprovedRegistration | NonApprovedRegistration} Registration
 */

/**
 * @typedef {Object} UpsertResult
 * @property {'inserted'|'updated'|'unchanged'} action
 * @property {string} id
 */

/**
 * @typedef {Object} OrganisationsRepository
 * @property {(organisation: Object) => Promise<void>} insert
 * @property {(id: string, version: number, updates: Object) => Promise<void>} update
 * @property {(organisation: Object) => Promise<UpsertResult>} upsert
 * @property {() => Promise<Object[]>} findAll
 * @property {(id: string, minimumVersion?: number) => Promise<Object|null>} findById
 * @property {(organisationId: string, registrationId: string, minimumOrgVersion?: number) => Promise<Registration|null>} findRegistrationById
 */

/**
 * @typedef {() => OrganisationsRepository} OrganisationsRepositoryFactory
 */
