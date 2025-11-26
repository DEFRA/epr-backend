/**
 * @typedef {Object} AccreditationBase
 * @property {string} id
 * @property {string} material
 * @property {string} wasteProcessingType
 * @property {Date} formSubmissionTime
 * @property {string} submittedToRegulator
 */

/**
 * @typedef {AccreditationBase & {status: 'approved'|'suspended', accreditationNumber: string, validFrom: Date, validTo: Date}} AccreditationApproved
 */

/**
 * @typedef {AccreditationBase & {status: 'created'|'rejected'|'archived', accreditationNumber?: string, validFrom?: Date, validTo?: Date}} AccreditationOther
 */

/**
 * @typedef {AccreditationApproved | AccreditationOther} Accreditation
 */

/**
 * @typedef {Object} RegistrationBase
 * @property {string} id
 * @property {string} orgName
 * @property {string} material
 * @property {string} wasteProcessingType
 * @property {Date} formSubmissionTime
 * @property {string} submittedToRegulator
 * @property {string} [accreditationId]
 * @property {Accreditation} [accreditation] - Hydrated accreditation object when accreditationId exists
 */

/**
 * @typedef {RegistrationBase & {status: 'approved'|'suspended', cbduNumber: string, validFrom: Date, validTo: Date}} RegistrationApproved
 */

/**
 * @typedef {RegistrationBase & {status: 'created'|'rejected'|'archived', cbduNumber?: string, validFrom?: Date, validTo?: Date}} RegistrationOther
 */

/**
 * @typedef {RegistrationApproved | RegistrationOther} Registration
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

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
