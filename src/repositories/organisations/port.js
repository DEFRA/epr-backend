/**
 * @typedef {Object} Accreditation
 * @property {string} id
 * @property {number} accreditationNumber
 * @property {string} material
 * @property {string} wasteProcessingType
 */

/**
 * @typedef {Object} Registration
 * @property {string} id
 * @property {string} orgName
 * @property {string} material
 * @property {string} wasteProcessingType
 * @property {string} wasteRegistrationNumber
 * @property {string} [accreditationId]
 * @property {Accreditation} [accreditation] - Hydrated accreditation object when accreditationId exists
 */

/**
 * @typedef {Object} OrganisationsRepository
 * @property {(organisation: Object) => Promise<void>} insert
 * @property {(id: string, version: number, updates: Object) => Promise<void>} update
 * @property {(organisation: Object) => Promise<{action: 'inserted'|'updated'|'unchanged', id: string}>} upsert
 * @property {() => Promise<Object[]>} findAll
 * @property {(id: string, minimumVersion?: number) => Promise<Object|null>} findById
 * @property {(organisationId: string, registrationId: string, minimumOrgVersion?: number) => Promise<Registration|null>} findRegistrationById
 */

/**
 * @typedef {() => OrganisationsRepository} OrganisationsRepositoryFactory
 */
